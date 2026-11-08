import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, usersTable, companiesTable, pool } from "@workspace/db";
import { startTestServer, type TestServer } from "../test/harness";
import { MTC_ADMIN_EMAIL, MTC_SLUG } from "../lib/seed";

let server: TestServer;
const superPassword = process.env.SUPER_ADMIN_PASSWORD!;
const mtcPassword = process.env.MTC_ADMIN_PASSWORD!;

beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
  await pool.end();
});

type LoginResponse = { token: string; user: { role: string; companyId: number | null; email: string } };

describe("tenant resolution", () => {
  it("resolves the platform on platform hosts and the company on /t/:slug", async () => {
    const platform = await server.api<{ kind: string }>("/api/tenant", { host: "advisor-platform.com" });
    expect(platform.body.kind).toBe("platform");
    const path = await server.api<{ kind: string; company: { slug: string; branding: { primaryColor: string } } }>(`/api/t/${MTC_SLUG}/tenant`, { host: "advisor-platform.com" });
    expect(path.body.kind).toBe("company");
    expect(path.body.company.slug).toBe(MTC_SLUG);
    expect(path.body.company.branding.primaryColor).toBe("#1668F0");
    const sub = await server.api<{ kind: string; via: string }>("/api/tenant", { host: `${MTC_SLUG}.advisor-platform.findabusinesspro.com` });
    expect(sub.body.kind).toBe("company");
    expect(sub.body.via).toBe("subdomain");
  });
});

