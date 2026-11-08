import { createPublicKey, verify, type KeyObject } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, companyIntegrationsTable, emailEventsTable, emailLogsTable } from "@workspace/db";
import { env } from "../env";
import { logger } from "./logger";

/**
 * SendGrid's signed Event Webhook: ECDSA (P-256, SHA-256) over
 * `timestamp + rawBody`, verified against the account's public key. The
 * platform key covers mail sent with the platform account; each company that
 * sends from its own account pastes its key in Integrations. Deliveries are
 * idempotent on `sg_event_id`.
 */

function keyFromBase64(b64: string): KeyObject | null {
  try {
    return createPublicKey({ key: Buffer.from(b64.trim(), "base64"), format: "der", type: "spki" });
  } catch {
    return null;
  }
}

export function verifySendGridSignature(publicKeyB64: string, rawBody: Buffer | string, signature: string | undefined, timestamp: string | undefined): boolean {
  if (!signature || !timestamp) return false;
  const key = keyFromBase64(publicKeyB64);
  if (!key) return false;
  try {
    return verify("sha256", Buffer.concat([Buffer.from(timestamp), typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody]), key, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

/** Every key that could have signed a delivery: the platform's, then each company's. */
export async function sendGridVerificationKeys(): Promise<{ key: string; companyId: number | null }[]> {
  const keys: { key: string; companyId: number | null }[] = [];
  if (env.sendgridWebhookPublicKey) keys.push({ key: env.sendgridWebhookPublicKey, companyId: null });
  const rows = await db.select({ companyId: companyIntegrationsTable.companyId, config: companyIntegrationsTable.config }).from(companyIntegrationsTable).where(eq(companyIntegrationsTable.provider, "sendgrid"));
  for (const r of rows) {
    const k = String((r.config as Record<string, unknown>).eventWebhookPublicKey ?? "").trim();
    if (k) keys.push({ key: k, companyId: r.companyId });
  }
  return keys;
}

export interface SendGridEvent {
  event: string;
  email?: string;
  sg_event_id?: string;
  sg_message_id?: string;
  timestamp?: number;
  reason?: string;
  email_log_id?: string;
  [k: string]: unknown;
}

/** What a provider event does to the message's status; opens and clicks are recorded but never regress a status. */
export function statusAfterEvent(event: string): string | null {
  switch (event) {
    case "delivered":
      return "delivered";
    case "bounce":
    case "dropped":
      return "bounced";
    case "spamreport":
      return "complained";
    case "deferred":
      return "deferred";
    default:
      return null;
  }
}

export async function applySendGridEvents(events: SendGridEvent[], companyIdHint: number | null): Promise<{ recorded: number; duplicates: number }> {
  let recorded = 0;
  let duplicates = 0;
  for (const ev of events) {
    if (!ev || typeof ev !== "object" || !ev.event) continue;
    const logId = ev.email_log_id ? Number(ev.email_log_id) : null;
    const log = logId && Number.isInteger(logId) ? ((await db.select().from(emailLogsTable).where(eq(emailLogsTable.id, logId)).limit(1))[0] ?? null) : null;
    const [inserted] = await db
      .insert(emailEventsTable)
      .values({ emailLogId: log?.id ?? null, companyId: log?.companyId ?? companyIdHint, providerEventId: ev.sg_event_id ?? null, event: ev.event, recipient: String(ev.email ?? ""), payload: ev as Record<string, unknown>, occurredAt: typeof ev.timestamp === "number" ? new Date(ev.timestamp * 1000) : null })
      .onConflictDoNothing()
      .returning({ id: emailEventsTable.id });
    if (!inserted) {
      duplicates++;
      continue;
    }
    recorded++;
    if (log) {
      const status = statusAfterEvent(ev.event);
      await db
        .update(emailLogsTable)
        .set({ lastEvent: ev.event, ...(status ? { status } : {}), ...(status === "bounced" || status === "complained" ? { errorMessage: String(ev.reason ?? ev.event) } : {}), updatedAt: new Date() })
        .where(eq(emailLogsTable.id, log.id));
    }
  }
  if (recorded) logger.info({ recorded, duplicates }, "SendGrid events applied");
  return { recorded, duplicates };
}
