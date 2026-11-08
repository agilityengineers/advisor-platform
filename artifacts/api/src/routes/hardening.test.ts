import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db, companiesTable, smsLogsTable, emailLogsTable, emailEventsTable, leadsTable, auditLogsTable, siteContentTable, pool } from "@workspace/db";
import { startTestServer, type TestServer } from "../test/harness";
import { MTC_ADMIN_EMAIL, MTC_SLUG } from "../lib/seed";
import { verifyTwilioSignature } from "../lib/twilio";

let server: TestServer;
let adminToken = "";
let superToken = "";
let mtcId = 0;
const HOST = `${MTC_SLUG}.advisor-platform.findabusinesspro.com`;
const APP_URL = process.env.APP_URL ?? "http://localhost:5000";
const TWILIO_NUMBER = "+15550109999";
const AUTH_TOKEN = "twilio-test-auth-token";

function twilioSig(url: string, params: Record<string, string>): string {
  return createHmac("sha1", AUTH_TOKEN).update(url + Object.keys(params).sort().map((k) => k + params[k]).join("")).digest("base64");
}

beforeAll(async () => {
  server = await startTestServer();
  const [mtc] = await db.select().from(companiesTable).where(eq(companiesTable.slug, MTC_SLUG));
  mtcId = mtc.id;
  adminToken = (await server.api<{ token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: MTC_ADMIN_EMAIL, password: process.env.MTC_ADMIN_PASSWORD }) })).body.token;
  superToken = (await server.api<{ token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: "clarencewilliams", password: process.env.SUPER_ADMIN_PASSWORD }) })).body.token;
  // Connect Twilio for MTC with alerts and reminders on.
  const saved = await server.api<{ status: string }>(`/api/companies/${mtcId}/settings/integrations/twilio`, { method: "PUT", token: adminToken, body: JSON.stringify({ config: { accountSid: "ACtest000000000000000000000000000", number: TWILIO_NUMBER, alertTo: "+15550100001", reminders: true, leadAlerts: true }, secrets: { authToken: AUTH_TOKEN } }) });
  expect(saved.body.status).toBe("connected");
});
afterAll(async () => {
  await server.api(`/api/companies/${mtcId}/settings/integrations/twilio/disconnect`, { method: "POST", token: adminToken });
  await server.close();
  await pool.end();
});

