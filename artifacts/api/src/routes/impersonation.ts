import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, companiesTable, impersonationSessionsTable, usersTable } from "@workspace/db";
import { authMiddleware, requireSuperAdmin, signToken, type Impersonator } from "../lib/auth";
import { audit } from "../lib/audit";
import { sendEmail, renderEmail, heading, paragraph, escapeHtml, PLATFORM_LETTERHEAD } from "../lib/email";
import { logger } from "../lib/logger";
import { userPayload } from "./auth";

/**
 * Impersonation: the super admin signs in *as* a specific company user (Admin, Manager, Advisor)
 * or client to see exactly what they see and fix what they can't. Full access, with guard rails:
 * a written reason, a session that expires on its own, an email to the company's Admin, and an
 * audit entry for the start, the end, and every audited change made in between.
 */
const router: IRouter = Router();
const guard = [authMiddleware, requireSuperAdmin] as const;

export const IMPERSONATION_DEFAULT_MINUTES = 60;
export const IMPERSONATION_MAX_MINUTES = 120;

const ROLE_LABEL: Record<string, string> = { admin: "Admin", manager: "Manager", advisor: "Client advisor", client: "Client" };

const StartBody = z.object({
  userId: z.number().int().positive(),
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters (e.g. the support ticket or issue).").max(500),
  minutes: z.number().int().min(5).max(IMPERSONATION_MAX_MINUTES).optional(),
});

/** Everyone in a company the super admin can sign in as: staff first, then clients. */
router.get("/admin/companies/:companyId/people", ...guard, async (req, res) => {
  const companyId = Number(req.params.companyId);
  const [company] = Number.isInteger(companyId) && companyId > 0 ? await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1) : [];
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const rows = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, deactivatedAt: usersTable.deactivatedAt, lastLoginAt: usersTable.lastLoginAt, hasPassword: usersTable.passwordHash })
    .from(usersTable)
    .where(and(eq(usersTable.companyId, company.id), inArray(usersTable.role, ["admin", "manager", "advisor", "client"])))
    .orderBy(usersTable.createdAt);
  const order = { admin: 0, manager: 1, advisor: 2, client: 3 } as Record<string, number>;
  const people = rows
    .map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, roleLabel: ROLE_LABEL[r.role] ?? r.role, active: !r.deactivatedAt, hasPassword: Boolean(r.hasPassword), lastLoginAt: r.lastLoginAt?.toISOString() ?? null }))
    .sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));
  res.json({ company: { id: company.id, name: company.name, slug: company.slug, status: company.status }, people, defaultMinutes: IMPERSONATION_DEFAULT_MINUTES, maxMinutes: IMPERSONATION_MAX_MINUTES });
});

/** Recent sessions, newest first (optionally for one company), so the super admin can see what is still open. */
router.get("/admin/impersonation", ...guard, async (req, res) => {
  const companyId = Number(req.query.companyId);
  const rows = await db
    .select({ s: impersonationSessionsTable, targetName: usersTable.name, targetEmail: usersTable.email, targetRole: usersTable.role })
    .from(impersonationSessionsTable)
    .leftJoin(usersTable, eq(usersTable.id, impersonationSessionsTable.targetUserId))
    .where(Number.isInteger(companyId) && companyId > 0 ? eq(impersonationSessionsTable.companyId, companyId) : undefined)
    .orderBy(desc(impersonationSessionsTable.startedAt))
    .limit(50);
  const now = Date.now();
  res.json({
    sessions: rows.map(({ s, targetName, targetEmail, targetRole }) => ({
      id: s.id,
      companyId: s.companyId,
      target: { id: s.targetUserId, name: targetName ?? "Deleted user", email: targetEmail ?? "", role: targetRole ?? "" },
      reason: s.reason,
      startedAt: s.startedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      endedReason: s.endedReason ?? (s.expiresAt.getTime() <= now ? "expired" : null),
      active: !s.endedAt && s.expiresAt.getTime() > now,
    })),
  });
});

