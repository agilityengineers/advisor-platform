import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, companiesTable, usersTable, pool } from "@workspace/db";
import { DEFAULT_PERMS, GRADER_DEFAULT, SITE_CONTENT_DEFAULTS } from "@workspace/shared";
import { startTestServer, type TestServer } from "../test/harness";
import { MTC_ADMIN_EMAIL, MTC_SLUG } from "../lib/seed";
import bcrypt from "bcryptjs";

let server: TestServer;
let adminToken = "";
let advisorToken = "";
let mtcId = 0;
const HOST = `${MTC_SLUG}.advisor-platform.findabusinesspro.com`;

type Login = { token: string };

beforeAll(async () => {
  server = await startTestServer();
  const [mtc] = await db.select().from(companiesTable).where(eq(companiesTable.slug, MTC_SLUG));
  mtcId = mtc.id;
  adminToken = (await server.api<Login>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: MTC_ADMIN_EMAIL, password: process.env.MTC_ADMIN_PASSWORD }) })).body.token;
  const email = `console-advisor-${Date.now()}@example.com`;
  await db.insert(usersTable).values({ name: "Console Advisor", email, role: "advisor", companyId: mtcId, perms: DEFAULT_PERMS.advisor, passwordHash: await bcrypt.hash("AdvisorPass!123", 10) });
  advisorToken = (await server.api<Login>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: email, password: "AdvisorPass!123" }) })).body.token;
});
afterAll(async () => {
  await server.close();
  await pool.end();
});