describe("twilio", () => {
  it("texts the owner when a landing-form lead arrives and the alert toggle is on", async () => {
    const email = `sms-lead-${Date.now()}@example.com`;
    await server.api("/api/public/leads", { method: "POST", host: HOST, body: JSON.stringify({ name: "Text Me", email, phone: "(312) 555-0199", category: "Consultant", linkedin: "", goal: "Just want the alert to fire for this test." }) });
    const logs = await db.select().from(smsLogsTable).where(and(eq(smsLogsTable.companyId, mtcId), eq(smsLogsTable.purpose, "lead_alert")));
    const mine = logs.find((l) => l.body.includes("Text Me"))!;
    expect(mine).toBeTruthy();
    expect(mine).toMatchObject({ to: "+15550100001", from: TWILIO_NUMBER, status: "sent", direction: "outbound" });
    expect(mine.providerSid).toMatch(/^SMtest/);
  });

  it("verifies inbound signatures and attaches a reply to the lead with that phone", async () => {
    const url = `${APP_URL}/api/webhooks/twilio`;
    const params = { MessageSid: `SM${Date.now()}`, AccountSid: "ACtest000000000000000000000000000", From: "+13125550199", To: TWILIO_NUMBER, Body: "Yes, Tuesday works for me." };
    const body = new URLSearchParams(params).toString();
    expect(verifyTwilioSignature(AUTH_TOKEN, url, params, twilioSig(url, params))).toBe(true);
    const bad = await server.api("/api/webhooks/twilio", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "nope" }, body });
    expect(bad.status).toBe(403);
    const unknown = await server.api("/api/webhooks/twilio", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...params, To: "+19998887777", From: "+19998887776" }).toString() });
    expect(unknown.status).toBe(404);
    const ok = await server.api<string>("/api/webhooks/twilio", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSig(url, params) }, body });
    expect(ok.status).toBe(200);
    expect(String(ok.body)).toContain("<Response>");
    const [inbound] = await db.select().from(smsLogsTable).where(eq(smsLogsTable.providerSid, params.MessageSid));
    expect(inbound).toMatchObject({ direction: "inbound", status: "received", companyId: mtcId });
    expect(inbound.leadId).not.toBeNull();
    const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, inbound.leadId!));
    expect(lead.name).toBe("Text Me");
    const detail = await server.api<{ activity: { type: string; body: string }[] }>(`/api/companies/${mtcId}/leads/${lead.id}`, { token: adminToken });
    expect(detail.body.activity.some((a) => a.type === "sms_received" && a.body.includes("Tuesday works"))).toBe(true);
    // Redelivery is a no-op.
    await server.api("/api/webhooks/twilio", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSig(url, params) }, body });
    expect((await db.select().from(smsLogsTable).where(eq(smsLogsTable.providerSid, params.MessageSid))).length).toBe(1);

    // Delivery receipt updates our own outbound row.
    const [alert] = await db.select().from(smsLogsTable).where(and(eq(smsLogsTable.companyId, mtcId), eq(smsLogsTable.purpose, "lead_alert")));
    const statusUrl = `${APP_URL}/api/webhooks/twilio/status`;
    const sp = { MessageSid: alert.providerSid!, MessageStatus: "delivered", From: TWILIO_NUMBER, To: alert.to };
    const st = await server.api("/api/webhooks/twilio/status", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSig(statusUrl, sp) }, body: new URLSearchParams(sp).toString() });
    expect(st.status).toBe(200);
    expect((await db.select().from(smsLogsTable).where(eq(smsLogsTable.id, alert.id)))[0].status).toBe("delivered");
  });
});

describe("sendgrid event webhook", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pubB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");

  it("refuses without a verification key, rejects bad signatures, applies signed events idempotently", async () => {
    const [log] = await db.insert(emailLogsTable).values({ companyId: mtcId, recipient: "events@example.com", subject: "t", template: "test", sender: "company", status: "sent" }).returning();
    const events = [
      { event: "delivered", email: "events@example.com", sg_event_id: `ev-${Date.now()}-1`, sg_message_id: "m1", timestamp: Math.floor(Date.now() / 1000), email_log_id: String(log.id) },
      { event: "open", email: "events@example.com", sg_event_id: `ev-${Date.now()}-2`, sg_message_id: "m1", timestamp: Math.floor(Date.now() / 1000), email_log_id: String(log.id) },
    ];
    const payload = JSON.stringify(events);
    const ts = String(Math.floor(Date.now() / 1000));
    const signature = sign("sha256", Buffer.from(ts + payload), privateKey).toString("base64");
    const headers = (sig: string) => ({ "content-type": "application/json", "x-twilio-email-event-webhook-signature": sig, "x-twilio-email-event-webhook-timestamp": ts });

    // No key anywhere → 503.
    expect((await server.api("/api/webhooks/sendgrid", { method: "POST", headers: headers(signature), body: payload })).status).toBe(503);
    // The company pastes its key in Integrations.
    await server.api(`/api/companies/${mtcId}/settings/integrations/sendgrid`, { method: "PUT", token: adminToken, body: JSON.stringify({ config: { fromName: "MTC", fromAddress: "brian@mytargetclient.com", eventWebhookPublicKey: pubB64 }, secrets: { apiKey: "SG.test" } }) });
    expect((await server.api("/api/webhooks/sendgrid", { method: "POST", headers: headers("AAAA"), body: payload })).status).toBe(401);
    const ok = await server.api<{ recorded: number; duplicates: number }>("/api/webhooks/sendgrid", { method: "POST", headers: headers(signature), body: payload });
    expect(ok.status).toBe(200);
    expect(ok.body.recorded).toBe(2);
    const again = await server.api<{ recorded: number; duplicates: number }>("/api/webhooks/sendgrid", { method: "POST", headers: headers(signature), body: payload });
    expect(again.body).toMatchObject({ recorded: 0, duplicates: 2 });
    const [updated] = await db.select().from(emailLogsTable).where(eq(emailLogsTable.id, log.id));
    expect(updated.status).toBe("delivered");
    expect(updated.lastEvent).toBe("open");
    expect((await db.select().from(emailEventsTable).where(eq(emailEventsTable.emailLogId, log.id))).length).toBe(2);
    await server.api(`/api/companies/${mtcId}/settings/integrations/sendgrid/disconnect`, { method: "POST", token: adminToken });
  });
});