/** Start a session: returns a short-lived token for the target user, stamped with the session id. */
router.post("/admin/impersonation", ...guard, async (req, res) => {
  if (req.impersonator) {
    res.status(400).json({ error: "End the current impersonation session first." });
    return;
  }
  const parsed = StartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { userId, reason } = parsed.data;
  const minutes = parsed.data.minutes ?? IMPERSONATION_DEFAULT_MINUTES;
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!target || !target.companyId || target.role === "super_admin") {
    res.status(400).json({ error: "You can only impersonate a company's staff or clients." });
    return;
  }
  if (target.deactivatedAt) {
    res.status(400).json({ error: `${target.name} is deactivated. Reactivate them before impersonating.` });
    return;
  }
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, target.companyId)).limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const admin = req.currentUser!;
  const expiresAt = new Date(Date.now() + minutes * 60_000);
  const [session] = await db
    .insert(impersonationSessionsTable)
    .values({ superAdminId: admin.id, targetUserId: target.id, companyId: company.id, reason, expiresAt, ipAddress: req.ip ?? null })
    .returning();
  const { token, expiresIn } = signToken({ userId: target.id, email: target.email, role: target.role, companyId: target.companyId, imp: { sid: session.id, by: admin.id } }, minutes * 60);
  await audit(req, {
    action: "impersonation_started",
    resourceType: "user",
    resourceId: target.id,
    companyId: company.id,
    details: { sessionId: session.id, target: { userId: target.id, name: target.name, email: target.email, role: target.role }, reason, minutes, expiresAt: expiresAt.toISOString() },
  });
  const notified = await notifyCompanyAdmins({ companyId: company.id, companyName: company.name, ownerEmail: company.ownerEmail, adminName: admin.name, targetName: target.name, targetRole: target.role, reason, minutes });
  const impersonator: Impersonator = { sessionId: session.id, userId: admin.id, name: admin.name, email: admin.email, reason, startedAt: session.startedAt, expiresAt };
  res.status(201).json({
    token,
    expiresIn,
    user: { ...(await userPayload(target)), impersonation: impersonationPayload(impersonator) },
    company: { id: company.id, name: company.name, slug: company.slug },
    notified,
  });
});

/** End the session the caller is in. The client then restores the super admin's own token. */
router.post("/auth/impersonation/end", authMiddleware, async (req, res) => {
  const imp = req.impersonator;
  if (!imp) {
    res.status(400).json({ error: "You are not impersonating anyone." });
    return;
  }
  await db.update(impersonationSessionsTable).set({ endedAt: new Date(), endedReason: "ended" }).where(and(eq(impersonationSessionsTable.id, imp.sessionId), isNull(impersonationSessionsTable.endedAt)));
  await audit(req, {
    action: "impersonation_ended",
    resourceType: "user",
    resourceId: req.user!.userId,
    details: { sessionId: imp.sessionId, minutesUsed: Math.max(1, Math.round((Date.now() - imp.startedAt.getTime()) / 60_000)) },
  });
  res.json({ ok: true });
});

export function impersonationPayload(imp: Impersonator) {
  return {
    sessionId: imp.sessionId,
    by: { id: imp.userId, name: imp.name, email: imp.email },
    reason: imp.reason,
    startedAt: imp.startedAt.toISOString(),
    expiresAt: imp.expiresAt.toISOString(),
  };
}

/** Tell the company's Admin(s) that platform support is in their account, who as, and why. */
async function notifyCompanyAdmins(p: { companyId: number; companyName: string; ownerEmail: string; adminName: string; targetName: string; targetRole: string; reason: string; minutes: number }): Promise<string[]> {
  try {
    const admins = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(and(eq(usersTable.companyId, p.companyId), eq(usersTable.role, "admin"), isNull(usersTable.deactivatedAt)));
    const recipients = [...new Set((admins.length ? admins.map((a) => a.email) : [p.ownerEmail]).map((e) => e.trim().toLowerCase()).filter(Boolean))];
    const who = `${escapeHtml(p.targetName)} (${escapeHtml(ROLE_LABEL[p.targetRole] ?? p.targetRole)})`;
    const html = renderEmail(
      PLATFORM_LETTERHEAD,
      heading("Advisor Platform support accessed your account") +
        paragraph(`${escapeHtml(p.adminName)} from Advisor Platform support has signed in to <strong>${escapeHtml(p.companyName)}</strong> as ${who} to help with your account.`) +
        paragraph(`<strong>Reason:</strong> ${escapeHtml(p.reason)}`) +
        paragraph(`The session ends automatically within ${p.minutes} minutes, and everything done during it is recorded in the platform audit log.`) +
        paragraph("If you weren't expecting this, reply to this email and we'll look into it right away."),
    );
    for (const to of recipients) {
      await sendEmail({ to, subject: `Advisor Platform support accessed ${p.companyName}`, template: "impersonation_notice", companyId: p.companyId, html, metadata: { targetRole: p.targetRole } });
    }
    return recipients;
  } catch (err) {
    logger.error({ err, companyId: p.companyId }, "Failed to send impersonation notice");
    return [];
  }
}

export default router;