describe("leads & pipeline", () => {
  it("accepts a landing-form lead for the resolved tenant, honeypot drops silently", async () => {
    const ok = await server.api<{ ok: boolean; leadId: string; firstName: string }>("/api/public/leads", { method: "POST", host: HOST, body: JSON.stringify({ name: "Dana Whitfield", email: "dana@whitfieldadvisory.com", phone: "(415) 220-8841", category: "Consultant", linkedin: "https://www.linkedin.com/in/danawhitfield/", goal: "Be known for post-merger operations work." }) });
    expect(ok.status).toBe(201);
    expect(ok.body.firstName).toBe("Dana");
    const bot = await server.api("/api/public/leads", { method: "POST", host: HOST, body: JSON.stringify({ name: "Bot", email: "bot@example.com", phone: "1234567890", website: "http://spam" }) });
    expect(bot.status).toBe(202);
    const platformHost = await server.api("/api/public/leads", { method: "POST", host: "advisor-platform.com", body: JSON.stringify({ name: "Nobody", email: "n@example.com", phone: "1234567890" }) });
    expect(platformHost.status).toBe(404);
    const bad = await server.api<{ field: string }>("/api/public/leads", { method: "POST", host: HOST, body: JSON.stringify({ name: "X", email: "bad", phone: "" }) });
    expect(bad.status).toBe(400);
  });

  it("lists leads with stages and KPIs; the lead lands in the first open stage with normalized LinkedIn", async () => {
    const list = await server.api<{ leads: { name: string; linkedin: string; stage: { name: string; kind: string } }[]; stages: { name: string; kind: string }[]; kpis: { newThisWeek: number; total: number } }>(`/api/companies/${mtcId}/leads`, { token: adminToken });
    expect(list.status).toBe(200);
    expect(list.body.stages.map((s) => s.name)).toEqual(["New", "Contacted", "Audit sent", "Call booked", "Pricing shared", "Client", "Not a fit"]);
    const dana = list.body.leads.find((l) => l.name === "Dana Whitfield")!;
    expect(dana.stage.name).toBe("New");
    expect(dana.linkedin).toBe("linkedin.com/in/danawhitfield");
    expect(list.body.kpis.newThisWeek).toBeGreaterThanOrEqual(1);
  });

  it("moves a lead between stages (pipeline:write) and logs the activity; advisor without team access is refused elsewhere", async () => {
    const list = await server.api<{ leads: { id: number }[]; stages: { id: number; name: string }[] }>(`/api/companies/${mtcId}/leads`, { token: adminToken });
    const lead = list.body.leads[0];
    const contacted = list.body.stages.find((s) => s.name === "Contacted")!;
    const moved = await server.api<{ stage: { name: string } }>(`/api/companies/${mtcId}/leads/${lead.id}`, { method: "PATCH", token: advisorToken, body: JSON.stringify({ stageId: contacted.id }) });
    expect(moved.status).toBe(200);
    expect(moved.body.stage.name).toBe("Contacted");
    const detail = await server.api<{ activity: { type: string; body: string }[]; templates: { key: string }[]; calendly: { connected: boolean } }>(`/api/companies/${mtcId}/leads/${lead.id}`, { token: advisorToken });
    expect(detail.body.activity[0]).toMatchObject({ type: "stage_changed", body: "Moved from New to Contacted" });
    expect(detail.body.templates.map((t) => t.key)).toEqual(["received", "ready", "blueprint"]);
    expect(detail.body.calendly.connected).toBe(false);
    // Advisors have no website or settings access.
    expect((await server.api(`/api/companies/${mtcId}/site-content`, { token: advisorToken })).status).toBe(403);
    expect((await server.api(`/api/companies/${mtcId}/settings`, { token: advisorToken })).status).toBe(403);
    expect((await server.api(`/api/companies/${mtcId}/rubric`, { token: advisorToken })).status).toBe(403);
    // Sending email without SendGrid connected is a clear 409.
    const email = await server.api<{ code: string }>(`/api/companies/${mtcId}/leads/${lead.id}/email`, { method: "POST", token: adminToken, body: JSON.stringify({ templateKey: "ready", note: "Hi" }) });
    expect(email.status).toBe(409);
    expect(email.body.code).toBe("sendgrid_not_connected");
  });

  it("manage columns: rename, add, remove (leads fall back), keep at least one open stage", async () => {
    const stages = await server.api<{ id: number; name: string; kind: string; color: string }[]>(`/api/companies/${mtcId}/stages`, { token: adminToken });
    const next = stages.body.map((s) => ({ id: s.id, name: s.name === "Contacted" ? "Reached out" : s.name, kind: s.kind, color: s.color })).filter((s) => s.name !== "Pricing shared");
    next.splice(3, 0, { name: "Proposal", kind: "open", color: "teal" } as never);
    const saved = await server.api<{ name: string; count: number }[]>(`/api/companies/${mtcId}/stages`, { method: "PUT", token: adminToken, body: JSON.stringify({ stages: next }) });
    expect(saved.status).toBe(200);
    expect(saved.body.map((s) => s.name)).toEqual(["New", "Reached out", "Audit sent", "Proposal", "Call booked", "Client", "Not a fit"]);
    expect(saved.body.find((s) => s.name === "Reached out")!.count).toBeGreaterThanOrEqual(1);
    const noOpen = await server.api(`/api/companies/${mtcId}/stages`, { method: "PUT", token: adminToken, body: JSON.stringify({ stages: [{ name: "Won", kind: "won" }, { name: "Lost", kind: "lost" }] }) });
    expect(noOpen.status).toBe(400);
    expect((await server.api(`/api/companies/${mtcId}/stages`, { method: "PUT", token: advisorToken, body: JSON.stringify({ stages: next }) })).status).toBe(403);
  });
});

