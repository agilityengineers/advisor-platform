import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db, webhookEventsTable, ordersTable, orderInstallmentsTable, bookingsTable, leadsTable, clientsTable, type Company } from "@workspace/db";
import { parseStripeEvent, readCheckoutSession } from "../lib/stripe";
import { fulfillOrder, markRefunded } from "../lib/orders";
import { companiesWithCalendlyWebhooks, parseInviteePayload, verifyCalendlySignature } from "../lib/calendly";
import { setStageStatus } from "../lib/portal";
import { logActivity } from "../lib/leads";
import { companyForTwilioNumber, parseForm, recordInboundSms, verifyTwilioSignature } from "../lib/twilio";
import { applySendGridEvents, sendGridVerificationKeys, verifySendGridSignature, type SendGridEvent } from "../lib/sendgridEvents";
import { smsLogsTable } from "@workspace/db";
import { env } from "../env";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** Record the delivery first; a duplicate (same provider + event id) is acknowledged and skipped. */
async function claimEvent(provider: string, eventId: string, eventType: string, companyId: number | null, payload: unknown): Promise<number | null> {
  const [row] = await db.insert(webhookEventsTable).values({ provider, eventId, eventType, companyId, payload, status: "received" }).onConflictDoNothing().returning({ id: webhookEventsTable.id });
  return row?.id ?? null;
}

async function finishEvent(id: number, error: string | null): Promise<void> {
  await db.update(webhookEventsTable).set({ status: error ? "failed" : "processed", error, processedAt: new Date() }).where(eq(webhookEventsTable.id, id));
}

// ---------------------------------------------------------------------------
// Stripe (Connect: events from connected accounts carry `account`)
// ---------------------------------------------------------------------------

router.post("/webhooks/stripe", async (req, res) => {
  let event: Stripe.Event;
  try {
    event = parseStripeEvent(req.body as Buffer, req.headers["stripe-signature"] as string | undefined);
  } catch (err) {
    logger.warn({ err }, "Stripe webhook rejected");
    res.status(400).json({ error: "Invalid signature" });
    return;
  }
  const claim = await claimEvent("stripe", event.id, event.type, null, event);
  if (!claim) {
    res.json({ received: true, duplicate: true });
    return;
  }
  const account = (event as Stripe.Event & { account?: string }).account ?? null;
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const publicId = session.metadata?.orderPublicId;
        if (!publicId) break;
        const [order] = await db.select().from(ordersTable).where(eq(ordersTable.publicId, publicId)).limit(1);
        if (!order) break;
        if (session.payment_status !== "paid") break;
        let facts = { paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null, customerId: typeof session.customer === "string" ? session.customer : null, paymentMethodId: null as string | null };
        const acct = account ?? order.stripeAccountId;
        if (acct) {
          try {
            const read = await readCheckoutSession(session.id, acct);
            facts = { paymentIntentId: read.paymentIntentId ?? facts.paymentIntentId, customerId: read.customerId ?? facts.customerId, paymentMethodId: read.paymentMethodId };
          } catch (err) {
            logger.warn({ err, orderId: order.id }, "Could not expand session on webhook");
          }
        }
        await fulfillOrder(order.id, { source: "stripe", sessionId: session.id, accountId: acct, ...facts });
        break;
      }
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const seq = Number(pi.metadata?.installmentSeq);
        const publicId = pi.metadata?.orderPublicId;
        if (!publicId || !Number.isInteger(seq)) break;
        const [order] = await db.select().from(ordersTable).where(eq(ordersTable.publicId, publicId)).limit(1);
        if (!order) break;
        await db.update(orderInstallmentsTable).set({ status: "paid", paidAt: new Date(), stripePaymentIntentId: pi.id, lastError: null }).where(and(eq(orderInstallmentsTable.orderId, order.id), eq(orderInstallmentsTable.seq, seq)));
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const seq = Number(pi.metadata?.installmentSeq);
        const publicId = pi.metadata?.orderPublicId;
        if (!publicId || !Number.isInteger(seq)) break;
        const [order] = await db.select().from(ordersTable).where(eq(ordersTable.publicId, publicId)).limit(1);
        if (!order) break;
        await db.update(orderInstallmentsTable).set({ status: "failed", lastError: pi.last_payment_error?.message ?? "Payment failed", stripePaymentIntentId: pi.id }).where(and(eq(orderInstallmentsTable.orderId, order.id), eq(orderInstallmentsTable.seq, seq)));
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (pi) await markRefunded(pi, charge.id);
        break;
      }
      default:
        break;
    }
    await finishEvent(claim, null);
    res.json({ received: true });
  } catch (err) {
    logger.error({ err, eventId: event.id, type: event.type }, "Stripe webhook processing failed");
    await finishEvent(claim, err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Processing failed" });
  }
});