describe("auth", () => {
  it("signs the super admin in with username or email", async () => {
    const byUsername = await server.api<LoginResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: "clarencewilliams", password: superPassword }) });
    expect(byUsername.status).toBe(200);
    expect(byUsername.body.user.role).toBe("super_admin");
    expect(byUsername.body.user.companyId).toBeNull();
    const byEmail = await server.api<LoginResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: "EMAILME@clarencewilliams.com", password: superPassword }) });
    expect(byEmail.status).toBe(200);
    const me = await server.api<{ email: string }>("/api/auth/me", { token: byEmail.body.token });
    expect(me.body.email).toBe("emailme@clarencewilliams.com");
  });

  it("rejects bad credentials", async () => {
    const bad = await server.api("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: "clarencewilliams", password: "nope-nope-nope" }) });
    expect(bad.status).toBe(401);
  });

  it("signs the MTC admin in at the company door but not at another company's door", async () => {
    const ok = await server.api<LoginResponse>("/api/auth/login", { method: "POST", host: `${MTC_SLUG}.advisor-platform.findabusinesspro.com`, body: JSON.stringify({ identifier: MTC_ADMIN_EMAIL, password: mtcPassword }) });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe("admin");
    const [mtc] = await db.select().from(companiesTable).where(eq(companiesTable.slug, MTC_SLUG));
    expect(ok.body.user.companyId).toBe(mtc.id);

    await db.insert(companiesTable).values({ name: "Other Co", slug: "other-co", plan: "starter", status: "active" }).onConflictDoNothing();
    const wrongDoor = await server.api("/api/auth/login", { method: "POST", host: "other-co.advisor-platform.findabusinesspro.com", body: JSON.stringify({ identifier: MTC_ADMIN_EMAIL, password: mtcPassword }) });
    expect(wrongDoor.status).toBe(401);
  });

  it("company summary is scoped: admin sees own company, super admin sees any, others are refused", async () => {
    const admin = await server.api<LoginResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: MTC_ADMIN_EMAIL, password: mtcPassword }) });
    const sa = await server.api<LoginResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: "clarencewilliams", password: superPassword }) });
    const [mtc] = await db.select().from(companiesTable).where(eq(companiesTable.slug, MTC_SLUG));
    const [other] = await db.select().from(companiesTable).where(eq(companiesTable.slug, "other-co"));

    const own = await server.api<{ features: Record<string, { enabled: boolean; source: string }>; plan: { key: string } }>(`/api/companies/${mtc.id}/summary`, { token: admin.body.token });
    expect(own.status).toBe(200);
    expect(own.body.plan.key).toBe("white_label");
    expect(own.body.features.authority_desk).toEqual({ enabled: true, source: "override_on", inPlan: false });
    expect(own.body.features.white_label.enabled).toBe(true);

    const foreign = await server.api(`/api/companies/${other.id}/summary`, { token: admin.body.token });
    expect(foreign.status).toBe(403);
    const asSuper = await server.api(`/api/companies/${other.id}/summary`, { token: sa.body.token });
    expect(asSuper.status).toBe(200);
  });

  it("runs the invite → accept → sign-in flow and enforces team permissions", async () => {
    const admin = await server.api<LoginResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: MTC_ADMIN_EMAIL, password: mtcPassword }) });
    const [mtc] = await db.select().from(companiesTable).where(eq(companiesTable.slug, MTC_SLUG));
    const email = `advisor-${Date.now()}@example.com`;
    const invite = await server.api<{ inviteId: number; acceptUrl: string; devLink?: string }>(`/api/companies/${mtc.id}/team/invites`, {
      method: "POST",
      token: admin.body.token,
      body: JSON.stringify({ email, name: "Test Advisor", role: "advisor", perms: { clients: "write", pipeline: "read" } }),
    });
    expect(invite.status).toBe(201);
    const token = new URL(invite.body.acceptUrl).searchParams.get("token")!;
    expect(token.length).toBeGreaterThan(20);

    const preview = await server.api<{ state: string; email: string; role: string }>(`/api/auth/invites/${token}`);
    expect(preview.body).toMatchObject({ state: "pending", email, role: "advisor" });

    const weak = await server.api(`/api/auth/invites/accept`, { method: "POST", body: JSON.stringify({ token, name: "Test Advisor", password: "short" }) });
    expect(weak.status).toBe(400);

    const accepted = await server.api<LoginResponse & { user: { perms: Record<string, string> } }>(`/api/auth/invites/accept`, { method: "POST", body: JSON.stringify({ token, name: "Test Advisor", password: "LongEnough!Pass1" }) });
    expect(accepted.status).toBe(200);
    expect(accepted.body.user.role).toBe("advisor");
    expect(accepted.body.user.perms).toMatchObject({ clients: "write", pipeline: "read", team: "none" });

    const again = await server.api(`/api/auth/invites/accept`, { method: "POST", body: JSON.stringify({ token, name: "Test Advisor", password: "LongEnough!Pass1" }) });
    expect(again.status).toBe(400);

    const denied = await server.api(`/api/companies/${mtc.id}/team`, { token: accepted.body.token });
    expect(denied.status).toBe(403);
    const list = await server.api<{ members: { email: string }[] }>(`/api/companies/${mtc.id}/team`, { token: admin.body.token });
    expect(list.status).toBe(200);
    expect(list.body.members.some((m) => m.email === email)).toBe(true);
  });

  it("resets a password through a single-use token", async () => {
    const [mtc] = await db.select().from(companiesTable).where(eq(companiesTable.slug, MTC_SLUG));
    const email = `reset-${Date.now()}@example.com`;
    await db.insert(usersTable).values({ name: "Reset Me", email, role: "manager", companyId: mtc.id, passwordHash: null });
    const forgot = await server.api<{ ok: boolean; devLink?: string }>("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email }) });
    expect(forgot.status).toBe(200);
    expect(forgot.body.devLink).toBeDefined();
    const token = new URL(forgot.body.devLink!).searchParams.get("token")!;
    const reset = await server.api<LoginResponse>("/api/auth/reset", { method: "POST", body: JSON.stringify({ token, password: "BrandNewPass!123" }) });
    expect(reset.status).toBe(200);
    expect(reset.body.user.email).toBe(email);
    const replay = await server.api("/api/auth/reset", { method: "POST", body: JSON.stringify({ token, password: "BrandNewPass!123" }) });
    expect(replay.status).toBe(400);
    const login = await server.api("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: email, password: "BrandNewPass!123" }) });
    expect(login.status).toBe(200);
    const unknown = await server.api<{ ok: boolean; devLink?: string }>("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email: "nobody@example.com" }) });
    expect(unknown.status).toBe(200);
    expect(unknown.body.devLink).toBeUndefined();
  });

  it("signs a client in with a magic link only at their company's door", async () => {
    const [mtc] = await db.select().from(companiesTable).where(eq(companiesTable.slug, MTC_SLUG));
    const email = `client-${Date.now()}@example.com`;
    await db.insert(usersTable).values({ name: "A Client", email, role: "client", companyId: mtc.id });
    const staffDoor = await server.api("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: email, password: "whatever-whatever" }) });
    expect(staffDoor.status).toBe(401);
    const wrong = await server.api<{ devLink?: string }>("/api/auth/magic-link", { method: "POST", host: "other-co.advisor-platform.findabusinesspro.com", body: JSON.stringify({ email }) });
    expect(wrong.body.devLink).toBeUndefined();
    const right = await server.api<{ devLink?: string }>("/api/auth/magic-link", { method: "POST", host: `${MTC_SLUG}.advisor-platform.findabusinesspro.com`, body: JSON.stringify({ email }) });
    expect(right.body.devLink).toBeDefined();
    const token = new URL(right.body.devLink!).searchParams.get("token")!;
    const verified = await server.api<LoginResponse>("/api/auth/magic-link/verify", { method: "POST", body: JSON.stringify({ token }) });
    expect(verified.status).toBe(200);
    expect(verified.body.user.role).toBe("client");
    const replay = await server.api("/api/auth/magic-link/verify", { method: "POST", body: JSON.stringify({ token }) });
    expect(replay.status).toBe(400);
  });
});