describe("website CMS", () => {
  it("drafts never leak to the public site; publish does; preview is staff-only", async () => {
    const before = await server.api<{ site: { content: { hero: { headline: string } }; preview: boolean }; reviews: unknown[]; company: { slug: string } }>("/api/public/site", { host: HOST });
    expect(before.status).toBe(200);
    expect(before.body.site.content.hero.headline).toBe(SITE_CONTENT_DEFAULTS.hero.headline);
    expect(before.body.reviews.length).toBe(6); // 7 seeded, one hidden

    const put = await server.api(`/api/companies/${mtcId}/site-content/draft`, { method: "PUT", token: adminToken, body: JSON.stringify({ content: { hero: { headline: "Draft headline" }, visibility: { cost: false }, heroMedia: { kind: "video", url: "https://youtu.be/x", title: "Walkthrough" } } }) });
    expect(put.status).toBe(200);
    const pub = await server.api<{ site: { content: { hero: { headline: string } } } }>("/api/public/site", { host: HOST });
    expect(pub.body.site.content.hero.headline).toBe(SITE_CONTENT_DEFAULTS.hero.headline);
    const anonPreview = await server.api<{ site: { preview: boolean } }>("/api/public/site?preview=1", { host: HOST });
    expect(anonPreview.body.site.preview).toBe(false);
    const staffPreview = await server.api<{ site: { preview: boolean; content: { hero: { headline: string }; heroMedia: { kind: string } } } }>("/api/public/site?preview=1", { host: HOST, token: adminToken });
    expect(staffPreview.body.site.preview).toBe(true);
    expect(staffPreview.body.site.content.hero.headline).toBe("Draft headline");
    expect(staffPreview.body.site.content.heroMedia.kind).toBe("video");

    const state = await server.api<{ status: string; working: { visibility: { cost: boolean } } }>(`/api/companies/${mtcId}/site-content`, { token: adminToken });
    expect(state.body.status).toBe("draft");
    expect(state.body.working.visibility.cost).toBe(false);

    const published = await server.api<{ version: number }>(`/api/companies/${mtcId}/site-content/publish`, { method: "POST", token: adminToken });
    expect(published.status).toBe(200);
    const after = await server.api<{ site: { content: { hero: { headline: string } }; version: number } }>("/api/public/site", { host: HOST });
    expect(after.body.site.content.hero.headline).toBe("Draft headline");
    expect(after.body.site.version).toBe(published.body.version);
  });

  it("a company without hero_video cannot switch the hero to video", async () => {
    const [starter] = await db.insert(companiesTable).values({ name: "Starter Co", slug: `starter-${Date.now().toString(36)}`, plan: "starter", status: "active", ownerName: "Sam Starter", ownerEmail: `sam-${Date.now()}@example.com` }).returning();
    const admin = await db.insert(usersTable).values({ name: "Sam Starter", email: starter.ownerEmail, role: "admin", companyId: starter.id, passwordHash: await bcrypt.hash("StarterPass!123", 10) }).returning();
    const token = (await server.api<Login>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: admin[0].email, password: "StarterPass!123" }) })).body.token;
    const res = await server.api<{ feature: string }>(`/api/companies/${starter.id}/site-content/draft`, { method: "PUT", token, body: JSON.stringify({ content: { heroMedia: { kind: "video", url: "https://x" } } }) });
    expect(res.status).toBe(403);
    expect(res.body.feature).toBe("hero_video");
    // Starter has no team_management either → lock, not silence.
    const team = await server.api<{ error: string; requiredPlanName: string }>(`/api/companies/${starter.id}/team`, { token });
    expect(team.status).toBe(403);
    expect(team.body.error).toBe("Not in your plan");
    expect(team.body.requiredPlanName).toBe("White Label");
    // Its public site renders the default template with its own name, never MTC copy.
    const site = await server.api<{ site: { content: { brand: { companyName: string }; journey: { intro: string } } } }>(`/api/t/${starter.slug}/public/site`, { host: "advisor-platform.com" });
    expect(site.body.site.content.brand.companyName).toBe("Starter Co");
    expect(site.body.site.content.journey.intro).toContain("Sam and the team");
  });
});

