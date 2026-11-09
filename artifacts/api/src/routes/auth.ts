import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { and, eq, isNull, or } from "drizzle-orm";
import { db, usersTable, companiesTable, companyBrandingTable, passwordResetsTable, magicLinksTable, teamInvitesTable, type User } from "@workspace/db";
import { LoginBody, ForgotPasswordBody, ResetPasswordBody, MagicLinkRequestBody, MagicLinkVerifyBody, AcceptInviteBody, ChangePasswordBody, normalizePerms, type Role } from "@workspace/shared";
import { authMiddleware, signToken, SUSPENDED_COMPANY_ERROR, DEACTIVATED_USER_ERROR } from "../lib/auth";
import { hashToken, newToken } from "../lib/tokens";
import { button, heading, paragraph, escapeHtml, PLATFORM_LETTERHEAD } from "../lib/email";
import { sendAccountMail } from "../lib/companyMail";
import { letterheadFor } from "../lib/letterhead";
import { companyBaseUrl, platformBaseUrl } from "../lib/urls";
import { env } from "../env";
import { audit } from "../lib/audit";

const router: IRouter = Router();

const RESET_TTL_MS = 60 * 60 * 1000;
const MAGIC_TTL_MS = 15 * 60 * 1000;

async function userPayload(user: User) {
  let company: { id: number; name: string; slug: string; plan: string; status: string } | null = null;
  if (user.companyId) {
    const [c] = await db.select().from(companiesTable).where(eq(companiesTable.id, user.companyId)).limit(1);
    if (c) company = { id: c.id, name: c.name, slug: c.slug, plan: c.plan, status: c.status };
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    companyId: user.companyId,
    company,
    perms: user.perms,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    hasPassword: Boolean(user.passwordHash),
    createdAt: user.createdAt.toISOString(),
  };
}

/** Where a sign-in link for this person should point: their company's door, or the platform's. */
async function baseUrlForUser(user: Pick<User, "companyId">): Promise<string> {
  if (!user.companyId) return platformBaseUrl();
  const [c] = await db.select().from(companiesTable).where(eq(companiesTable.id, user.companyId)).limit(1);
  return c ? await companyBaseUrl(c) : platformBaseUrl();
}

function devLink(url: string): { devLink?: string } {
  return !env.isProduction && !env.sendgridApiKey ? { devLink: url } : {};
}

// ---------------------------------------------------------------------------
// Staff sign-in (email or username + password)
// ---------------------------------------------------------------------------

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter your email (or username) and password." });
    return;
  }
  const identifier = parsed.data.identifier.toLowerCase();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(or(eq(usersTable.email, identifier), eq(usersTable.username, identifier)))
    .limit(1);
  const invalid = () => res.status(401).json({ error: "Invalid credentials" });
  if (!user || !user.passwordHash) {
    // Constant-ish time: still hash so a missing account is not faster.
    await bcrypt.compare(parsed.data.password, "$2a$10$CwTycUXWue0Thq9StjUM0uJ8Z6b2nJfY4M7bq0Kq1Y1eZkq8Yc1Ue");
    invalid();
    return;
  }
  if (user.deactivatedAt) {
    res.status(403).json({ error: DEACTIVATED_USER_ERROR });
    return;
  }
  if (user.role === "client") {
    res.status(403).json({ error: "Clients sign in with a secure link. Use the client sign-in page.", clientDoor: true });
    return;
  }
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    invalid();
    return;
  }
  if (user.companyId && user.role !== "super_admin") {
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, user.companyId)).limit(1);
    if (company?.status === "suspended") {
      res.status(403).json({ error: SUSPENDED_COMPANY_ERROR });
      return;
    }
  }
  // A company door only admits that company's staff (and the super admin). The platform door admits anyone on staff.
  const tenant = req.tenant;
  if (tenant?.kind === "company" && user.role !== "super_admin" && user.companyId !== tenant.company.id) {
    invalid();
    return;
  }
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  const { token, expiresIn } = signToken({ userId: user.id, email: user.email, role: user.role, companyId: user.companyId });
  res.json({ token, expiresIn, user: await userPayload(user) });
});

router.get("/auth/me", authMiddleware, async (req, res) => {
  res.json(await userPayload(req.currentUser!));
});

