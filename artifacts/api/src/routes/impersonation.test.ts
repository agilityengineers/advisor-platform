import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { db, companiesTable, usersTable, auditLogsTable, emailLogsTable, impersonationSessionsTable, pool } from "@workspace/db";
import { startTestServer, type TestServer } from "../test/harness";
import { MTC_ADMIN_EMAIL, MTC_SLUG } from "../lib/seed";

let server: TestServer;
let superToken = "";
let adminToken = "";
let mtcId = 0;
let brianId = 0;
let superId = 0;
let advisorId = 0;
let clientId = 0;
let deactivatedId = 0;
const stamp = Date.now();

interface StartResponse {
  token: string;
  expiresIn: number;
  user: { id: number; role: string; impersonation: { sessionId: number; by: { email: string }; reason: string; expiresAt: string } };
  notified: string[];
  error?: string;
}

const REASON = "Support ticket #4821: Brian can't publish his site";
const start = (userId: number, extra: Record<string, unknown> = {}, token = superToken) =>
  server.api<StartResponse>("/api/admin/impersonation", { method: "POST", token, body: JSON.stringify({ userId, reason: REASON, ...extra }) });

beforeAll(async () => {
  server = await startTestServer();
  const [mtc] = await db.select().from(companiesTable).where(eq(companiesTable.slug, MTC_SLUG));
  mtcId = mtc.id;
  const [brian] = await db.select().from(usersTable).where(eq(usersTable.email, MTC_ADMIN_EMAIL));
  brianId = brian.id;
  const [sa] = await db.select().from(usersTable).where(eq(usersTable.role, "super_admin"));
  superId = sa.id;
  superToken = (await server.api<{ token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: "clarencewilliams", password: process.env.SUPER_ADMIN_PASSWORD }) })).body.token;
  adminToken = (await server.api<{ token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: MTC_ADMIN_EMAIL, password: process.env.MTC_ADMIN_PASSWORD }) })).body.token;
  const [advisor] = await db.insert(usersTable).values({ name: "Ava Advisor", email: `imp-advisor-${stamp}@example.com`, role: "advisor", companyId: mtcId, perms: {} }).returning();
  const [client] = await db.insert(usersTable).values({ name: "Cal Client", email: `imp-client-${stamp}@example.com`, role: "client", companyId: mtcId }).returning();
  const [gone] = await db.insert(usersTable).values({ name: "Dee Gone", email: `imp-gone-${stamp}@example.com`, role: "manager", companyId: mtcId, deactivatedAt: new Date() }).returning();
  advisorId = advisor.id;
  clientId = client.id;
  deactivatedId = gone.id;
});
afterAll(async () => {
  await server.close();
  await pool.end();
});

