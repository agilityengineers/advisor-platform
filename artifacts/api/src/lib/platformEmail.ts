import { env } from "../env";
import { logger } from "./logger";

/**
 * Health of the platform sender (`SENDGRID_API_KEY` + `PLATFORM_FROM_EMAIL`).
 *
 * Asks SendGrid itself, with the platform key, the four things that decide
 * whether invites, resets and magic links reach an inbox and whether bounces
 * come back to us:
 *
 *   1. the key is accepted and carries `mail.send`;
 *   2. the From address is covered by an authenticated domain (or, failing
 *      that, a verified single sender);
 *   3. an Event Webhook points at `/api/webhooks/sendgrid` with the
 *      delivered/bounce/dropped/spamreport events switched on;
 *   4. that webhook is signed, and its public key is the one in
 *      `SENDGRID_WEBHOOK_PUBLIC_KEY`.
 *
 * Nothing here sends mail. Reading the webhook settings needs the key to have
 * the "Mail Settings" read scope; without it the check says so rather than
 * guessing.
 */

export type CheckState = "ok" | "warn" | "fail" | "skipped";

export interface EmailCheck {
  key: "api_key" | "mail_send" | "sender_domain" | "event_webhook" | "webhook_signing";
  label: string;
  state: CheckState;
  detail: string;
}

export interface PlatformEmailStatus {
  configured: boolean;
  from: { email: string; name: string };
  webhookUrl: string;
  ready: boolean;
  checks: EmailCheck[];
  checkedAt: string;
}

const SG = "https://api.sendgrid.com/v3";
const TRACKED_EVENTS = ["delivered", "bounce", "dropped", "spam_report"] as const;

