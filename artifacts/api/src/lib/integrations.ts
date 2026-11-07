import { and, eq } from "drizzle-orm";
import { db, companyIntegrationsTable, companySecretsTable, type Company } from "@workspace/db";
import { integrationDef, type IntegrationProvider, type IntegrationStatus } from "@workspace/shared";
import { decrypt, encrypt, last4 } from "./encryption";
import { env } from "../env";
import { logger } from "./logger";

/**
 * Per-company BYO integrations. Non-secret config lives in
 * company_integrations.config; secrets are encrypted in company_secrets and
 * never leave the server (the API returns `{ set, last4 }` only).
 */

export interface IntegrationView {
  provider: IntegrationProvider;
  status: IntegrationStatus;
  config: Record<string, string | boolean>;
  secrets: Record<string, { set: boolean; last4: string }>;
  lastError: string | null;
  connectedAt: string | null;
}

export async function getSecret(companyId: number, provider: IntegrationProvider, name: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(companySecretsTable)
    .where(and(eq(companySecretsTable.companyId, companyId), eq(companySecretsTable.provider, provider), eq(companySecretsTable.name, name)))
    .limit(1);
  if (!row) return null;
  try {
    return decrypt(row.encryptedValue);
  } catch (err) {
    logger.error({ err, companyId, provider, name }, "Failed to decrypt company secret");
    return null;
  }
}

async function putSecret(companyId: number, provider: IntegrationProvider, name: string, value: string): Promise<void> {
  const encryptedValue = encrypt(value);
  await db
    .insert(companySecretsTable)
    .values({ companyId, provider, name, encryptedValue, last4: last4(value) })
    .onConflictDoUpdate({ target: [companySecretsTable.companyId, companySecretsTable.provider, companySecretsTable.name], set: { encryptedValue, last4: last4(value), updatedAt: new Date() } });
}

export async function integrationViews(companyId: number): Promise<IntegrationView[]> {
  const [rows, secrets] = await Promise.all([
    db.select().from(companyIntegrationsTable).where(eq(companyIntegrationsTable.companyId, companyId)),
    db.select({ provider: companySecretsTable.provider, name: companySecretsTable.name, last4: companySecretsTable.last4 }).from(companySecretsTable).where(eq(companySecretsTable.companyId, companyId)),
  ]);
  return (["sendgrid", "twilio", "stripe", "calendly"] as IntegrationProvider[]).map((provider) => {
    const row = rows.find((r) => r.provider === provider);
    const def = integrationDef(provider);
    const secretViews: IntegrationView["secrets"] = {};
    for (const f of def?.fields ?? []) {
      if (!f.secret) continue;
      const s = secrets.find((x) => x.provider === provider && x.name === f.key);
      secretViews[f.key] = { set: Boolean(s), last4: s?.last4 ?? "" };
    }
    return {
      provider,
      status: row?.status ?? "not_connected",
      config: (row?.config as Record<string, string | boolean>) ?? {},
      secrets: secretViews,
      lastError: row?.lastError ?? null,
      connectedAt: row?.connectedAt?.toISOString() ?? null,
    };
  });
}

export interface VerifyResult {
  status: IntegrationStatus;
  error?: string | null;
  config?: Record<string, string | boolean>;
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 8000): Promise<{ ok: boolean; status: number; body: unknown }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Check the saved credentials against the provider. Each check is small and
 * honest: a status is only "connected" when the provider answered. In tests
 * no network is touched and the credentials are taken at face value.
 */
export async function verifyIntegration(company: Company, provider: IntegrationProvider, config: Record<string, string | boolean>): Promise<VerifyResult> {
  if (env.isTest) {
    if (provider === "sendgrid") return { status: config.sendingDomain ? "pending" : "connected" };
    return { status: "connected" };
  }
  try {
    switch (provider) {
      case "sendgrid": {
        const key = await getSecret(company.id, "sendgrid", "apiKey");
        if (!key) return { status: "not_connected", error: "Add your SendGrid API key" };
        const scopes = await fetchJson("https://api.sendgrid.com/v3/scopes", { headers: { authorization: `Bearer ${key}` } });
        if (!scopes.ok) return { status: "error", error: scopes.status === 401 ? "SendGrid rejected the API key" : `SendGrid returned ${scopes.status}` };
        const domain = String(config.sendingDomain ?? "").trim().toLowerCase();
        if (!domain) return { status: "connected", config: { ...config, domainVerified: false } };
        const domains = await fetchJson("https://api.sendgrid.com/v3/whitelabel/domains", { headers: { authorization: `Bearer ${key}` } });
        const list = Array.isArray(domains.body) ? (domains.body as { domain?: string; subdomain?: string; valid?: boolean }[]) : [];
        const match = list.find((d) => `${d.subdomain ? d.subdomain + "." : ""}${d.domain ?? ""}`.toLowerCase() === domain || (d.domain ?? "").toLowerCase() === domain);
        if (match?.valid) return { status: "connected", config: { ...config, domainVerified: true } };
        return { status: "pending", error: match ? "Sending domain found but DNS is not verified yet" : "Sending domain not authenticated in SendGrid yet", config: { ...config, domainVerified: false } };
      }
      case "twilio": {
        const sid = String(config.accountSid ?? "").trim();
        const token = await getSecret(company.id, "twilio", "authToken");
        if (!sid || !token) return { status: "not_connected", error: "Account SID and auth token are required" };
        const res = await fetchJson(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`, { headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` } });
        if (!res.ok) return { status: "error", error: res.status === 401 ? "Twilio rejected the credentials" : `Twilio returned ${res.status}` };
        return { status: "connected" };
      }
      case "stripe": {
        const accountId = String(config.accountId ?? "").trim();
        if (!/^acct_[A-Za-z0-9]+$/.test(accountId)) return { status: "not_connected", error: "Enter a connected account id (acct_…)" };
        if (!env.stripeSecretKey) return { status: "connected", error: null };
        const res = await fetchJson(`https://api.stripe.com/v1/accounts/${encodeURIComponent(accountId)}`, { headers: { authorization: `Bearer ${env.stripeSecretKey}` } });
        if (!res.ok) return { status: "error", error: res.status === 404 || res.status === 403 ? "That account is not connected to this platform" : `Stripe returned ${res.status}` };
        const acct = res.body as { charges_enabled?: boolean; details_submitted?: boolean };
        return { status: acct.charges_enabled ? "connected" : "pending", error: acct.charges_enabled ? null : "Stripe onboarding is not complete for this account", config: { ...config, chargesEnabled: Boolean(acct.charges_enabled), detailsSubmitted: Boolean(acct.details_submitted) } };
      }
      case "calendly": {
        const url = String(config.url ?? "").trim();
        if (!/^https:\/\/calendly\.com\/.+/.test(url)) return { status: "not_connected", error: "Enter your Calendly event type URL" };
        const token = await getSecret(company.id, "calendly", "token");
        if (!token) return { status: "connected", config: { ...config, webhooks: false } };
        const me = await fetchJson("https://api.calendly.com/users/me", { headers: { authorization: `Bearer ${token}` } });
        if (!me.ok) return { status: "error", error: me.status === 401 ? "Calendly rejected the token" : `Calendly returned ${me.status}` };
        const resource = (me.body as { resource?: { uri?: string; current_organization?: string } }).resource;
        return { status: "connected", config: { ...config, webhooks: true, userUri: resource?.uri ?? "", organizationUri: resource?.current_organization ?? "" } };
      }
    }
  } catch (err) {
    logger.warn({ err, provider, companyId: company.id }, "Integration verification failed");
    return { status: "error", error: "Could not reach the provider. Try again in a minute." };
  }
}