describe("reviews", () => {
  it("adds, hides, reorders and removes reviews; hidden ones stay off the public site", async () => {
    const created = await server.api<{ id: number }>(`/api/companies/${mtcId}/reviews`, { method: "POST", token: adminToken, body: JSON.stringify({ name: "New Reviewer", role: "CEO", category: "Executive", linkedin: "linkedin.com/in/new", quote: "A long enough quote for the slider.", visible: true }) });
    expect(created.status).toBe(201);
    const pubBefore = await server.api<{ reviews: { name: string }[] }>("/api/public/site", { host: HOST });
    expect(pubBefore.body.reviews.some((r) => r.name === "New Reviewer")).toBe(true);
    await server.api(`/api/companies/${mtcId}/reviews/${created.body.id}`, { method: "PATCH", token: adminToken, body: JSON.stringify({ visible: false }) });
    const pubAfter = await server.api<{ reviews: { name: string }[] }>("/api/public/site", { host: HOST });
    expect(pubAfter.body.reviews.some((r) => r.name === "New Reviewer")).toBe(false);
    const list = await server.api<{ id: number }[]>(`/api/companies/${mtcId}/reviews`, { token: adminToken });
    const ids = list.body.map((r) => r.id).reverse();
    const reordered = await server.api<{ id: number }[]>(`/api/companies/${mtcId}/reviews/order`, { method: "PUT", token: adminToken, body: JSON.stringify({ ids }) });
    expect(reordered.body.map((r) => r.id)).toEqual(ids);
    expect((await server.api(`/api/companies/${mtcId}/reviews/${created.body.id}`, { method: "DELETE", token: adminToken })).status).toBe(200);
    expect((await server.api(`/api/companies/${mtcId}/reviews`, { method: "POST", token: advisorToken, body: JSON.stringify({ name: "X Y", quote: "Not allowed for advisors." }) })).status).toBe(403);
  });
});

describe("rubric", () => {
  it("drafts, refuses to publish an unbalanced rubric, publishes v2", async () => {
    const start = await server.api<{ published: { version: number; source: string }; nextVersion: number }>(`/api/companies/${mtcId}/rubric`, { token: adminToken });
    expect(start.body.published.version).toBe(1);
    const bad = structuredClone(GRADER_DEFAULT);
    bad.categories[0].weight = 50;
    await server.api(`/api/companies/${mtcId}/rubric/draft`, { method: "PUT", token: adminToken, body: JSON.stringify({ rubric: bad }) });
    const refused = await server.api<{ problems: { message: string }[] }>(`/api/companies/${mtcId}/rubric/publish`, { method: "POST", token: adminToken });
    expect(refused.status).toBe(400);
    expect(refused.body.problems[0].message).toContain("total 100");
    const good = structuredClone(GRADER_DEFAULT);
    good.categories[0].name = "Network reach";
    await server.api(`/api/companies/${mtcId}/rubric/draft`, { method: "PUT", token: adminToken, body: JSON.stringify({ rubric: good }) });
    const published = await server.api<{ version: number }>(`/api/companies/${mtcId}/rubric/publish`, { method: "POST", token: adminToken });
    expect(published.status).toBe(200);
    expect(published.body.version).toBe(2);
    const after = await server.api<{ working: { categories: { name: string }[] }; hasDraft: boolean; published: { version: number } }>(`/api/companies/${mtcId}/rubric`, { token: adminToken });
    expect(after.body.hasDraft).toBe(false);
    expect(after.body.published.version).toBe(2);
    expect(after.body.working.categories[0].name).toBe("Network reach");
  });
});