// ---------------------------------------------------------------------------
// Calendly (per-company subscriptions; the signing key identifies the company)
// ---------------------------------------------------------------------------

export async function applyInviteeEvent(company: Company, invitee: NonNullable<ReturnType<typeof parseInviteePayload>>): Promise<void> {
  // Who booked: the order named in utm_content, else the lead named there, else the lead with that email.
  let order = null as typeof ordersTable.$inferSelect | null;
  let lead = null as typeof leadsTable.$inferSelect | null;
  if (invitee.utmContent?.startsWith("ord_")) order = (await db.select().from(ordersTable).where(and(eq(ordersTable.companyId, company.id), eq(ordersTable.publicId, invitee.utmContent))).limit(1))[0] ?? null;
  if (order?.leadId) lead = (await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId)).limit(1))[0] ?? null;
  if (!lead && invitee.utmContent?.startsWith("ld_")) lead = (await db.select().from(leadsTable).where(and(eq(leadsTable.companyId, company.id), eq(leadsTable.publicId, invitee.utmContent))).limit(1))[0] ?? null;
  if (!lead && invitee.email) lead = (await db.select().from(leadsTable).where(and(eq(leadsTable.companyId, company.id), eq(leadsTable.email, invitee.email))).limit(1))[0] ?? null;
  if (!order && lead) order = (await db.select().from(ordersTable).where(and(eq(ordersTable.leadId, lead.id), eq(ordersTable.status, "paid"))).limit(1))[0] ?? null;

  if (invitee.event === "invitee.created") {
    // Replace any provisional browser booking for this order.
    if (order) await db.delete(bookingsTable).where(eq(bookingsTable.inviteeUri, `provisional:${order.publicId}`));
    await db
      .insert(bookingsTable)
      .values({ companyId: company.id, leadId: lead?.id ?? null, orderId: order?.id ?? null, provider: "calendly", eventUri: invitee.eventUri, inviteeUri: invitee.inviteeUri, inviteeEmail: invitee.email, startAt: invitee.startAt, endAt: invitee.endAt, status: "scheduled", confirmed: true, raw: invitee.raw })
      .onConflictDoUpdate({ target: bookingsTable.inviteeUri, set: { status: "scheduled", confirmed: true, startAt: invitee.startAt, endAt: invitee.endAt, leadId: lead?.id ?? null, orderId: order?.id ?? null, raw: invitee.raw } });
    if (lead) {
      await db.update(leadsTable).set({ bookedAt: invitee.startAt ?? new Date(), updatedAt: new Date() }).where(eq(leadsTable.id, lead.id));
      await logActivity(lead, "booking", `Call booked via Calendly${invitee.startAt ? ` · ${invitee.startAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}`, { meta: { inviteeUri: invitee.inviteeUri, orderId: order?.id ?? null } });
    }
    const client = order?.clientId ? ((await db.select().from(clientsTable).where(eq(clientsTable.id, order.clientId)).limit(1))[0] ?? null) : lead ? ((await db.select().from(clientsTable).where(and(eq(clientsTable.companyId, company.id), eq(clientsTable.leadId, lead.id))).limit(1))[0] ?? null) : null;
    if (client) await setStageStatus(client.id, "interview", "scheduled", { onlyIfNotDone: true });
  } else if (invitee.event === "invitee.canceled") {
    await db.update(bookingsTable).set({ status: "canceled", raw: invitee.raw }).where(eq(bookingsTable.inviteeUri, invitee.inviteeUri));
    if (lead) {
      await db.update(leadsTable).set({ bookedAt: null, updatedAt: new Date() }).where(eq(leadsTable.id, lead.id));
      await logActivity(lead, "booking", "Calendly booking canceled", { meta: { inviteeUri: invitee.inviteeUri } });
    }
    const client = order?.clientId ? ((await db.select().from(clientsTable).where(eq(clientsTable.id, order.clientId)).limit(1))[0] ?? null) : null;
    if (client) await setStageStatus(client.id, "interview", "current", { onlyIfNotDone: true });
  }
}

router.post("/webhooks/calendly", async (req, res) => {
  const raw = req.body as Buffer;
  const signature = req.headers["calendly-webhook-signature"] as string | undefined;
  const candidates = await companiesWithCalendlyWebhooks();
  const match = candidates.find((c) => verifyCalendlySignature(raw, signature, c.signingKey));
  if (!match) {
    logger.warn({ candidates: candidates.length }, "Calendly webhook rejected (no matching signing key)");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }
  let body: unknown;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }
  const invitee = parseInviteePayload(body);
  if (!invitee || !invitee.inviteeUri) {
    res.status(400).json({ error: "Unrecognised payload" });
    return;
  }
  const claim = await claimEvent("calendly", `${invitee.event}:${invitee.inviteeUri}`, invitee.event, match.company.id, body);
  if (!claim) {
    res.json({ received: true, duplicate: true });
    return;
  }
  try {
    await applyInviteeEvent(match.company, invitee);
    await finishEvent(claim, null);
    res.json({ received: true });
  } catch (err) {
    logger.error({ err }, "Calendly webhook processing failed");
    await finishEvent(claim, err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Processing failed" });
  }
});

// ---------------------------------------------------------------------------
// Twilio (inbound SMS + delivery receipts), signed with the company's auth token
// ---------------------------------------------------------------------------

function twilioRequestUrl(req: import("express").Request): string {
  // Twilio signs the exact URL it called. Behind the Replit proxy the public origin is APP_URL.
  return `${env.appUrl}${req.originalUrl}`;
}

async function twilioContext(req: import("express").Request, res: import("express").Response) {
  const params = parseForm(req.body as Buffer);
  const number = params.To || params.From || "";
  const match = await companyForTwilioNumber(params.To ?? "") ?? (params.From ? await companyForTwilioNumber(params.From) : null);
  if (!match) {
    logger.warn({ number }, "Twilio webhook for an unknown number");
    res.status(404).type("text/xml").send("<Response></Response>");
    return null;
  }
  if (!verifyTwilioSignature(match.cfg.authToken, twilioRequestUrl(req), params, req.headers["x-twilio-signature"] as string | undefined)) {
    logger.warn({ companyId: match.company.id }, "Twilio webhook rejected (bad signature)");
    res.status(403).type("text/xml").send("<Response></Response>");
    return null;
  }
  return { params, ...match };
}

router.post("/webhooks/twilio", async (req, res) => {
  const ctx = await twilioContext(req, res);
  if (!ctx) return;
  const { params, company } = ctx;
  const sid = params.MessageSid || params.SmsSid || "";
  const claim = sid ? await claimEvent("twilio", `inbound:${sid}`, "message.received", company.id, params) : null;
  if (sid && !claim) {
    res.type("text/xml").send("<Response></Response>");
    return;
  }
  try {
    await recordInboundSms(company, params.From ?? "", params.To ?? "", params.Body ?? "", sid);
    if (claim) await finishEvent(claim, null);
  } catch (err) {
    logger.error({ err }, "Inbound SMS processing failed");
    if (claim) await finishEvent(claim, err instanceof Error ? err.message : String(err));
  }
  res.type("text/xml").send("<Response></Response>");
});

router.post("/webhooks/twilio/status", async (req, res) => {
  const ctx = await twilioContext(req, res);
  if (!ctx) return;
  const { params } = ctx;
  const sid = params.MessageSid || params.SmsSid;
  const status = params.MessageStatus || params.SmsStatus;
  if (sid && status) {
    await db.update(smsLogsTable).set({ status, errorMessage: params.ErrorCode ? `Twilio error ${params.ErrorCode}` : null }).where(eq(smsLogsTable.providerSid, sid));
  }
  res.type("text/xml").send("<Response></Response>");
});

// ---------------------------------------------------------------------------
// SendGrid Event Webhook (ECDSA-signed; platform key or a company's own key)
// ---------------------------------------------------------------------------

router.post("/webhooks/sendgrid", async (req, res) => {
  const keys = await sendGridVerificationKeys();
  if (keys.length === 0) {
    // An endpoint that would record bounces and complaints on anybody's say-so is worse than one switched off.
    res.status(503).json({ error: "No Event Webhook verification key is configured" });
    return;
  }
  const raw = req.body as Buffer;
  const signature = req.headers["x-twilio-email-event-webhook-signature"] as string | undefined;
  const timestamp = req.headers["x-twilio-email-event-webhook-timestamp"] as string | undefined;
  const match = keys.find((k) => verifySendGridSignature(k.key, raw, signature, timestamp));
  if (!match) {
    logger.warn({ candidates: keys.length }, "SendGrid webhook rejected (no matching key)");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }
  let events: SendGridEvent[];
  try {
    const parsed = JSON.parse(raw.toString("utf8")) as unknown;
    events = Array.isArray(parsed) ? (parsed as SendGridEvent[]) : [];
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }
  const batchId = events.map((e) => e.sg_event_id).filter(Boolean).join(",").slice(0, 200) || `batch:${timestamp}`;
  const claim = await claimEvent("sendgrid", batchId, "events", match.companyId, { count: events.length });
  try {
    const r = await applySendGridEvents(events, match.companyId);
    if (claim) await finishEvent(claim, null);
    res.json({ received: true, ...r });
  } catch (err) {
    logger.error({ err }, "SendGrid events failed");
    if (claim) await finishEvent(claim, err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Processing failed" });
  }
});

export default router;
