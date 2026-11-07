import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, companiesTable, profileAssessmentsTable, pool } from "@workspace/db";
import { startTestServer, type TestServer } from "../test/harness";
import { MTC_ADMIN_EMAIL, MTC_SLUG } from "../lib/seed";

let server: TestServer;
let adminToken = "";
let mtcId = 0;
const HOST = `${MTC_SLUG}.advisor-platform.findabusinesspro.com`;
const email = `grade-${Date.now()}@example.com`;
let leadId = 0;
let assessmentId = 0;
let publicId = "";

interface Detail {
  lead: { id: number };
  assessments: { id: number; publicId: string; status: string; grade: string | null; pctTotal: number | null; rubricVersion: number | null; unlocked: boolean; reportUrl: string | null; source: string | null }[];
  grader: { mode: string; rubricVersion: number };
}
interface Grade {
  sample: boolean;
  unlocked: boolean;
  leadUnlocked?: boolean;
  canToggle: boolean;
  status: string;
  profileName: string;
  result: { grade: string; categories: { findings: string[]; recs: unknown[] }[]; immediate: unknown[] } | null;
  rubricVersion: number;
}

beforeAll(async () => {
  server = await startTestServer();
  const [mtc] = await db.select().from(companiesTable).where(eq(companiesTable.slug, MTC_SLUG));
  mtcId = mtc.id;
  adminToken = (await server.api<{ token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: MTC_ADMIN_EMAIL, password: process.env.MTC_ADMIN_PASSWORD }) })).body.token;
});
afterAll(async () => {
  await server.close();
  await pool.end();
});