describe("audit log and templates", () => {
  it("records the super admin entering a company console once an hour and filters by company and action", async () => {
    await server.api(`/api/companies/${mtcId}/summary`, { token: superToken });
    await server.api(`/api/companies/${mtcId}/summary`, { token: superToken });
    const rows = await db.select().from(auditLogsTable).where(and(eq(auditLogsTable.companyId, mtcId), eq(auditLogsTable.action, "impersonation")));
    expect(rows.length).toBe(1);
    const filtered = await server.api<{ entries: { action: string; company: { id: number } | null; actor: { email: string } | null }[]; actions: string[]; hasMore: boolean }>(`/api/admin/audit?companyId=${mtcId}&action=impersonation`, { token: superToken });
    expect(filtered.status).toBe(200);
    expect(filtered.body.entries.length).toBe(1);
    expect(filtered.body.entries[0]).toMatchObject({ action: "impersonation", company: { id: mtcId }, actor: { email: "emailme@clarencewilliams.com" } });
    expect(filtered.body.actions).toContain("impersonation");
    expect((await server.api("/api/admin/audit", { token: adminToken })).status).toBe(403);
    const paged = await server.api<{ entries: unknown[]; hasMore: boolean; nextBefore: string | null }>("/api/admin/audit?limit=2", { token: superToken });
    expect(paged.body.entries.length).toBe(2);
    expect(paged.body.hasMore).toBe(true);
    expect(paged.body.nextBefore).not.toBeNull();
  });

  it("lets a company admin start the draft from a template without touching the live page", async () => {
    const list = await server.api<{ templates: { id: number; name: string; isDefault: boolean }[] }>(`/api/companies/${mtcId}/templates`, { token: adminToken });
    expect(list.status).toBe(200);
    const tpl = list.body.templates.find((t) => t.isDefault)!;
    const live = await server.api<{ site: { content: { brand: { companyName: string } } } }>("/api/public/site", { host: HOST });
    const applied = await server.api<{ ok: boolean; templateName: string }>(`/api/companies/${mtcId}/site-content/apply-template`, { method: "POST", token: adminToken, body: JSON.stringify({ templateId: tpl.id }) });
    expect(applied.status).toBe(200);
    expect(applied.body.templateName).toBe(tpl.name);
    const [draft] = await db.select().from(siteContentTable).where(and(eq(siteContentTable.companyId, mtcId), eq(siteContentTable.status, "draft")));
    expect((draft.content.brand as { companyName: string }).companyName).toBe("My Target Client");
    expect((draft.content.about as { eyebrow: string }).eyebrow).toBe("About Brian Traichel");
    const stillLive = await server.api<{ site: { content: { brand: { companyName: string } }; preview: boolean } }>("/api/public/site", { host: HOST });
    expect(stillLive.body.site.content.brand.companyName).toBe(live.body.site.content.brand.companyName);
    expect((await server.api(`/api/companies/${mtcId}/site-content/apply-template`, { method: "POST", token: adminToken, body: JSON.stringify({ templateId: 999999 }) })).status).toBe(404);
    await db.delete(siteContentTable).where(eq(siteContentTable.id, draft.id));
  });
});
