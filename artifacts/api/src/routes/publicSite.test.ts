import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, companiesTable, siteContentTable, platformLeadsTable, pool } from "@workspace/db";
import { SITE_CONTENT_DEFAULTS, GRADER_SAMPLE } from "@workspace/shared";
import { startTestServer, type TestServer } from "../test/harness";
import { MTC_ADMIN_EMAIL, MTC_SLUG } from "../lib/seed";

let server: TestServer;
let superToken = "";
let adminToken = "";
let mtcId = 0;
const HOST = `${MTC_SLUG}.advisor-platform.com`;
const PLATFORM = "advisor-platform.com";

interface SitePayload {
  company: { publicFeatures: Record<string, boolean>; branding: { companyName: string } };
  site: { content: typeof SITE_CONTENT_DEFAULTS; preview: boolean };
  reviews: { name: string; quote: string }[];
  calendlyUrl: string | null;
}

beforeAll(async () => {
  server = await startTestServer();
  const [mtc] = await db.select().from(companiesTable).where(eq(companiesTable.slug, MTC_SLUG));
  mtcId = mtc.id;
  superToken = (await server.api<{ token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: "clarencewilliams", password: process.env.SUPER_ADMIN_PASSWORD }) })).body.token;
  adminToken = (await server.api<{ token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: MTC_ADMIN_EMAIL, password: process.env.MTC_ADMIN_PASSWORD }) })).body.token;
});
afterAll(async () => {
  await server.close();
  await pool.end();
});

describe("public company site", () => {
  it("serves the published site with the About page, owner contact and reviews; platform hosts get 404", async () => {
    const r = await server.api<SitePayload>("/api/public/site", { host: HOST });
    expect(r.status).toBe(200);
    expect(r.body.site.preview).toBe(false);
    expect(r.body.site.content.about.headline).toBe(SITE_CONTENT_DEFAULTS.about.headline);
    expect(r.body.site.content.visibility.about).toBe(true);
    expect(r.body.site.content.brand.ownerEmail).toBe("briantraichel@gmail.com");
    expect(r.body.site.content.brand.iconUrl).toBe("/uploads/ptc-logo-only.png");
    expect(r.body.company.publicFeatures.authority_desk).toBe(true);
    expect(r.body.reviews.length).toBeGreaterThan(0);
    expect(r.body.reviews.every((x) => x.quote.length > 0)).toBe(true);
    expect((await server.api("/api/public/site", { host: PLATFORM })).status).toBe(404);
  });

  it("never leaks a draft to visitors; staff see it with ?preview=1", async () => {
    const save = await server.api(`/api/companies/${mtcId}/site-content/draft`, { method: "PUT", token: adminToken, body: JSON.stringify({ content: { about: { headline: "DRAFT ONLY HEADLINE" } } }) });
    expect(save.status).toBe(200);
    const visitor = await server.api<SitePayload>("/api/public/site?preview=1", { host: HOST });
    expect(visitor.body.site.preview).toBe(false);
    expect(visitor.body.site.content.about.headline).not.toBe("DRAFT ONLY HEADLINE");
    const staff = await server.api<SitePayload>("/api/public/site?preview=1", { host: HOST, token: adminToken });
    expect(staff.body.site.preview).toBe(true);
    expect(staff.body.site.content.about.headline).toBe("DRAFT ONLY HEADLINE");
    await db.delete(siteContentTable).where(eq(siteContentTable.status, "draft"));
  });
});

