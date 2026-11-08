import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, companiesTable, siteContentTable, landingTemplatesTable, pool } from "@workspace/db";
import { PLATFORM_CONTENT_DEFAULTS } from "@workspace/shared";
import { startTestServer, type TestServer } from "../test/harness";
import { MTC_ADMIN_EMAIL, MTC_SLUG } from "../lib/seed";

let server: TestServer;
let superToken = "";
let adminToken = "";

beforeAll(async () => {
  server = await startTestServer();
  const sa = await server.api<{ token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: "clarencewilliams", password: process.env.SUPER_ADMIN_PASSWORD }) });
  superToken = sa.body.token;
  const admin = await server.api<{ token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: MTC_ADMIN_EMAIL, password: process.env.MTC_ADMIN_PASSWORD }) });
  adminToken = admin.body.token;
});
afterAll(async () => {
  await server.close();
  await pool.end();
});

describe("platform admin", () => {
  it("is super-admin only", async () => {
    expect((await server.api("/api/admin/overview", { token: adminToken })).status).toBe(403);
    expect((await server.api("/api/admin/overview")).status).toBe(401);
  });

  it("creates a company with its first Admin invite, default template draft, stages and integrations", async () => {
    const slug = `acme-${Date.now().toString(36)}`;
    const created = await server.api<{ company: { company: { id: number; slug: string; status: string; trialEndsAt: string | null }; team: { email: string; hasPassword: boolean }[]; integrations: Record<string, { status: string }>; features: Record<string, { enabled: boolean }> }; invite: { acceptUrl: string } }>("/api/admin/companies", {
      method: "POST",
      token: superToken,
      body: JSON.stringify({ name: "Acme Advisory", slug, ownerName: "Pat Example", ownerEmail: `pat-${slug}@example.com`, plan: "professional", status: "trial" }),
    });
    expect(created.status).toBe(201);
    const c = created.body.company;
    expect(c.company.slug).toBe(slug);
    expect(c.company.status).toBe("trial");
    expect(c.company.trialEndsAt).not.toBeNull();
    expect(Object.keys(c.integrations).sort()).toEqual(["calendly", "sendgrid", "stripe", "twilio"]);
    expect(c.integrations.sendgrid.status).toBe("not_connected");
    expect(c.features.sendgrid.enabled).toBe(true);
    expect(c.features.white_label.enabled).toBe(false);
    expect(created.body.invite.acceptUrl).toContain("/accept-invite?token=");

    // The Admin exists without a password until the invite is accepted.
    const preview = await server.api<{ state: string; role: string; company: { slug: string } }>(`/api/auth/invites/${new URL(created.body.invite.acceptUrl).searchParams.get("token")}`);
    expect(preview.body).toMatchObject({ state: "pending", role: "admin", company: { slug } });

    // A CMS draft was seeded from the default template with tokens filled.
    const [draft] = await db.select().from(siteContentTable).where(eq(siteContentTable.companyId, c.company.id));
    expect(draft.status).toBe("draft");
    expect((draft.content.brand as { companyName: string }).companyName).toBe("Acme Advisory");
    expect((draft.content.journey as { intro: string }).intro).toContain("Pat and the team");

    // Duplicate slug and reserved slug are refused.
    expect((await server.api("/api/admin/companies", { method: "POST", token: superToken, body: JSON.stringify({ name: "Dup", slug, ownerName: "X Y", ownerEmail: "dup@example.com", plan: "starter", status: "active" }) })).status).toBe(409);
    expect((await server.api("/api/admin/companies", { method: "POST", token: superToken, body: JSON.stringify({ name: "Www", slug: "www", ownerName: "X Y", ownerEmail: "www@example.com", plan: "starter", status: "active" }) })).status).toBe(400);
  });

  it("overrides features per company and changes plan/status with audit entries", async () => {
    const [mtc] = await db.select().from(companiesTable).where(eq(companiesTable.slug, MTC_SLUG));
    const off = await server.api<{ features: Record<string, { enabled: boolean; source: string }> }>(`/api/admin/companies/${mtc.id}/overrides/twilio_sms`, { method: "PUT", token: superToken, body: JSON.stringify({ mode: "off" }) });
    expect(off.status).toBe(200);
    expect(off.body.features.twilio_sms).toMatchObject({ enabled: false, source: "override_off", inPlan: true });
    const back = await server.api<{ features: Record<string, { enabled: boolean; source: string }> }>(`/api/admin/companies/${mtc.id}/overrides/twilio_sms`, { method: "PUT", token: superToken, body: JSON.stringify({ mode: "plan" }) });
    expect(back.body.features.twilio_sms).toMatchObject({ enabled: true, source: "plan" });
    expect((await server.api(`/api/admin/companies/${mtc.id}/overrides/not_a_feature`, { method: "PUT", token: superToken, body: JSON.stringify({ mode: "on" }) })).status).toBe(400);

    // Suspend → the company's staff cannot sign in; reactivate → they can.
    const suspended = await server.api<{ company: { status: string } }>(`/api/admin/companies/${mtc.id}`, { method: "PATCH", token: superToken, body: JSON.stringify({ status: "suspended" }) });
    expect(suspended.body.company.status).toBe("suspended");
    const blocked = await server.api("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: MTC_ADMIN_EMAIL, password: process.env.MTC_ADMIN_PASSWORD }) });
    expect(blocked.status).toBe(403);
    const tenant = await server.api<{ kind: string }>(`/api/t/${MTC_SLUG}/tenant`);
    expect(tenant.body.kind).toBe("company_suspended");
    const reactivated = await server.api<{ company: { status: string } }>(`/api/admin/companies/${mtc.id}`, { method: "PATCH", token: superToken, body: JSON.stringify({ status: "active" }) });
    expect(reactivated.body.company.status).toBe("active");
    expect((await server.api("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: MTC_ADMIN_EMAIL, password: process.env.MTC_ADMIN_PASSWORD }) })).status).toBe(200);

    const audit = await server.api<{ entries: { action: string }[] }>("/api/admin/audit?limit=20", { token: superToken });
    const actions = audit.body.entries.map((a) => a.action);
    expect(actions).toContain("feature_override_off");
    expect(actions).toContain("company_suspended");
    expect(actions).toContain("company_reactivated");
  });

  it("edits the plan feature matrix and surfaces it in requireFeature", async () => {
    const plans = await server.api<{ plans: { key: string; featureKeys: string[] }[] }>("/api/admin/plans", { token: superToken });
    const starter = plans.body.plans.find((p) => p.key === "starter")!;
    expect(starter.featureKeys).not.toContain("team_management");
    const updated = await server.api<{ featureKeys: string[] }>("/api/admin/plans/starter", { method: "PATCH", token: superToken, body: JSON.stringify({ featureKeys: [...starter.featureKeys, "team_management"] }) });
    expect(updated.body.featureKeys).toContain("team_management");
    expect((await server.api("/api/admin/plans/starter", { method: "PATCH", token: superToken, body: JSON.stringify({ featureKeys: ["bogus"] }) })).status).toBe(400);
    // Restore.
    await server.api("/api/admin/plans/starter", { method: "PATCH", token: superToken, body: JSON.stringify({ featureKeys: starter.featureKeys }) });
  });

  it("applies a template as a draft and saves a live page back as a template", async () => {
    const [mtc] = await db.select().from(companiesTable).where(eq(companiesTable.slug, MTC_SLUG));
    const list = await server.api<{ templates: { id: number; slug: string }[] }>("/api/admin/templates", { token: superToken });
    const profileAuthority = list.body.templates.find((t) => t.slug === "profile-authority")!;
    const applied = await server.api<{ status: string; companyName: string }>(`/api/admin/templates/${profileAuthority.id}/apply`, { method: "POST", token: superToken, body: JSON.stringify({ companyId: mtc.id }) });
    expect(applied.status).toBe(200);
    expect(applied.body.status).toBe("draft");
    const rows = await db.select().from(siteContentTable).where(eq(siteContentTable.companyId, mtc.id));
    expect(rows.map((r) => r.status).sort()).toEqual(["draft", "published"]);
    const draft = rows.find((r) => r.status === "draft")!;
    expect((draft.content.guide as { name: string }).name).toBe("Brian Traichel");

    const saved = await server.api<{ slug: string; content: Record<string, Record<string, string>> }>(`/api/admin/companies/${mtc.id}/save-template`, { method: "POST", token: superToken });
    expect(saved.status).toBe(201);
    expect(saved.body.slug).toBe(`from-${MTC_SLUG}`);
    expect(saved.body.content.brand.companyName).toBe("{company}");
    expect(saved.body.content.guide.photo).toBe("");
    const [tpl] = await db.select().from(landingTemplatesTable).where(eq(landingTemplatesTable.slug, `from-${MTC_SLUG}`));
    expect(tpl.isDefault).toBe(false);
    expect((await server.api(`/api/admin/templates/${profileAuthority.id}`, { method: "DELETE", token: superToken })).status).toBe(400);
    expect((await server.api(`/api/admin/templates/${tpl.id}`, { method: "DELETE", token: superToken })).status).toBe(200);
  });

  it("platform landing content: drafts never leak, publish goes live, preview is super-admin only", async () => {
    const before = await server.api<{ content: { hero: { headline: string } }; version: number }>("/api/platform-content");
    expect(before.body.content.hero.headline).toBe(PLATFORM_CONTENT_DEFAULTS.hero.headline);

    const draft = structuredClone(PLATFORM_CONTENT_DEFAULTS);
    draft.hero.headline = "Draft headline";
    draft.ai.items[2].tag = "now";
    expect((await server.api("/api/admin/platform-content/draft", { method: "PUT", token: superToken, body: JSON.stringify({ content: draft }) })).status).toBe(200);

    const publicAfterDraft = await server.api<{ content: { hero: { headline: string } } }>("/api/platform-content");
    expect(publicAfterDraft.body.content.hero.headline).toBe(PLATFORM_CONTENT_DEFAULTS.hero.headline);
    const anonPreview = await server.api<{ content: { hero: { headline: string } }; preview: boolean }>("/api/platform-content?preview=1");
    expect(anonPreview.body.preview).toBe(false);
    const adminPreview = await server.api<{ content: { hero: { headline: string } }; preview: boolean }>("/api/platform-content?preview=1", { token: adminToken });
    expect(adminPreview.body.preview).toBe(false);
    const superPreview = await server.api<{ content: { hero: { headline: string }; ai: { items: { tag: string }[] } }; preview: boolean }>("/api/platform-content?preview=1", { token: superToken });
    expect(superPreview.body.preview).toBe(true);
    expect(superPreview.body.content.hero.headline).toBe("Draft headline");
    expect(superPreview.body.content.ai.items[2].tag).toBe("now");

    const published = await server.api<{ version: number }>("/api/admin/platform-content/publish", { method: "POST", token: superToken });
    expect(published.status).toBe(200);
    expect(published.body.version).toBe(before.body.version + 1);
    const live = await server.api<{ content: { hero: { headline: string } }; version: number }>("/api/platform-content");
    expect(live.body.content.hero.headline).toBe("Draft headline");
    expect(live.body.version).toBe(published.body.version);

    const state = await server.api<{ draft: { exists: boolean } }>("/api/admin/platform-content", { token: superToken });
    expect(state.body.draft.exists).toBe(false);
    expect((await server.api("/api/admin/platform-content/publish", { method: "POST", token: superToken })).status).toBe(400);
  });
});