describe("profile grader", () => {
  it("grades a landing-form lead automatically (demo data under tests) without emailing them", async () => {
    const r = await server.api<{ leadId: string }>("/api/public/leads", { method: "POST", host: HOST, body: JSON.stringify({ name: "Grace Lin", email, phone: "(312) 555-0101", category: "Consultant", linkedin: "https://www.linkedin.com/in/gracelin/", goal: "Be known for operations turnarounds in food manufacturing." }) });
    expect(r.status).toBe(201);
    const list = await server.api<{ leads: { id: number; email: string; grade: string | null }[] }>(`/api/companies/${mtcId}/leads`, { token: adminToken });
    const lead = list.body.leads.find((l) => l.email === email)!;
    leadId = lead.id;
    expect(lead.grade).toMatch(/^[A-F]$/);
    const detail = await server.api<Detail & { activity: { type: string; body: string }[] }>(`/api/companies/${mtcId}/leads/${leadId}`, { token: adminToken });
    expect(detail.body.grader.mode).toBe("demo");
    const a = detail.body.assessments[0];
    expect(a).toMatchObject({ status: "scored", unlocked: false, source: "sample", rubricVersion: detail.body.grader.rubricVersion });
    expect(a.reportUrl).toContain(`/grade/${a.publicId}`);
    expect(detail.body.activity.some((x) => x.type === "grade" && /Profile graded [A-F]/.test(x.body))).toBe(true);
    expect(detail.body.activity.some((x) => x.type === "email_sent")).toBe(false);
    assessmentId = a.id;
    publicId = a.publicId;

    // No LinkedIn URL → no assessment.
    await server.api("/api/public/leads", { method: "POST", host: HOST, body: JSON.stringify({ name: "No Link", email: `nolink-${Date.now()}@example.com`, phone: "(312) 555-0102", category: "Author", linkedin: "", goal: "Just curious about the grade process." }) });
    const noLink = await db.select().from(profileAssessmentsTable).where(eq(profileAssessmentsTable.companyId, mtcId));
    expect(noLink.every((x) => x.linkedinUrl.includes("linkedin.com/in/"))).toBe(true);
  });

  it("serves the lead a summary and staff the full report; staff can preview the lead view", async () => {
    const visitor = await server.api<Grade>(`/api/public/grade/${publicId}`, { host: HOST });
    expect(visitor.status).toBe(200);
    expect(visitor.body.sample).toBe(false);
    expect(visitor.body.unlocked).toBe(false);
    expect(visitor.body.profileName).toBe("Grace Lin");
    expect(visitor.body.result!.categories.every((c) => c.findings.length === 0 && c.recs.length === 0)).toBe(true);
    expect(visitor.body.result!.immediate).toEqual([]);
    const staff = await server.api<Grade>(`/api/public/grade/${publicId}`, { host: HOST, token: adminToken });
    expect(staff.body.unlocked).toBe(true);
    expect(staff.body.canToggle).toBe(true);
    expect(staff.body.leadUnlocked).toBe(false);
    expect(staff.body.result!.categories.some((c) => c.findings.length > 0)).toBe(true);
    const preview = await server.api<Grade>(`/api/public/grade/${publicId}?view=summary`, { host: HOST, token: adminToken });
    expect(preview.body.unlocked).toBe(false);
    // Another company's host cannot read it.
    expect((await server.api(`/api/public/grade/${publicId}`, { host: "advisor-platform.com" })).status).toBe(404);
  });

  it("staff actions: send (email not configured → honest 502), unlock, re-run, re-score, validation", async () => {
    const send = await server.api<{ code: string }>(`/api/companies/${mtcId}/assessments/${assessmentId}/send`, { method: "POST", token: adminToken });
    expect(send.status).toBe(502);
    expect(send.body.code).toBe("email_failed");
    const unlock = await server.api<{ assessment: { unlocked: boolean } }>(`/api/companies/${mtcId}/assessments/${assessmentId}/unlock`, { method: "POST", token: adminToken });
    expect(unlock.body.assessment.unlocked).toBe(true);
    const visitor = await server.api<Grade>(`/api/public/grade/${publicId}`, { host: HOST });
    expect(visitor.body.unlocked).toBe(true);
    expect(visitor.body.result!.categories.some((c) => c.findings.length > 0)).toBe(true);

    const rerun = await server.api<{ assessment: { id: number; status: string; grade: string } }>(`/api/companies/${mtcId}/leads/${leadId}/grade`, { method: "POST", token: adminToken, body: JSON.stringify({ notify: false }) });
    expect(rerun.status).toBe(202);
    expect(rerun.body.assessment.status).toBe("scored");
    expect(rerun.body.assessment.id).not.toBe(assessmentId);
    const rescore = await server.api<{ assessment: { rubricVersion: number } }>(`/api/companies/${mtcId}/assessments/${assessmentId}/rescore`, { method: "POST", token: adminToken });
    expect(rescore.status).toBe(200);
    expect(rescore.body.assessment.rubricVersion).toBeGreaterThanOrEqual(1);

    // A lead with no URL and none supplied is refused; a bad URL too.
    const created = await server.api<{ id: number }>(`/api/companies/${mtcId}/leads`, { method: "POST", token: adminToken, body: JSON.stringify({ name: "No Url", email: `nourl-${Date.now()}@example.com`, phone: "(312) 555-0103", category: "Other", linkedin: "", goal: "n/a", source: "manual" }) });
    expect((await server.api(`/api/companies/${mtcId}/leads/${created.body.id}/grade`, { method: "POST", token: adminToken, body: JSON.stringify({}) })).status).toBe(400);
    expect((await server.api(`/api/companies/${mtcId}/leads/${created.body.id}/grade`, { method: "POST", token: adminToken, body: JSON.stringify({ linkedin: "https://example.com/in/x" }) })).status).toBe(400);
    const supplied = await server.api<{ assessment: { status: string } }>(`/api/companies/${mtcId}/leads/${created.body.id}/grade`, { method: "POST", token: adminToken, body: JSON.stringify({ linkedin: "linkedin.com/in/nourl", notify: false }) });
    expect(supplied.status).toBe(202);
    expect(supplied.body.assessment.status).toBe("scored");
    expect((await server.api(`/api/companies/${mtcId}/leads/${leadId}/grade`, { method: "POST" })).status).toBe(401);
  });

  it("a purchase unlocks every report for that buyer", async () => {
    const fresh = await server.api<{ leadId: string }>("/api/public/leads", { method: "POST", host: HOST, body: JSON.stringify({ name: "Buyer Grade", email: `buyergrade-${Date.now()}@example.com`, phone: "(312) 555-0104", category: "Consultant", linkedin: "linkedin.com/in/buyergrade", goal: "Grade then buy, to see the unlock." }) });
    const list = await server.api<{ leads: { id: number; publicId: string; email: string }[] }>(`/api/companies/${mtcId}/leads`, { token: adminToken });
    const lead = list.body.leads.find((l) => l.publicId === fresh.body.leadId)!;
    const before = await db.select().from(profileAssessmentsTable).where(eq(profileAssessmentsTable.leadId, lead.id));
    expect(before).toHaveLength(1);
    expect(before[0].unlocked).toBe(false);
    const start = await server.api<{ orderId: string }>("/api/public/checkout", { method: "POST", host: HOST, body: JSON.stringify({ offer: "audit", plan: "full", bumps: {}, name: "Buyer Grade", email: lead.email, leadId: lead.publicId }) });
    await server.api(`/api/public/orders/${start.body.orderId}/demo-pay`, { method: "POST", host: HOST });
    const after = await db.select().from(profileAssessmentsTable).where(eq(profileAssessmentsTable.leadId, lead.id));
    expect(after[0].unlocked).toBe(true);
  });
});
