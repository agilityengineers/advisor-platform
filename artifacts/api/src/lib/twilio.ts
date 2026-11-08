import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, companyIntegrationsTable, smsLogsTable, leadsTable, type Company } from "@workspace/db";
import { getSecret } from "./integrations";
import { logActivity } from "./leads";
import { env } from "../env";
import { logger } from "./logger";

/**
 * Twilio, per company (BYO account SID, auth token and number). Two uses:
 * reminders to clients and new-lead alerts to the owner, each behind its own
 * toggle in Integrations. Inbound messages and delivery receipts arrive on
 * /api/webhooks/twilio*, signed with the company's auth token.
 */
export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from: string;
  alertTo: string;
  reminders: boolean;
  leadAlerts: boolean;
}

export const digitsOf = (phone: string): string => phone.replace(/\D/g, "");

/** E.164 for US-style input; anything already starting with + is kept. */
export function toE164(phone: string): string | null {
  const t = phone.trim();
  if (!t) return null;
  if (t.startsWith("+")) return `+${digitsOf(t)}`;
  const d = digitsOf(t);
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return d.length >= 8 ? `+${d}` : null;
}

export async function companyTwilio(companyId: number): Promise<TwilioConfig | null> {
  const [row] = await db.select().from(companyIntegrationsTable).where(and(eq(companyIntegrationsTable.companyId, companyId), eq(companyIntegrationsTable.provider, "twilio"))).limit(1);
  if (!row || (row.status !== "connected" && row.status !== "pending")) return null;
  const cfg = row.config as Record<string, string | boolean>;
  const accountSid = String(cfg.accountSid ?? "").trim();
  const from = toE164(String(cfg.number ?? ""));
  const authToken = await getSecret(companyId, "twilio", "authToken");
  if (!accountSid || !authToken || !from) return null;
  return { accountSid, authToken, from, alertTo: toE164(String(cfg.alertTo ?? "")) ?? "", reminders: Boolean(cfg.reminders), leadAlerts: Boolean(cfg.leadAlerts) };
}

export interface SmsParams {
  to: string;
  body: string;
  purpose: string;
  leadId?: number | null;
  clientId?: number | null;
}

export async function sendSms(company: Company, params: SmsParams): Promise<{ success: boolean; sid?: string; error?: string; notConfigured?: boolean }> {
  const cfg = await companyTwilio(company.id);
  const to = toE164(params.to);
  if (!cfg || !to) {
    await db.insert(smsLogsTable).values({ companyId: company.id, direction: "outbound", to: params.to, from: cfg?.from ?? "", body: params.body, purpose: params.purpose, status: cfg ? "invalid_number" : "not_configured", leadId: params.leadId ?? null, clientId: params.clientId ?? null });
    return { success: false, notConfigured: !cfg, error: cfg ? "Invalid phone number" : "Twilio is not connected" };
  }
  const [log] = await db.insert(smsLogsTable).values({ companyId: company.id, direction: "outbound", to, from: cfg.from, body: params.body, purpose: params.purpose, status: "queued", leadId: params.leadId ?? null, clientId: params.clientId ?? null }).returning();
  if (env.isTest) {
    await db.update(smsLogsTable).set({ status: "sent", providerSid: `SMtest${log.id}` }).where(eq(smsLogsTable.id, log.id));
    return { success: true, sid: `SMtest${log.id}` };
  }
  try {
    const form = new URLSearchParams({ To: to, From: cfg.from, Body: params.body.slice(0, 1600), StatusCallback: `${env.appUrl}/api/webhooks/twilio/status` });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string };
    if (!res.ok || !data.sid) {
      await db.update(smsLogsTable).set({ status: "failed", errorMessage: data.message ?? `Twilio returned ${res.status}` }).where(eq(smsLogsTable.id, log.id));
      return { success: false, error: data.message ?? `Twilio returned ${res.status}` };
    }
    await db.update(smsLogsTable).set({ status: data.status ?? "sent", providerSid: data.sid }).where(eq(smsLogsTable.id, log.id));
    return { success: true, sid: data.sid };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, companyId: company.id }, "Twilio send failed");
    await db.update(smsLogsTable).set({ status: "failed", errorMessage: message }).where(eq(smsLogsTable.id, log.id));
    return { success: false, error: message };
  }
}

/**
 * X-Twilio-Signature = Base64(HMAC-SHA1(authToken, url + Σ sorted(key + value))).
 * `url` is the exact URL Twilio requested, query string included.
 */
export function verifyTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string | undefined): boolean {
  if (!signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The company whose Twilio number a message was sent to (or from, for status callbacks on our own sends). */
export async function companyForTwilioNumber(number: string): Promise<{ company: Company; cfg: TwilioConfig } | null> {
  const wanted = digitsOf(number);
  if (!wanted) return null;
  const rows = await db.select().from(companyIntegrationsTable).where(eq(companyIntegrationsTable.provider, "twilio"));
  for (const row of rows) {
    const cfgNumber = digitsOf(String((row.config as Record<string, unknown>).number ?? ""));
    if (cfgNumber && (cfgNumber === wanted || cfgNumber.endsWith(wanted.slice(-10)))) {
      const { companiesTable } = await import("@workspace/db");
      const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, row.companyId)).limit(1);
      const cfg = company ? await companyTwilio(company.id) : null;
      if (company && cfg) return { company, cfg };
    }
  }
  return null;
}

/** An inbound text: logged, and attached to the lead with that phone number. */
export async function recordInboundSms(company: Company, from: string, to: string, body: string, sid: string): Promise<void> {
  const last10 = digitsOf(from).slice(-10);
  const leads = await db.select().from(leadsTable).where(eq(leadsTable.companyId, company.id));
  const lead = leads.find((l) => digitsOf(l.phone).slice(-10) === last10 && last10.length === 10) ?? null;
  await db.insert(smsLogsTable).values({ companyId: company.id, direction: "inbound", to, from, body: body.slice(0, 1600), purpose: "inbound", status: "received", providerSid: sid, leadId: lead?.id ?? null });
  if (lead) await logActivity(lead, "sms_received", `Text from ${lead.name}: ${body.slice(0, 300)}`, { meta: { sid } });
}

/** Parse Twilio's form-encoded webhook body. */
export function parseForm(raw: Buffer | string): Record<string, string> {
  const params = new URLSearchParams(typeof raw === "string" ? raw : raw.toString("utf8"));
  const out: Record<string, string> = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}
