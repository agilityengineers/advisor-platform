import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, companiesTable, pool } from "@workspace/db";
import { startTestServer, type TestServer } from "../test/harness";
import { MTC_ADMIN_EMAIL, MTC_SLUG } from "../lib/seed";

/** Capture what would go to SendGrid instead of touching the network. */
const sent = vi.hoisted(() => [] as { from: { email: string; name: string }; replyTo?: string; to: string; subject: string; html: string }[]);
vi.mock("@sendgrid/mail", () => ({
  default: {
    setApiKey: () => undefined,
    send: async (msg: (typeof sent)[number]) => {
      sent.push(msg);
      return [{ headers: { "x-message-id": `test-${sent.length}` } }];
    },
  },
}));

let server: TestServer;
let adminToken = "";
let mtcId = 0;
const HOST = `${MTC_SLUG}.advisor-platform.findabusinesspro.com`;
const sendgridUrl = () => `/api/companies/${mtcId}/settings/integrations/sendgrid`;

beforeAll(async () => {
  server = await startTestServer();
  const [mtc] = await db.select().from(companiesTable).where(eq(companiesTable.slug, MTC_SLUG));
  mtcId = mtc.id;
  adminToken = (await server.api<{ token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: MTC_ADMIN_EMAIL, password: process.env.MTC_ADMIN_PASSWORD }) })).body.token;
});
afterAll(async () => {
  await server.api(`${sendgridUrl()}/disconnect`, { method: "POST", token: adminToken });
  await server.close();
  await pool.end();
});
beforeEach(() => {
  sent.length = 0;
});

describe("white-label senders", () => {
  it("rejects a no-reply address on a different domain", async () => {
    const r = await server.api<{ error: string }>(sendgridUrl(), { method: "PUT", token: adminToken, body: JSON.stringify({ config: { fromName: "Brian Traichel", fromAddress: "brian@mytargetclient.com", noReplyAddress: "no-reply@gmail.com" }, secrets: { apiKey: "SG.test-senders" } }) });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("same domain");
  });

  it("sends account mail from no-reply@ and personal mail from the owner", async () => {
    const saved = await server.api<{ config: Record<string, string> }>(sendgridUrl(), { method: "PUT", token: adminToken, body: JSON.stringify({ config: { fromName: "Brian Traichel", fromAddress: "brian@mytargetclient.com", noReplyName: "My Target Client", noReplyAddress: "no-reply@mytargetclient.com" }, secrets: { apiKey: "SG.test-senders" } }) });
    expect(saved.status).toBe(200);
    expect(saved.body.config.noReplyAddress).toBe("no-reply@mytargetclient.com");

    // Password reset: system mail, from the company's no-reply, nobody to reply to.
    await server.api("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email: MTC_ADMIN_EMAIL }) });
    const reset = sent.find((m) => m.subject.toLowerCase().includes("reset"));
    expect(reset?.from).toEqual({ email: "no-reply@mytargetclient.com", name: "My Target Client" });
    expect(reset?.replyTo).toBeUndefined();
    expect(reset?.html).toContain("not monitored");

    // Outreach to a lead: personal mail, from Brian.
    sent.length = 0;
    await server.api("/api/public/leads", { method: "POST", host: HOST, body: JSON.stringify({ name: "Sender Test", email: `sender-test-${Date.now()}@example.com`, phone: "(415) 555-0100" }) });
    const leads = await server.api<{ leads: { id: number; name: string }[] }>(`/api/companies/${mtcId}/leads`, { token: adminToken });
    const lead = leads.body.leads.find((l) => l.name === "Sender Test")!;
    const out = await server.api(`/api/companies/${mtcId}/leads/${lead.id}/email`, { method: "POST", token: adminToken, body: JSON.stringify({ templateKey: "ready", note: "Hi" }) });
    expect(out.status).toBe(200);
    expect(sent.at(-1)?.from).toEqual({ email: "brian@mytargetclient.com", name: "Brian Traichel" });
  });

  it("derives no-reply@ from the personal address when left blank", async () => {
    await server.api(`${sendgridUrl()}/disconnect`, { method: "POST", token: adminToken });
    const saved = await server.api(sendgridUrl(), { method: "PUT", token: adminToken, body: JSON.stringify({ config: { fromName: "Brian Traichel", fromAddress: "brian@mytargetclient.com" }, secrets: { apiKey: "SG.test-senders" } }) });
    expect(saved.status).toBe(200);
    await server.api("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email: MTC_ADMIN_EMAIL }) });
    expect(sent.at(-1)?.from.email).toBe("no-reply@mytargetclient.com");
  });
});
