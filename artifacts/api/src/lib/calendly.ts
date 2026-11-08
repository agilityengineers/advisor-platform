import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, companyIntegrationsTable, companySecretsTable, companiesTable, type Company } from "@workspace/db";
import { getSecret } from "./integrations";
import { env } from "../env";
import { logger } from "./logger";

/**
 * Calendly webhooks. A subscription is registered per company with the
 * company's personal access token; Calendly returns a signing key we keep in
 * company_secrets (`webhookSigningKey`). Signatures are
 * `Calendly-Webhook-Signature: t=<ts>,v1=<hmac-sha256(t + "." + body)>`.
 */

export function verifyCalendlySignature(rawBody: Buffer | string, header: string | undefined, signingKey: string, toleranceSeconds = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.trim().split("=") as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) return false;
  const expected = createHmac("sha256", signingKey).update(`${t}.${typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Companies that registered a webhook, with their signing keys — the only way to know whose event this is. */
export async function companiesWithCalendlyWebhooks(): Promise<{ company: Company; signingKey: string }[]> {
  const rows = await db
    .select({ company: companiesTable })
    .from(companySecretsTable)
    .innerJoin(companiesTable, eq(companiesTable.id, companySecretsTable.companyId))
    .where(and(eq(companySecretsTable.provider, "calendly"), eq(companySecretsTable.name, "webhookSigningKey"), isNotNull(companySecretsTable.encryptedValue)));
  const out: { company: Company; signingKey: string }[] = [];
  for (const r of rows) {
    const key = await getSecret(r.company.id, "calendly", "webhookSigningKey");
    if (key) out.push({ company: r.company, signingKey: key });
  }
  return out;
}

export interface RegisterResult {
  ok: boolean;
  error?: string;
  subscriptionUri?: string;
}

/** Create (or re-create) the company's invitee webhook subscription at Calendly. */
export async function registerCalendlyWebhook(company: Company): Promise<RegisterResult> {
  const [row] = await db.select().from(companyIntegrationsTable).where(and(eq(companyIntegrationsTable.companyId, company.id), eq(companyIntegrationsTable.provider, "calendly"))).limit(1);
  const cfg = (row?.config ?? {}) as Record<string, string>;
  const token = await getSecret(company.id, "calendly", "token");
  if (!token) return { ok: false, error: "Add your Calendly personal access token first" };
  if (!cfg.organizationUri) return { ok: false, error: "Save and verify the Calendly connection first so we know your organization" };
  const callbackUrl = `${env.appUrl}/api/webhooks/calendly`;
  if (env.isTest) {
    await saveWebhook(company.id, "https://api.calendly.com/webhook_subscriptions/test", "test-signing-key");
    return { ok: true, subscriptionUri: "https://api.calendly.com/webhook_subscriptions/test" };
  }
  try {
    const res = await fetch("https://api.calendly.com/webhook_subscriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ url: callbackUrl, events: ["invitee.created", "invitee.canceled"], organization: cfg.organizationUri, scope: "organization" }),
    });
    const body = (await res.json().catch(() => ({}))) as { resource?: { uri?: string; signing_key?: string }; message?: string; details?: { message?: string }[] };
    if (!res.ok) {
      const msg = body.details?.[0]?.message || body.message || `Calendly returned ${res.status}`;
      // Calendly answers 409 when an identical subscription exists; that is fine if we already hold its key.
      if (res.status === 409 && (await getSecret(company.id, "calendly", "webhookSigningKey"))) return { ok: true, subscriptionUri: cfg.webhookSubscriptionUri ?? "" };
      return { ok: false, error: msg };
    }
    if (!body.resource?.uri || !body.resource.signing_key) return { ok: false, error: "Calendly did not return a signing key" };
    await saveWebhook(company.id, body.resource.uri, body.resource.signing_key);
    return { ok: true, subscriptionUri: body.resource.uri };
  } catch (err) {
    logger.warn({ err, companyId: company.id }, "Calendly webhook registration failed");
    return { ok: false, error: "Could not reach Calendly. Try again in a minute." };
  }
}

async function saveWebhook(companyId: number, subscriptionUri: string, signingKey: string): Promise<void> {
  const { encrypt, last4 } = await import("./encryption");
  await db
    .insert(companySecretsTable)
    .values({ companyId, provider: "calendly", name: "webhookSigningKey", encryptedValue: encrypt(signingKey), last4: last4(signingKey) })
    .onConflictDoUpdate({ target: [companySecretsTable.companyId, companySecretsTable.provider, companySecretsTable.name], set: { encryptedValue: encrypt(signingKey), last4: last4(signingKey), updatedAt: new Date() } });
  const [row] = await db.select().from(companyIntegrationsTable).where(and(eq(companyIntegrationsTable.companyId, companyId), eq(companyIntegrationsTable.provider, "calendly"))).limit(1);
  const config = { ...((row?.config as Record<string, unknown>) ?? {}), webhookSubscriptionUri: subscriptionUri, webhooks: true };
  await db
    .insert(companyIntegrationsTable)
    .values({ companyId, provider: "calendly", status: row?.status ?? "connected", config })
    .onConflictDoUpdate({ target: [companyIntegrationsTable.companyId, companyIntegrationsTable.provider], set: { config, updatedAt: new Date() } });
}

/** The fields we read off an invitee payload. */
export interface InviteePayload {
  event: "invitee.created" | "invitee.canceled" | string;
  inviteeUri: string;
  eventUri: string;
  email: string;
  name: string;
  startAt: Date | null;
  endAt: Date | null;
  utmContent: string | null;
  raw: Record<string, unknown>;
}

export function parseInviteePayload(body: unknown): InviteePayload | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { event?: string; payload?: Record<string, unknown> };
  const p = b.payload ?? {};
  const scheduled = (p.scheduled_event as Record<string, unknown> | undefined) ?? {};
  const tracking = (p.tracking as Record<string, unknown> | undefined) ?? {};
  const date = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);
  return {
    event: b.event ?? "",
    inviteeUri: String(p.uri ?? ""),
    eventUri: String(p.event ?? scheduled.uri ?? ""),
    email: String(p.email ?? "").toLowerCase(),
    name: String(p.name ?? ""),
    startAt: date(scheduled.start_time),
    endAt: date(scheduled.end_time),
    utmContent: typeof tracking.utm_content === "string" ? tracking.utm_content : null,
    raw: p,
  };
}