async function sg(path: string, apiKey: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${SG}${path}`, { headers: { authorization: `Bearer ${apiKey}` }, signal: ctrl.signal });
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

export function platformWebhookUrl(): string {
  return `${env.appUrl}/api/webhooks/sendgrid`;
}

/** `partner@advisor-platform.findabusinesspro.com` is covered by that host or any parent SendGrid has authenticated. */
export function domainCovers(authenticated: string, fromDomain: string): boolean {
  const a = authenticated.toLowerCase().replace(/\.$/, "");
  const f = fromDomain.toLowerCase().replace(/\.$/, "");
  return f === a || f.endsWith(`.${a}`);
}

function normaliseKey(k: string): string {
  return k.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
}

interface WebhookSetting {
  id?: string;
  enabled?: boolean;
  url?: string;
  [event: string]: unknown;
}

export async function platformEmailStatus(): Promise<PlatformEmailStatus> {
  const from = { email: env.platformFromEmail, name: env.platformFromName };
  const webhookUrl = platformWebhookUrl();
  const checks: EmailCheck[] = [];
  const done = (): PlatformEmailStatus => ({
    configured: Boolean(env.sendgridApiKey),
    from,
    webhookUrl,
    ready: checks.filter((c) => c.key !== "event_webhook" && c.key !== "webhook_signing").every((c) => c.state === "ok"),
    checks,
    checkedAt: new Date().toISOString(),
  });

  const key = env.sendgridApiKey;
  if (!key) {
    checks.push({ key: "api_key", label: "SendGrid API key", state: "fail", detail: "SENDGRID_API_KEY is not set — nothing is sent. Add it in Replit Secrets and restart." });
    return done();
  }
  if (env.isTest) {
    checks.push({ key: "api_key", label: "SendGrid API key", state: "skipped", detail: "Not contacted under tests" });
    return done();
  }

  try {
    const scopes = await sg("/scopes", key);
    if (!scopes.ok) {
      checks.push({ key: "api_key", label: "SendGrid API key", state: "fail", detail: scopes.status === 401 || scopes.status === 403 ? "SendGrid rejected the key — it was revoked or mistyped." : `SendGrid answered ${scopes.status}.` });
      return done();
    }
    checks.push({ key: "api_key", label: "SendGrid API key", state: "ok", detail: "Accepted by SendGrid" });
    const granted = new Set(((scopes.body as { scopes?: string[] })?.scopes ?? []).map(String));
    checks.push(
      granted.has("mail.send")
        ? { key: "mail_send", label: "Send permission", state: "ok", detail: "Key carries mail.send" }
        : { key: "mail_send", label: "Send permission", state: "fail", detail: "Key lacks mail.send — create a key with Mail Send access." },
    );

    const fromDomain = from.email.split("@")[1] ?? "";
    const domains = await sg("/whitelabel/domains", key);
    const list = Array.isArray(domains.body) ? (domains.body as { domain?: string; subdomain?: string; valid?: boolean }[]) : [];
    const covering = list.filter((d) => d.domain && domainCovers(d.domain, fromDomain));
    const valid = covering.find((d) => d.valid);
    if (valid) {
      checks.push({ key: "sender_domain", label: "Sender domain", state: "ok", detail: `${valid.domain} is authenticated (DKIM/SPF verified) and covers ${from.email}` });
    } else if (covering.length) {
      checks.push({ key: "sender_domain", label: "Sender domain", state: "fail", detail: `${covering[0]!.domain} is added in SendGrid but its DNS records are not verified yet — add the CNAMEs SendGrid lists, then press Verify there.` });
    } else {
      const senders = await sg("/verified_senders", key);
      const results = ((senders.body as { results?: { from_email?: string; verified?: boolean }[] })?.results ?? []);
      const single = results.find((s) => (s.from_email ?? "").toLowerCase() === from.email.toLowerCase() && s.verified);
      checks.push(
        single
          ? { key: "sender_domain", label: "Sender domain", state: "warn", detail: `${from.email} is a verified single sender, but ${fromDomain} has no domain authentication — expect spam-foldering. Authenticate the domain in SendGrid → Sender Authentication.` }
          : { key: "sender_domain", label: "Sender domain", state: "fail", detail: `Neither ${fromDomain} nor a parent domain is authenticated, and ${from.email} is not a verified sender — SendGrid will refuse to send. Authenticate the domain in SendGrid → Sender Authentication.` },
      );
    }

    // Event Webhook: the multi-webhook endpoint first, the legacy single one as a fallback.
    let hooks: WebhookSetting[] = [];
    const all = await sg("/user/webhooks/event/settings/all", key);
    if (all.ok) {
      hooks = ((all.body as { webhooks?: WebhookSetting[] })?.webhooks ?? []);
    } else {
      const legacy = await sg("/user/webhooks/event/settings", key);
      if (legacy.ok && legacy.body) hooks = [legacy.body as WebhookSetting];
      else if (legacy.status === 403 || all.status === 403) {
        checks.push({ key: "event_webhook", label: "Event Webhook", state: "warn", detail: "The key cannot read webhook settings (needs Mail Settings → read). Check SendGrid → Mail Settings → Event Webhook by hand." });
      }
    }
    const ours = hooks.find((h) => (h.url ?? "").replace(/\/$/, "") === webhookUrl);
    if (!checks.some((c) => c.key === "event_webhook")) {
      if (!ours) {
        checks.push({ key: "event_webhook", label: "Event Webhook", state: "warn", detail: `No Event Webhook posts to ${webhookUrl}. Delivery and bounce tracking is off until you add one.` });
      } else if (!ours.enabled) {
        checks.push({ key: "event_webhook", label: "Event Webhook", state: "warn", detail: `The webhook to ${webhookUrl} exists but is disabled.` });
      } else {
        const missing = TRACKED_EVENTS.filter((e) => !ours[e]);
        checks.push(missing.length ? { key: "event_webhook", label: "Event Webhook", state: "warn", detail: `Posting to ${webhookUrl}, but these events are off: ${missing.join(", ")}.` } : { key: "event_webhook", label: "Event Webhook", state: "ok", detail: `Posting delivered/bounce/dropped/spam reports to ${webhookUrl}` });
      }
    }

    // Signing: SendGrid holds the public key; ours must match it or every delivery is rejected.
    if (ours) {
      const signed = await sg(ours.id ? `/user/webhooks/event/settings/signed/${encodeURIComponent(ours.id)}` : "/user/webhooks/event/settings/signed", key);
      const remote = String((signed.body as { public_key?: string })?.public_key ?? "");
      if (!signed.ok || !remote) {
        checks.push({ key: "webhook_signing", label: "Webhook signature", state: "warn", detail: "Signed Event Webhook is off — turn on Signature Verification in SendGrid and copy the public key into SENDGRID_WEBHOOK_PUBLIC_KEY." });
      } else if (!env.sendgridWebhookPublicKey) {
        checks.push({ key: "webhook_signing", label: "Webhook signature", state: "warn", detail: "SendGrid signs deliveries but SENDGRID_WEBHOOK_PUBLIC_KEY is not set — the endpoint answers 503. Copy the key into Replit Secrets." });
      } else if (normaliseKey(remote) !== normaliseKey(env.sendgridWebhookPublicKey)) {
        checks.push({ key: "webhook_signing", label: "Webhook signature", state: "fail", detail: "SENDGRID_WEBHOOK_PUBLIC_KEY does not match the key SendGrid signs with — every delivery is being rejected. Re-copy it." });
      } else {
        checks.push({ key: "webhook_signing", label: "Webhook signature", state: "ok", detail: "Signed, and the public key matches SENDGRID_WEBHOOK_PUBLIC_KEY" });
      }
    } else if (!checks.some((c) => c.key === "webhook_signing")) {
      checks.push({ key: "webhook_signing", label: "Webhook signature", state: env.sendgridWebhookPublicKey ? "warn" : "skipped", detail: env.sendgridWebhookPublicKey ? "SENDGRID_WEBHOOK_PUBLIC_KEY is set, but no matching webhook was found to compare it with." : "Set up the Event Webhook first." });
    }
  } catch (err) {
    logger.warn({ err }, "Platform email status check failed");
    checks.push({ key: "api_key", label: "SendGrid API key", state: "fail", detail: `Could not reach SendGrid: ${err instanceof Error ? err.message : String(err)}` });
  }
  return done();
}
