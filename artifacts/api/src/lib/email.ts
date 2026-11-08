import sgMail from "@sendgrid/mail";
import { eq } from "drizzle-orm";
import { db, emailLogsTable } from "@workspace/db";
import { env } from "../env";
import { logger } from "./logger";

/**
 * The one way anything leaves this server as email.
 *
 * Phase 1 sends everything through the platform SendGrid identity
 * (`partner@`): invites, password resets, magic links. Per-company senders
 * (the company's own SendGrid key and verified domain) arrive with the
 * integrations work and plug into the same function via `sender: "company"`.
 *
 * An unconfigured provider is reported as a failure, never a success, and in
 * development the action link is echoed to the log so flows can be exercised
 * without a key.
 */

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  template: string;
  companyId?: number | null;
  sender?: "platform" | "company";
  /** Names the link the message carries so a dev run can log it. */
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  /** Resolved per-company identity (provided by the integrations layer). */
  from?: { email: string; name: string; apiKey: string };
}

export interface SendEmailResult {
  success: boolean;
  notConfigured?: boolean;
  error?: string;
  emailLogId?: number;
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const recipient = params.to.trim().toLowerCase();
  const sender = params.sender ?? "platform";
  const identity = params.from ?? (env.sendgridApiKey ? { email: env.platformFromEmail, name: env.platformFromName, apiKey: env.sendgridApiKey } : null);

  const [log] = await db
    .insert(emailLogsTable)
    .values({
      companyId: params.companyId ?? null,
      recipient,
      subject: params.subject,
      template: params.template,
      sender,
      status: identity ? "queued" : "not_configured",
      metadata: { ...(params.metadata ?? {}), from: identity?.email ?? null },
    })
    .returning({ id: emailLogsTable.id });

  if (!identity) {
    if (!env.isProduction) {
      logger.warn({ to: recipient, subject: params.subject, template: params.template, actionUrl: params.actionUrl }, "No SendGrid key configured — email not sent (dev: use actionUrl above)");
    } else {
      logger.warn({ to: recipient, template: params.template }, "No email provider configured — nothing was sent");
    }
    return { success: false, notConfigured: true, error: "Email is not configured yet.", emailLogId: log?.id };
  }

  try {
    sgMail.setApiKey(identity.apiKey);
    const [response] = await sgMail.send({
      to: recipient,
      from: { email: identity.email, name: identity.name },
      subject: params.subject,
      html: params.html,
      text: params.text ?? params.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      customArgs: log ? { email_log_id: String(log.id) } : undefined,
    });
    const messageId = (response.headers?.["x-message-id"] as string | undefined) ?? null;
    if (log) await db.update(emailLogsTable).set({ status: "sent", providerMessageId: messageId, updatedAt: new Date() }).where(eq(emailLogsTable.id, log.id));
    return { success: true, emailLogId: log?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, to: recipient, template: params.template }, "SendGrid send failed");
    if (log) await db.update(emailLogsTable).set({ status: "failed", errorMessage: message, updatedAt: new Date() }).where(eq(emailLogsTable.id, log.id));
    return { success: false, error: message, emailLogId: log?.id };
  }
}

// ---------------------------------------------------------------------------
// Templates (branded letterhead: company colour + name, or the platform's)
// ---------------------------------------------------------------------------

export interface Letterhead {
  name: string;
  primaryColor: string;
  logoUrl?: string | null;
}

export const PLATFORM_LETTERHEAD: Letterhead = { name: "Advisor Platform", primaryColor: "#13231C", logoUrl: null };

function color(c: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#1668F0";
}

export function renderEmail(letterhead: Letterhead, body: string, footer?: string): string {
  const name = escapeHtml(letterhead.name);
  const brand = color(letterhead.primaryColor);
  const logo = letterhead.logoUrl
    ? `<img src="${escapeHtml(letterhead.logoUrl)}" alt="${name}" style="max-height:40px;max-width:200px;display:block" />`
    : `<div style="font-size:18px;font-weight:700;color:${brand}">${name}</div>`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F4F6FA;font-family:Manrope,Helvetica,Arial,sans-serif;color:#16130F">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FA;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E4EDF9">
<tr><td style="padding:24px 32px;border-bottom:3px solid ${brand}">${logo}</td></tr>
<tr><td style="padding:32px">${body}</td></tr>
<tr><td style="padding:16px 32px 28px;color:#7C93AD;font-size:12px;line-height:1.5">${footer ?? `Sent by ${name}.`}</td></tr>
</table></td></tr></table></body></html>`;
}

export function button(url: string, label: string, brand: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:${color(brand)};border-radius:999px;padding:13px 26px"><a href="${escapeHtml(url)}" style="color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700">${escapeHtml(label)}</a></td></tr></table>`;
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3D556F">${text}</p>`;
}

export function heading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;font-weight:700;color:#0A1626">${escapeHtml(text)}</h1>`;
}