describe("company settings", () => {
  it("saves branding, custom domain with DNS records, and encrypted integrations (last-4 only)", async () => {
    const branding = await server.api(`/api/companies/${mtcId}/settings/branding`, { method: "PUT", token: adminToken, body: JSON.stringify({ companyName: "My Target Client", tagline: "Better profiles, stronger connection", logoUrl: "/uploads/ptc-logo-no-tag-line-8c493deb.png", primaryColor: "#1668F0", accentColor: "#0A1626" }) });
    expect(branding.status).toBe(200);
    expect((await server.api(`/api/companies/${mtcId}/settings/branding`, { method: "PUT", token: adminToken, body: JSON.stringify({ companyName: "X", primaryColor: "blue", accentColor: "#000000" }) })).status).toBe(400);

    const domain = await server.api<{ custom: { domain: string; verified: boolean; records: { txt: { host: string; value: string }; cname: { value: string } } } }>(`/api/companies/${mtcId}/settings/domain`, { method: "POST", token: adminToken, body: JSON.stringify({ domain: "www.mytargetclient.com", provider: "godaddy" }) });
    expect(domain.status).toBe(201);
    expect(domain.body.custom.verified).toBe(false);
    expect(domain.body.custom.records.txt.host).toBe("_advisor-verify.mytargetclient.com");
    expect(domain.body.custom.records.txt.value).toMatch(/^advisor-verify-/);
    expect(domain.body.custom.records.cname.value).toBe(`${MTC_SLUG}.advisor-platform.findabusinesspro.com`);
    const verify = await server.api<{ verified: boolean }>(`/api/companies/${mtcId}/settings/domain/verify`, { method: "POST", token: adminToken });
    expect(verify.status).toBe(422);
    expect(verify.body.verified).toBe(false);
    // Unverified domain does not resolve the tenant yet.
    const resolved = await server.api<{ kind: string }>("/api/tenant", { host: "www.mytargetclient.com" });
    expect(resolved.body.kind).toBe("platform");

    const sg = await server.api<{ status: string; secrets: { apiKey: { set: boolean; last4: string } }; config: Record<string, string> }>(`/api/companies/${mtcId}/settings/integrations/sendgrid`, { method: "PUT", token: adminToken, body: JSON.stringify({ config: { fromName: "Brian Traichel", fromAddress: "brian@mytargetclient.com", sendingDomain: "mail.mytargetclient.com" }, secrets: { apiKey: "SG.supersecretkey1234" } }) });
    expect(sg.status).toBe(200);
    expect(sg.body.secrets.apiKey).toEqual({ set: true, last4: "1234" });
    expect(JSON.stringify(sg.body)).not.toContain("supersecret");
    expect(sg.body.status).toBe("pending");
    const missing = await server.api<{ error: string }>(`/api/companies/${mtcId}/settings/integrations/twilio`, { method: "PUT", token: adminToken, body: JSON.stringify({ config: { accountSid: "AC123" }, secrets: {} }) });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toContain("Auth token");
    const cal = await server.api<{ status: string }>(`/api/companies/${mtcId}/settings/integrations/calendly`, { method: "PUT", token: adminToken, body: JSON.stringify({ config: { url: "https://calendly.com/briantraichel/intro-call" }, secrets: {} }) });
    expect(cal.body.status).toBe("connected");
    // Now the lead drawer and public form carry a prefilled Calendly link.
    const list = await server.api<{ leads: { id: number }[]; calendlyUrl: string }>(`/api/companies/${mtcId}/leads`, { token: adminToken });
    expect(list.body.calendlyUrl).toContain("calendly.com");
    const detail = await server.api<{ calendly: { prefillUrl: string } }>(`/api/companies/${mtcId}/leads/${list.body.leads[0].id}`, { token: adminToken });
    expect(detail.body.calendly.prefillUrl).toContain("utm_content=ld_");
    // Summary reflects integration status for the sidebar.
    const summary = await server.api<{ integrations: Record<string, string>; counts: { leads: number } }>(`/api/companies/${mtcId}/summary`, { token: adminToken });
    expect(summary.body.integrations.calendly).toBe("connected");
    expect(summary.body.integrations.sendgrid).toBe("pending");
    expect(summary.body.counts.leads).toBeGreaterThanOrEqual(1);
    const off = await server.api<{ status: string; secrets: { apiKey: { set: boolean } } }>(`/api/companies/${mtcId}/settings/integrations/sendgrid/disconnect`, { method: "POST", token: adminToken });
    expect(off.body.status).toBe("not_connected");
    expect(off.body.secrets.apiKey.set).toBe(false);
  });
});