router.post("/auth/change-password", authMiddleware, async (req, res) => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const user = req.currentUser!;
  if (user.passwordHash && !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }
  await db.update(usersTable).set({ passwordHash: await bcrypt.hash(parsed.data.newPassword, 10), updatedAt: new Date() }).where(eq(usersTable.id, user.id));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Forgot / reset password (staff). Never reveals whether an account exists.
// ---------------------------------------------------------------------------

router.post("/auth/forgot", async (req, res) => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  const generic = { ok: true, message: "If that address has an account, a reset link is on its way." };
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email)).limit(1);
  if (!user || user.deactivatedAt || user.role === "client") {
    res.json(generic);
    return;
  }
  await db.update(passwordResetsTable).set({ usedAt: new Date() }).where(and(eq(passwordResetsTable.userId, user.id), isNull(passwordResetsTable.usedAt)));
  const { token, hash } = newToken();
  await db.insert(passwordResetsTable).values({ userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_TTL_MS), requestedIp: req.ip ?? null });
  const url = `${await baseUrlForUser(user)}/reset-password?token=${token}`;
  const lh = await letterheadFor(user.companyId);
  await sendAccountMail(user.companyId, {
    to: user.email,
    subject: `Reset your ${lh.name} password`,
    template: "password_reset",
    actionUrl: url,
    body: heading("Reset your password") + paragraph(`Hi ${escapeHtml(user.name)}, use the button below to choose a new password. The link works once and expires in 60 minutes.`) + button(url, "Choose a new password", lh.primaryColor) + paragraph("If you didn't ask for this, you can ignore this email."),
  });
  res.json({ ...generic, ...devLink(url) });
});

router.post("/auth/reset", async (req, res) => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const outcome = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(passwordResetsTable).where(eq(passwordResetsTable.tokenHash, hashToken(parsed.data.token))).for("update").limit(1);
    if (!row) return { ok: false as const, reason: "invalid" };
    if (row.usedAt) return { ok: false as const, reason: "used" };
    if (row.expiresAt.getTime() < Date.now()) return { ok: false as const, reason: "expired" };
    const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, row.userId)).limit(1);
    if (!user || user.deactivatedAt) return { ok: false as const, reason: "invalid" };
    await tx.update(usersTable).set({ passwordHash: await bcrypt.hash(parsed.data.password, 10), updatedAt: new Date() }).where(eq(usersTable.id, user.id));
    await tx.update(passwordResetsTable).set({ usedAt: new Date() }).where(eq(passwordResetsTable.id, row.id));
    return { ok: true as const, user };
  });
  if (!outcome.ok) {
    const messages: Record<string, string> = { invalid: "This reset link is not valid.", used: "This reset link has already been used.", expired: "This reset link has expired. Request a new one." };
    res.status(400).json({ error: messages[outcome.reason] ?? "Invalid reset link", reason: outcome.reason });
    return;
  }
  const { token, expiresIn } = signToken({ userId: outcome.user.id, email: outcome.user.email, role: outcome.user.role, companyId: outcome.user.companyId });
  res.json({ token, expiresIn, user: await userPayload(outcome.user) });
});

// ---------------------------------------------------------------------------
// Client sign-in: magic link
// ---------------------------------------------------------------------------

router.post("/auth/magic-link", async (req, res) => {
  const parsed = MagicLinkRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  const generic = { ok: true, message: "If that address belongs to a client, a sign-in link is on its way." };
  const tenant = req.tenant;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email)).limit(1);
  // The client door belongs to a company; a client of another company gets the same generic answer.
  if (!user || user.deactivatedAt || user.role !== "client" || (tenant?.kind === "company" && user.companyId !== tenant.company.id)) {
    res.json(generic);
    return;
  }
  await db.update(magicLinksTable).set({ usedAt: new Date() }).where(and(eq(magicLinksTable.userId, user.id), isNull(magicLinksTable.usedAt)));
  const { token, hash } = newToken();
  await db.insert(magicLinksTable).values({ userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + MAGIC_TTL_MS), requestedIp: req.ip ?? null });
  const url = `${await baseUrlForUser(user)}/client/verify?token=${token}`;
  const lh = await letterheadFor(user.companyId);
  await sendAccountMail(user.companyId, {
    to: user.email,
    subject: `Your ${lh.name} sign-in link`,
    template: "magic_link",
    actionUrl: url,
    body: heading("Sign in to your portal") + paragraph(`Hi ${escapeHtml(user.name)}, tap the button to open your client portal. The link works once and expires in 15 minutes.`) + button(url, "Open my portal", lh.primaryColor),
  });
  res.json({ ...generic, ...devLink(url) });
});