export async function saveIntegration(company: Company, provider: IntegrationProvider, input: { config: Record<string, string | boolean>; secrets: Record<string, string> }): Promise<IntegrationView> {
  const def = integrationDef(provider);
  if (!def) throw new Error(`Unknown provider ${provider}`);
  const allowed = new Set([...def.fields.filter((f) => !f.secret).map((f) => f.key), ...def.toggles.map((t) => t.key)]);
  const [existing] = await db.select().from(companyIntegrationsTable).where(and(eq(companyIntegrationsTable.companyId, company.id), eq(companyIntegrationsTable.provider, provider))).limit(1);
  const config: Record<string, string | boolean> = { ...((existing?.config as Record<string, string | boolean>) ?? {}) };
  for (const [k, v] of Object.entries(input.config)) if (allowed.has(k)) config[k] = typeof v === "string" ? v.trim() : v;
  for (const f of def.fields) {
    if (!f.secret) continue;
    const v = input.secrets[f.key];
    if (typeof v === "string" && v.trim()) await putSecret(company.id, provider, f.key, v.trim());
  }
  const result = await verifyIntegration(company, provider, config);
  const finalConfig = result.config ?? config;
  const now = new Date();
  await db
    .insert(companyIntegrationsTable)
    .values({ companyId: company.id, provider, status: result.status, config: finalConfig, lastError: result.error ?? null, connectedAt: result.status === "connected" ? now : null, updatedAt: now })
    .onConflictDoUpdate({
      target: [companyIntegrationsTable.companyId, companyIntegrationsTable.provider],
      set: { status: result.status, config: finalConfig, lastError: result.error ?? null, connectedAt: result.status === "connected" ? now : existing?.connectedAt ?? null, updatedAt: now },
    });
  const views = await integrationViews(company.id);
  return views.find((v) => v.provider === provider)!;
}

export async function disconnectIntegration(companyId: number, provider: IntegrationProvider): Promise<void> {
  await db.delete(companySecretsTable).where(and(eq(companySecretsTable.companyId, companyId), eq(companySecretsTable.provider, provider)));
  await db
    .insert(companyIntegrationsTable)
    .values({ companyId, provider, status: "not_connected", config: {}, lastError: null, connectedAt: null })
    .onConflictDoUpdate({ target: [companyIntegrationsTable.companyId, companyIntegrationsTable.provider], set: { status: "not_connected", config: {}, lastError: null, connectedAt: null, updatedAt: new Date() } });
}

/** The company's own SendGrid identity, if connected — used for mail the company sends to its leads and clients. */
export async function companySender(company: Company): Promise<{ email: string; name: string; apiKey: string } | null> {
  const [row] = await db.select().from(companyIntegrationsTable).where(and(eq(companyIntegrationsTable.companyId, company.id), eq(companyIntegrationsTable.provider, "sendgrid"))).limit(1);
  if (!row || (row.status !== "connected" && row.status !== "pending")) return null;
  const cfg = row.config as Record<string, string>;
  const apiKey = await getSecret(company.id, "sendgrid", "apiKey");
  if (!apiKey || !cfg.fromAddress) return null;
  return { email: cfg.fromAddress, name: cfg.fromName || company.name, apiKey };
}

export async function calendlyUrlFor(companyId: number): Promise<string | null> {
  const [row] = await db.select().from(companyIntegrationsTable).where(and(eq(companyIntegrationsTable.companyId, companyId), eq(companyIntegrationsTable.provider, "calendly"))).limit(1);
  if (!row || row.status === "not_connected") return null;
  const url = (row.config as Record<string, string>).url;
  return url ? url : null;
}
