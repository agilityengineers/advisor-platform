import { Router, type IRouter } from "express";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db, usersTable, teamInvitesTable, type Company } from "@workspace/db";
import { CreateInviteBody, UpdateMemberBody, normalizePerms, type Role } from "@workspace/shared";
import { authMiddleware, requireCompany, requirePermission } from "../lib/auth";
import { requireFeature } from "../lib/features";
import { inviteLimiter } from "../lib/rateLimit";
import { newToken } from "../lib/tokens";
import { sendEmail, renderEmail, heading, paragraph, button, escapeHtml } from "../lib/email";
import { letterheadFor } from "../lib/letterhead";
import { sendCompanyMail } from "../lib/companyMail";
import { companyBaseUrl } from "../lib/urls";
import { audit } from "../lib/audit";
import { env } from "../env";

const router: IRouter = Router();
const INVITE_TTL_DAYS = 7;

function memberView(u: typeof usersTable.$inferSelect) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, perms: u.perms, hasPassword: Boolean(u.passwordHash), lastLoginAt: u.lastLoginAt, deactivatedAt: u.deactivatedAt, createdAt: u.createdAt };
}

/**
 * Create and email an invitation. Shared by the company Team tab and by
 * Platform Admin (first Admin of a new company). The platform sends its own
 * invites from `partner@`; a company's invites wear that company's letterhead.
 */
export async function createInvite(opts: {
  company: Company;
  email: string;
  name?: string;
  role: "admin" | "manager" | "advisor";
  perms?: Record<string, unknown>;
  invitedBy: number | null;
  sender: "platform" | "company";
}): Promise<{ inviteId: number; acceptUrl: string; emailed: boolean; devLink?: string }> {
  const email = opts.email.toLowerCase().trim();
  // One live invite per address per company: revoke the older ones.
  await db.update(teamInvitesTable).set({ revokedAt: new Date(), status: "revoked" }).where(and(eq(teamInvitesTable.companyId, opts.company.id), eq(teamInvitesTable.email, email), isNull(teamInvitesTable.acceptedAt), isNull(teamInvitesTable.revokedAt)));
  const { token, hash } = newToken();
  const [invite] = await db
    .insert(teamInvitesTable)
    .values({ companyId: opts.company.id, email, name: opts.name ?? "", role: opts.role, perms: normalizePerms(opts.perms, opts.role), tokenHash: hash, invitedBy: opts.invitedBy, expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000) })
    .returning();
  const acceptUrl = `${await companyBaseUrl(opts.company)}/accept-invite?token=${token}`;
  const lh = opts.sender === "platform" ? { name: "Advisor Platform", primaryColor: "#13231C", logoUrl: null } : await letterheadFor(opts.company.id);
  const roleLabel = opts.role === "admin" ? "Admin" : opts.role === "manager" ? "Manager" : "Client advisor";
  const subject = opts.sender === "platform" ? `You're invited to run ${opts.company.name} on Advisor Platform` : `You're invited to join ${lh.name}`;
  const body =
    heading(opts.sender === "platform" ? `Your ${opts.company.name} console is ready` : `Join ${lh.name} as ${roleLabel}`) +
    paragraph(opts.name ? `Hi ${escapeHtml(opts.name)},` : "Hello,") +
    paragraph(opts.sender === "platform" ? `Clarence has set up <strong>${escapeHtml(opts.company.name)}</strong> on Advisor Platform and made you its Admin. Accept the invitation to choose a password and open your console.` : `You've been invited to join <strong>${escapeHtml(lh.name)}</strong> as ${roleLabel}. Accept the invitation to choose a password.`) +
    button(acceptUrl, "Accept invitation", lh.primaryColor) +
    paragraph(`This link expires in ${INVITE_TTL_DAYS} days.`);
  // The platform's own invite (first Admin of a new company) comes from the platform; a company inviting its staff sends from its no-reply address.
  const result =
    opts.sender === "platform"
      ? await sendEmail({ to: email, subject, template: "team_invite", companyId: opts.company.id, sender: "platform", actionUrl: acceptUrl, html: renderEmail(lh, body) })
      : await sendCompanyMail(opts.company, { to: email, subject, template: "team_invite", actionUrl: acceptUrl, body, kind: "system" });
  return { inviteId: invite.id, acceptUrl, emailed: result.success, ...(result.notConfigured && !env.isProduction ? { devLink: acceptUrl } : {}) };
}

const teamGuard = [authMiddleware, requireCompany, requireFeature("team_management")] as const;