router.post("/auth/magic-link/verify", async (req, res) => {
  const parsed = MagicLinkVerifyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid link" });
    return;
  }
  const outcome = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(magicLinksTable).where(eq(magicLinksTable.tokenHash, hashToken(parsed.data.token))).for("update").limit(1);
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return null;
    const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, row.userId)).limit(1);
    if (!user || user.deactivatedAt) return null;
    await tx.update(magicLinksTable).set({ usedAt: new Date() }).where(eq(magicLinksTable.id, row.id));
    await tx.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
    return user;
  });
  if (!outcome) {
    res.status(400).json({ error: "This sign-in link is invalid or has expired. Request a new one." });
    return;
  }
  const { token, expiresIn } = signToken({ userId: outcome.id, email: outcome.email, role: outcome.role, companyId: outcome.companyId });
  res.json({ token, expiresIn, user: await userPayload(outcome) });
});

// ---------------------------------------------------------------------------
// Invitations (accept). Creation lives in routes/team.ts and Platform Admin.
// ---------------------------------------------------------------------------

router.get("/auth/invites/:token", async (req, res) => {
  const [invite] = await db.select().from(teamInvitesTable).where(eq(teamInvitesTable.tokenHash, hashToken(String(req.params.token)))).limit(1);
  if (!invite) {
    res.status(404).json({ error: "This invitation link is not valid." });
    return;
  }
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, invite.companyId)).limit(1);
  const [branding] = await db.select().from(companyBrandingTable).where(eq(companyBrandingTable.companyId, invite.companyId)).limit(1);
  const state = invite.revokedAt ? "revoked" : invite.acceptedAt ? "accepted" : invite.expiresAt.getTime() < Date.now() ? "expired" : "pending";
  res.json({
    state,
    email: invite.email,
    name: invite.name,
    role: invite.role,
    company: company ? { id: company.id, name: company.name, slug: company.slug } : null,
    branding: branding ? { companyName: branding.companyName || company?.name, logoUrl: branding.logoUrl, primaryColor: branding.primaryColor, accentColor: branding.accentColor } : null,
  });
});

router.post("/auth/invites/accept", async (req, res) => {
  const parsed = AcceptInviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const outcome = await db.transaction(async (tx) => {
    const [invite] = await tx.select().from(teamInvitesTable).where(eq(teamInvitesTable.tokenHash, hashToken(parsed.data.token))).for("update").limit(1);
    if (!invite) return { ok: false as const, error: "This invitation link is not valid." };
    if (invite.revokedAt) return { ok: false as const, error: "This invitation was revoked." };
    if (invite.acceptedAt) return { ok: false as const, error: "This invitation has already been used. Sign in instead." };
    if (invite.expiresAt.getTime() < Date.now()) return { ok: false as const, error: "This invitation has expired. Ask for a new one." };
    const role = invite.role as Role;
    const perms = normalizePerms(invite.perms, role);
    const [existing] = await tx.select().from(usersTable).where(eq(usersTable.email, invite.email)).limit(1);
    let user: User;
    if (existing) {
      if (existing.companyId && existing.companyId !== invite.companyId) return { ok: false as const, error: "This email already belongs to another company's account." };
      [user] = await tx
        .update(usersTable)
        .set({ name: parsed.data.name, passwordHash, role, perms, companyId: invite.companyId, deactivatedAt: null, lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(usersTable.id, existing.id))
        .returning();
    } else {
      [user] = await tx.insert(usersTable).values({ name: parsed.data.name, email: invite.email, passwordHash, role, perms, companyId: invite.companyId, lastLoginAt: new Date() }).returning();
    }
    await tx.update(teamInvitesTable).set({ acceptedAt: new Date(), status: "accepted" }).where(eq(teamInvitesTable.id, invite.id));
    return { ok: true as const, user };
  });
  if (!outcome.ok) {
    res.status(400).json({ error: outcome.error });
    return;
  }
  await audit(req, { action: "invite_accepted", resourceType: "user", resourceId: outcome.user.id, companyId: outcome.user.companyId, details: { email: outcome.user.email, role: outcome.user.role } });
  const { token, expiresIn } = signToken({ userId: outcome.user.id, email: outcome.user.email, role: outcome.user.role, companyId: outcome.user.companyId });
  res.json({ token, expiresIn, user: await userPayload(outcome.user) });
});

export { PLATFORM_LETTERHEAD };
export default router;