describe("impersonation", () => {
  it("lists a company's staff and clients for the picker (super admin only)", async () => {
    const r = await server.api<{ people: { id: number; role: string }[]; defaultMinutes: number }>(`/api/admin/companies/${mtcId}/people`, { token: superToken });
    expect(r.status).toBe(200);
    const ids = r.body.people.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([brianId, advisorId, clientId]));
    expect(r.body.people[0].role).toBe("admin");
    expect(r.body.defaultMinutes).toBe(60);
    expect((await server.api(`/api/admin/companies/${mtcId}/people`, { token: adminToken })).status).toBe(403);
  });

  it("requires a reason and refuses super admins, deactivated users and non-super-admin callers", async () => {
    expect((await server.api("/api/admin/impersonation", { method: "POST", token: superToken, body: JSON.stringify({ userId: brianId, reason: "short" }) })).status).toBe(400);
    expect((await start(superId)).status).toBe(400);
    const gone = await start(deactivatedId);
    expect(gone.status).toBe(400);
    expect(gone.body.error).toMatch(/deactivated/);
    expect((await start(brianId, {}, adminToken)).status).toBe(403);
  });

  it("signs in as the company Admin, emails the Admin and audits the start", async () => {
    const r = await start(brianId, { minutes: 30 });
    expect(r.status).toBe(201);
    expect(r.body.expiresIn).toBe(30 * 60);
    expect(r.body.user).toMatchObject({ id: brianId, role: "admin", impersonation: { by: { email: "emailme@clarencewilliams.com" }, reason: REASON } });
    expect(r.body.notified).toContain(MTC_ADMIN_EMAIL);
    const token = r.body.token;
    const sid = r.body.user.impersonation.sessionId;

    const me = await server.api<{ id: number; impersonation: { sessionId: number } | null }>("/api/auth/me", { token });
    expect(me.body).toMatchObject({ id: brianId, impersonation: { sessionId: sid } });
    const summary = await server.api<{ viewer: { role: string; isSuperAdmin: boolean } }>(`/api/companies/${mtcId}/summary`, { token });
    expect(summary.status).toBe(200);
    expect(summary.body.viewer).toMatchObject({ role: "admin", isSuperAdmin: false });

    const [mail] = await db.select().from(emailLogsTable).where(and(eq(emailLogsTable.companyId, mtcId), eq(emailLogsTable.template, "impersonation_notice"))).orderBy(desc(emailLogsTable.id)).limit(1);
    expect(mail.recipient).toBe(MTC_ADMIN_EMAIL);
    const [started] = await db.select().from(auditLogsTable).where(and(eq(auditLogsTable.companyId, mtcId), eq(auditLogsTable.action, "impersonation_started"))).orderBy(desc(auditLogsTable.id)).limit(1);
    expect(started.userId).toBe(superId);
    expect(started.details).toMatchObject({ sessionId: sid, reason: REASON, target: { userId: brianId, role: "admin" } });

    // A change made while impersonating is attributed to the super admin, acting as Brian.
    const patched = await server.api(`/api/companies/${mtcId}/team/${advisorId}`, { method: "PATCH", token, body: JSON.stringify({ name: "Ava Advisor" }) });
    expect(patched.status).toBe(200);
    const [change] = await db.select().from(auditLogsTable).where(and(eq(auditLogsTable.companyId, mtcId), eq(auditLogsTable.action, "team_member_updated"))).orderBy(desc(auditLogsTable.id)).limit(1);
    expect(change.userId).toBe(superId);
    expect(change.details).toMatchObject({ actingAs: { userId: brianId, role: "admin" }, impersonationSessionId: sid });

    // Credentials stay with the real person, and platform admin stays out of reach.
    expect((await server.api("/api/auth/change-password", { method: "POST", token, body: JSON.stringify({ currentPassword: "x", newPassword: "NewPassword!2026" }) })).status).toBe(403);
    expect((await server.api("/api/admin/overview", { token })).status).toBe(403);

    const ended = await server.api("/api/auth/impersonation/end", { method: "POST", token });
    expect(ended.status).toBe(200);
    const after = await server.api<{ impersonationEnded?: boolean }>("/api/auth/me", { token });
    expect(after.status).toBe(401);
    expect(after.body.impersonationEnded).toBe(true);
    const [endRow] = await db.select().from(auditLogsTable).where(and(eq(auditLogsTable.companyId, mtcId), eq(auditLogsTable.action, "impersonation_ended"))).orderBy(desc(auditLogsTable.id)).limit(1);
    expect(endRow.userId).toBe(superId);
    expect(endRow.details).toMatchObject({ sessionId: sid });
    // The super admin's own token is untouched.
    expect((await server.api("/api/admin/overview", { token: superToken })).status).toBe(200);
  });

  it("sees exactly what a limited advisor sees", async () => {
    const r = await start(advisorId);
    expect(r.status).toBe(201);
    const denied = await server.api(`/api/companies/${mtcId}/team/${brianId}`, { method: "PATCH", token: r.body.token, body: JSON.stringify({ name: "Brian Traichel" }) });
    expect(denied.status).toBe(403);
    await server.api("/api/auth/impersonation/end", { method: "POST", token: r.body.token });
  });

  it("opens the client portal as a client", async () => {
    const r = await start(clientId);
    expect(r.status).toBe(201);
    const portal = await server.api<{ client: unknown }>("/api/portal", { token: r.body.token });
    expect(portal.status).toBe(200);
    expect((await server.api(`/api/companies/${mtcId}/summary`, { token: r.body.token })).status).toBe(403);
    await server.api("/api/auth/impersonation/end", { method: "POST", token: r.body.token });
  });

  it("stops working once the session expires, and lists past sessions", async () => {
    const r = await start(brianId);
    const sid = r.body.user.impersonation.sessionId;
    await db.update(impersonationSessionsTable).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(impersonationSessionsTable.id, sid));
    const me = await server.api<{ impersonationEnded?: boolean }>("/api/auth/me", { token: r.body.token });
    expect(me.status).toBe(401);
    expect(me.body.impersonationEnded).toBe(true);
    const [row] = await db.select().from(impersonationSessionsTable).where(eq(impersonationSessionsTable.id, sid));
    expect(row.endedReason).toBe("expired");
    const list = await server.api<{ sessions: { id: number; active: boolean; endedReason: string | null }[] }>(`/api/admin/impersonation?companyId=${mtcId}`, { token: superToken });
    expect(list.body.sessions.find((s) => s.id === sid)).toMatchObject({ active: false, endedReason: "expired" });
  });
});