router.get("/companies/:companyId/team", ...teamGuard, requirePermission("team", "read"), async (req, res) => {
  const company = req.company!;
  const members = await db.select().from(usersTable).where(and(eq(usersTable.companyId, company.id), ne(usersTable.role, "client"))).orderBy(usersTable.createdAt);
  const invites = await db
    .select()
    .from(teamInvitesTable)
    .where(and(eq(teamInvitesTable.companyId, company.id), isNull(teamInvitesTable.acceptedAt), isNull(teamInvitesTable.revokedAt)))
    .orderBy(desc(teamInvitesTable.createdAt));
  res.json({
    members: members.map(memberView),
    invites: invites.map((i) => ({ id: i.id, email: i.email, name: i.name, role: i.role, perms: i.perms, expiresAt: i.expiresAt, expired: i.expiresAt.getTime() < Date.now(), createdAt: i.createdAt })),
  });
});

router.post("/companies/:companyId/team/invites", ...teamGuard, requirePermission("team", "write"), inviteLimiter, async (req, res) => {
  const parsed = CreateInviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid invitation" });
    return;
  }
  const company = req.company!;
  // Only an Admin (or the super admin) may mint another Admin.
  if (parsed.data.role === "admin" && !["admin", "super_admin"].includes(req.user!.role)) {
    res.status(403).json({ error: "Only an Admin can invite another Admin" });
    return;
  }
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email)).limit(1);
  if (existing && existing.companyId && existing.companyId !== company.id) {
    res.status(409).json({ error: "That email already belongs to another company's account." });
    return;
  }
  if (existing && existing.companyId === company.id && existing.passwordHash && !existing.deactivatedAt) {
    res.status(409).json({ error: "That person is already on your team." });
    return;
  }
  const result = await createInvite({ company, email: parsed.data.email, name: parsed.data.name, role: parsed.data.role, perms: parsed.data.perms, invitedBy: req.user!.userId, sender: "company" });
  await audit(req, { action: "team_invite_sent", resourceType: "team_invite", resourceId: result.inviteId, details: { email: parsed.data.email, role: parsed.data.role } });
  res.status(201).json(result);
});

router.delete("/companies/:companyId/team/invites/:inviteId", ...teamGuard, requirePermission("team", "write"), async (req, res) => {
  const [invite] = await db.select().from(teamInvitesTable).where(and(eq(teamInvitesTable.id, Number(req.params.inviteId)), eq(teamInvitesTable.companyId, req.company!.id))).limit(1);
  if (!invite) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  await db.update(teamInvitesTable).set({ revokedAt: new Date(), status: "revoked" }).where(eq(teamInvitesTable.id, invite.id));
  res.json({ ok: true });
});

router.patch("/companies/:companyId/team/:userId", ...teamGuard, requirePermission("team", "write"), async (req, res) => {
  const parsed = UpdateMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const [member] = await db.select().from(usersTable).where(and(eq(usersTable.id, Number(req.params.userId)), eq(usersTable.companyId, req.company!.id))).limit(1);
  if (!member || member.role === "client") {
    res.status(404).json({ error: "Team member not found" });
    return;
  }
  if (parsed.data.role && parsed.data.role !== member.role && !["admin", "super_admin"].includes(req.user!.role)) {
    res.status(403).json({ error: "Only an Admin can change roles" });
    return;
  }
  const role = (parsed.data.role ?? member.role) as Role;
  const [updated] = await db
    .update(usersTable)
    .set({ role, perms: normalizePerms(parsed.data.perms ?? member.perms, role), name: parsed.data.name ?? member.name, updatedAt: new Date() })
    .where(eq(usersTable.id, member.id))
    .returning();
  await audit(req, { action: "team_member_updated", resourceType: "user", resourceId: member.id, details: { role: updated.role, perms: updated.perms } });
  res.json(memberView(updated));
});

router.delete("/companies/:companyId/team/:userId", ...teamGuard, requirePermission("team", "write"), async (req, res) => {
  const [member] = await db.select().from(usersTable).where(and(eq(usersTable.id, Number(req.params.userId)), eq(usersTable.companyId, req.company!.id))).limit(1);
  if (!member || member.role === "client") {
    res.status(404).json({ error: "Team member not found" });
    return;
  }
  if (member.id === req.user!.userId) {
    res.status(400).json({ error: "You cannot remove yourself" });
    return;
  }
  if (member.role === "admin" && req.user!.role !== "super_admin") {
    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.companyId, req.company!.id), eq(usersTable.role, "admin"), isNull(usersTable.deactivatedAt)));
    if (admins.length <= 1) {
      res.status(400).json({ error: "A company must keep at least one Admin" });
      return;
    }
  }
  await db.update(usersTable).set({ deactivatedAt: new Date(), updatedAt: new Date() }).where(eq(usersTable.id, member.id));
  await audit(req, { action: "team_member_deactivated", resourceType: "user", resourceId: member.id });
  res.json({ ok: true });
});

export default router;