describe("profile grade report", () => {
  it("scores the sample profile against the published rubric, summarised for visitors and full for staff", async () => {
    const visitor = await server.api<{ sample: boolean; unlocked: boolean; canToggle: boolean; profileName: string; result: { total: number; categories: { findings: string[]; recs: unknown[] }[]; immediate: unknown[]; quickWins: unknown[] }; rubricVersion: number; categoryCount: number }>("/api/public/grade/sample", { host: HOST });
    expect(visitor.status).toBe(200);
    expect(visitor.body.sample).toBe(true);
    expect(visitor.body.unlocked).toBe(false);
    expect(visitor.body.canToggle).toBe(false);
    expect(visitor.body.profileName).toBe(GRADER_SAMPLE.name);
    expect(visitor.body.result.total).toBeGreaterThan(0);
    expect(visitor.body.result.categories.every((c) => c.findings.length === 0 && c.recs.length === 0)).toBe(true);
    expect(visitor.body.result.immediate).toEqual([]);
    expect(visitor.body.rubricVersion).toBeGreaterThanOrEqual(1);
    expect(visitor.body.categoryCount).toBeGreaterThan(0);

    const staff = await server.api<{ unlocked: boolean; canToggle: boolean; result: { categories: { findings: string[]; recs: unknown[] }[]; immediate: unknown[] } }>("/api/public/grade/sample?view=full", { host: HOST, token: adminToken });
    expect(staff.body.canToggle).toBe(true);
    expect(staff.body.unlocked).toBe(true);
    expect(staff.body.result.categories.some((c) => c.findings.length > 0 || c.recs.length > 0)).toBe(true);

    // A visitor cannot ask for the full view.
    const sneaky = await server.api<{ unlocked: boolean }>("/api/public/grade/sample?view=full", { host: HOST });
    expect(sneaky.body.unlocked).toBe(false);

    expect((await server.api("/api/public/grade/does-not-exist", { host: HOST })).status).toBe(404);
    expect((await server.api("/api/public/grade/sample", { host: PLATFORM })).status).toBe(404);
  });
});

describe("platform demo / trial requests", () => {
  it("records a request on the platform host only, drops the honeypot, and lists it for the super admin", async () => {
    const email = `demo-${Date.now()}@example.com`;
    const ok = await server.api<{ ok: boolean; requestId: string; firstName: string; intent: string; calendlyUrl: string | null }>("/api/public/platform-leads", { method: "POST", host: PLATFORM, body: JSON.stringify({ name: "Dana Whitfield", company: "Northstar Advisory", email, linkedin: "https://www.linkedin.com/in/danawhitfield/", intent: "trial" }) });
    expect(ok.status).toBe(201);
    expect(ok.body.firstName).toBe("Dana");
    expect(ok.body.intent).toBe("trial");
    expect(ok.body.calendlyUrl).toContain("calendly.com/clarencewilliams");
    expect(ok.body.calendlyUrl).toContain(encodeURIComponent(email));

    expect((await server.api("/api/public/platform-leads", { method: "POST", host: PLATFORM, body: JSON.stringify({ name: "Bot", company: "Spam", email: "bot@example.com", website: "x" }) })).status).toBe(202);
    expect((await server.api("/api/public/platform-leads", { method: "POST", host: HOST, body: JSON.stringify({ name: "Nope", company: "Co", email: "nope@example.com" }) })).status).toBe(404);
    expect((await server.api<{ field: string }>("/api/public/platform-leads", { method: "POST", host: PLATFORM, body: JSON.stringify({ name: "X", company: "", email: "bad" }) })).status).toBe(400);

    const [row] = await db.select().from(platformLeadsTable).where(eq(platformLeadsTable.email, email));
    expect(row.linkedin).toBe("linkedin.com/in/danawhitfield");
    expect(row.status).toBe("new");

    expect((await server.api("/api/admin/platform-leads", { token: adminToken })).status).toBe(403);
    const list = await server.api<{ requests: { id: number; email: string; status: string }[]; counts: Record<string, number> }>("/api/admin/platform-leads", { token: superToken });
    expect(list.status).toBe(200);
    const mine = list.body.requests.find((r) => r.email === email)!;
    expect(mine.status).toBe("new");
    expect(list.body.counts.new).toBeGreaterThanOrEqual(1);

    const updated = await server.api<{ request: { status: string; notes: string; convertedCompanyId: number | null } }>(`/api/admin/platform-leads/${mine.id}`, { method: "PATCH", token: superToken, body: JSON.stringify({ status: "contacted", notes: "Called Tuesday." }) });
    expect(updated.body.request).toMatchObject({ status: "contacted", notes: "Called Tuesday." });
    const converted = await server.api<{ request: { status: string; convertedCompanyId: number | null; convertedCompany: { slug: string } } }>(`/api/admin/platform-leads/${mine.id}`, { method: "PATCH", token: superToken, body: JSON.stringify({ convertedCompanyId: mtcId }) });
    expect(converted.body.request.status).toBe("converted");
    expect(converted.body.request.convertedCompany.slug).toBe(MTC_SLUG);
    expect((await server.api(`/api/admin/platform-leads/${mine.id}`, { method: "PATCH", token: superToken, body: JSON.stringify({ convertedCompanyId: 999999 }) })).status).toBe(400);
    const overview = await server.api<{ counts: { newRequests: number } }>("/api/admin/overview", { token: superToken });
    expect(typeof overview.body.counts.newRequests).toBe("number");
  });
});
