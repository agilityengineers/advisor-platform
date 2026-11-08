import { and, asc, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db, companiesTable, ordersTable, orderInstallmentsTable, intakesTable, leadsTable, bookingsTable, type Company, type Order, type OrderInstallment, type Lead } from "@workspace/db";
import { OFFERS, priceOrder, cents, isOfferKey, ownerFirstName, SITE_CONTENT_DEFAULTS, type OrderPricing, type PaymentPlan, type BumpSelection } from "@workspace/shared";
import { createLead, logActivity, stagesFor } from "./leads";
import { calendlyUrlFor } from "./integrations";
import { ensureClient, seedClientStages, setStageStatus } from "./portal";
import { sendCompanyMail } from "./companyMail";
import { button, escapeHtml, heading, paragraph } from "./email";
import { companyBaseUrl } from "./urls";
import { checkoutMode, companyStripeAccount, chargeOffSession } from "./stripe";
import { newPublicId } from "./tokens";
import { unlockForLead, failStaleAssessments } from "./grader";
import { companyTwilio, sendSms } from "./twilio";
import { clientsTable } from "@workspace/db";
import { logger } from "./logger";
import { env } from "../env";

export const INSTALLMENT_INTERVAL_DAYS = 30;

export function pricingFor(order: Pick<Order, "offerKey" | "paymentMode" | "bumps">): OrderPricing {
  const offer = isOfferKey(order.offerKey) ? OFFERS[order.offerKey] : OFFERS.audit;
  const selection: BumpSelection = {};
  for (const b of order.bumps) if (b.key === "banner" || b.key === "rush") selection[b.key] = true;
  return priceOrder(offer, order.paymentMode === "split" ? "split" : "full", selection);
}

export interface CheckoutInput {
  offer: keyof typeof OFFERS;
  plan: PaymentPlan;
  bumps: BumpSelection;
  name: string;
  email: string;
  phone?: string;
  leadId?: string;
  meta?: Record<string, unknown>;
}

/** The buyer's row before any money moves. */
export async function createPendingOrder(company: Company, input: CheckoutInput): Promise<{ order: Order; pricing: OrderPricing }> {
  const pricing = priceOrder(OFFERS[input.offer], input.plan, input.bumps);
  const email = input.email.toLowerCase();
  let lead: Lead | null = null;
  if (input.leadId) {
    const [byPublic] = await db.select().from(leadsTable).where(and(eq(leadsTable.companyId, company.id), eq(leadsTable.publicId, input.leadId))).limit(1);
    lead = byPublic ?? null;
  }
  if (!lead) {
    const [byEmail] = await db.select().from(leadsTable).where(and(eq(leadsTable.companyId, company.id), eq(leadsTable.email, email))).orderBy(desc(leadsTable.createdAt)).limit(1);
    lead = byEmail ?? null;
  }
  const [order] = await db
    .insert(ordersTable)
    .values({
      publicId: newPublicId("ord_"),
      companyId: company.id,
      leadId: lead?.id ?? null,
      offerKey: input.offer,
      offerName: pricing.offer.name,
      paymentMode: pricing.plan,
      installments: pricing.installments,
      bumps: pricing.bumps,
      amountCents: pricing.dueTodayCents,
      currency: "usd",
      customerName: input.name,
      customerEmail: email,
      customerPhone: input.phone ?? "",
      status: "pending",
    })
    .returning();
  return { order, pricing };
}

export async function orderByPublicId(companyId: number, publicId: string): Promise<Order | null> {
  const [o] = await db.select().from(ordersTable).where(and(eq(ordersTable.companyId, companyId), eq(ordersTable.publicId, publicId))).limit(1);
  return o ?? null;
}

export async function installmentsFor(orderId: number): Promise<OrderInstallment[]> {
  return db.select().from(orderInstallmentsTable).where(eq(orderInstallmentsTable.orderId, orderId)).orderBy(asc(orderInstallmentsTable.seq));
}

export interface PaymentFacts {
  source: "stripe" | "demo" | "manual";
  paymentIntentId?: string | null;
  customerId?: string | null;
  paymentMethodId?: string | null;
  sessionId?: string | null;
  accountId?: string | null;
}

export interface Fulfilled {
  order: Order;
  alreadyPaid: boolean;
}

/** A fulfilment claim older than this is presumed dead (crashed process) and may be taken over. */
const FULFIL_CLAIM_TTL_MS = 5 * 60_000;

/**
 * Money arrived: the order becomes a client with a portal, the lead is won,
 * installments are scheduled and the welcome/receipt goes out. Safe to call
 * twice — and concurrently: the return page and the webhook routinely arrive
 * together (on different autoscale instances, even). The order row is claimed
 * first (pending → fulfilling) in one UPDATE; whoever loses waits briefly for
 * the winner and returns the paid order. Every step below is re-runnable, so a
 * claim abandoned by a crashed process is simply taken over after five minutes.
 */
export async function fulfillOrder(orderId: number, payment: PaymentFacts): Promise<Fulfilled> {
  const staleBefore = new Date(Date.now() - FULFIL_CLAIM_TTL_MS);
  const [fresh] = await db
    .update(ordersTable)
    .set({ status: "fulfilling", updatedAt: new Date() })
    .where(and(eq(ordersTable.id, orderId), or(eq(ordersTable.status, "pending"), and(eq(ordersTable.status, "fulfilling"), lt(ordersTable.updatedAt, staleBefore)))))
    .returning();
  if (!fresh) return waitForFulfilment(orderId, payment.source);
  try {
    return await fulfillClaimed(fresh, payment);
  } catch (err) {
    // Hand the order back so the next confirmation (webhook retry, return-page poll) can finish it.
    await db.update(ordersTable).set({ status: "pending", updatedAt: new Date() }).where(and(eq(ordersTable.id, orderId), eq(ordersTable.status, "fulfilling")));
    throw err;
  }
}

async function waitForFulfilment(orderId: number, source: PaymentFacts["source"]): Promise<Fulfilled> {
  for (let i = 0; i < 40; i++) {
    const [o] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (!o) throw new Error(`Order ${orderId} not found`);
    if (o.status !== "fulfilling") {
      if (o.status !== "paid") logger.warn({ orderId, status: o.status, source }, "Payment confirmation for an order that is not pending — ignored");
      return { order: o, alreadyPaid: true };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  // Still claimed by someone else: fail loudly so the webhook is retried (and can take over a dead claim).
  throw new Error(`Order ${orderId} is still being fulfilled by another request`);
}

async function fulfillClaimed(fresh: Order, payment: PaymentFacts): Promise<Fulfilled> {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, fresh.companyId)).limit(1);
  if (!company) throw new Error("Company missing for order");
  const pricing = pricingFor(fresh);
  const now = new Date();

  // 1. Lead: found at checkout, else created now — and moved to the won stage either way.
  let lead: Lead | null = fresh.leadId ? ((await db.select().from(leadsTable).where(eq(leadsTable.id, fresh.leadId)).limit(1))[0] ?? null) : null;
  if (!lead) lead = await createLead(company, { name: fresh.customerName, email: fresh.customerEmail, phone: fresh.customerPhone, source: "checkout" });
  const stages = await stagesFor(company.id);
  const won = stages.find((s) => s.kind === "won");
  if (won && lead.stageId !== won.id) await db.update(leadsTable).set({ stageId: won.id, updatedAt: now }).where(eq(leadsTable.id, lead.id));
  if (fresh.customerPhone && !lead.phone) await db.update(leadsTable).set({ phone: fresh.customerPhone }).where(eq(leadsTable.id, lead.id));

  // 2. Client + portal login + tracker.
  const client = await ensureClient(company, { name: fresh.customerName, email: fresh.customerEmail, phone: fresh.customerPhone, linkedin: lead.linkedin, leadId: lead.id });
  await seedClientStages(client);
  await setStageStatus(client.id, "payment", "done");
  const [intake] = await db.select().from(intakesTable).where(eq(intakesTable.clientId, client.id)).limit(1);
  if (!intake) await db.insert(intakesTable).values({ companyId: company.id, orderId: fresh.id, clientId: client.id, data: {} });

  // 3. The order itself.
  const [order] = await db
    .update(ordersTable)
    .set({
      status: "paid",
      paidAt: now,
      leadId: lead.id,
      clientId: client.id,
      stripePaymentIntentId: payment.paymentIntentId ?? fresh.stripePaymentIntentId,
      stripeCustomerId: payment.customerId ?? fresh.stripeCustomerId,
      stripePaymentMethodId: payment.paymentMethodId ?? fresh.stripePaymentMethodId,
      stripeSessionId: payment.sessionId ?? fresh.stripeSessionId,
      stripeAccountId: payment.accountId ?? fresh.stripeAccountId,
      updatedAt: now,
    })
    .where(eq(ordersTable.id, fresh.id))
    .returning();

  // 4. Later installments, every 30 days.
  if (pricing.split && pricing.installments > 1) {
    const existing = await installmentsFor(order.id);
    if (existing.length === 0) {
      await db
        .insert(orderInstallmentsTable)
        .values(Array.from({ length: pricing.installments - 1 }, (_, i) => ({ orderId: order.id, seq: i + 2, amountCents: pricing.laterCents, dueAt: new Date(now.getTime() + (i + 1) * INSTALLMENT_INTERVAL_DAYS * 86_400_000), status: "scheduled" })))
        .onConflictDoNothing();
    }
  }

  await unlockForLead(lead.id, `purchased ${pricing.offer.name}`).catch((err) => logger.warn({ err, leadId: lead.id }, "Could not unlock reports"));

  await logActivity(lead, "order", `${pricing.offer.name} purchased · ${cents(order.amountCents)}${pricing.split ? ` (1 of ${pricing.installments})` : ""} · ${payment.source}`, { meta: { orderId: order.id, orderPublicId: order.publicId, source: payment.source } });

  // 5. Mail: receipt + welcome to the buyer, a heads-up to the owner. Neither failing undoes the sale.
  try {
    await sendWelcomeEmail(company, order, pricing, lead);
  } catch (err) {
    logger.error({ err, orderId: order.id }, "Welcome email failed");
  }
  try {
    await notifyOwnerOfOrder(company, order, pricing);
  } catch (err) {
    logger.warn({ err, orderId: order.id }, "Owner order alert failed");
  }
  logger.info({ orderId: order.id, companyId: company.id, source: payment.source, amountCents: order.amountCents }, "Order fulfilled");
  return { order, alreadyPaid: false };
}

export function calendlyPrefill(url: string | null, args: { name: string; email: string; utmContent: string; campaign?: string; linkedin?: string }): string | null {
  if (!url) return null;
  const params = new URLSearchParams({ name: args.name, email: args.email, utm_source: "advisor_platform", utm_content: args.utmContent });
  if (args.campaign) params.set("utm_campaign", args.campaign);
  if (args.linkedin) params.set("a1", args.linkedin);
  return `${url}${url.includes("?") ? "&" : "?"}${params.toString()}`;
}

export interface OrderLinks {
  thanks: string;
  book: string;
  intake: string;
  portal: string;
  calendly: string | null;
}

export async function orderLinks(company: Company, order: Order, lead?: Lead | null): Promise<OrderLinks> {
  const base = await companyBaseUrl(company);
  const calendly = calendlyPrefill(await calendlyUrlFor(company.id), { name: order.customerName, email: order.customerEmail, utmContent: order.publicId, campaign: order.offerKey, linkedin: lead?.linkedin || undefined });
  return {
    thanks: `${base}/thanks?order=${encodeURIComponent(order.publicId)}`,
    book: `${base}/book?order=${encodeURIComponent(order.publicId)}`,
    intake: `${base}/intake?order=${encodeURIComponent(order.publicId)}`,
    portal: `${base}/client/login?email=${encodeURIComponent(order.customerEmail)}`,
    calendly,
  };
}

async function ownerFirst(company: Company): Promise<string> {
  const first = ownerFirstName({ ownerName: "", ownerFullName: company.ownerName || SITE_CONTENT_DEFAULTS.brand.ownerFullName });
  return first || company.name;
}

function receiptRows(order: Order, pricing: OrderPricing): string {
  const row = (label: string, amount: string, strong = false) => `<tr><td style="padding:6px 0;font-size:13.5px;color:${strong ? "#0A1626" : "#3D556F"};font-weight:${strong ? 700 : 400}">${escapeHtml(label)}</td><td align="right" style="padding:6px 0;font-size:13.5px;color:${strong ? "#0A1626" : "#3D556F"};font-weight:${strong ? 700 : 400}">${escapeHtml(amount)}</td></tr>`;
  const lines = [row(pricing.offer.name, pricing.split ? `${cents(pricing.laterCents)} today` : cents(pricing.baseCents)), ...pricing.bumps.map((b) => row(b.label, cents(b.amountCents)))];
  return `<div style="margin-top:24px;border-top:1px solid #E4EDF9;padding-top:16px"><div style="font-size:11.5px;font-weight:700;letter-spacing:0.1em;color:#7C93AD">RECEIPT · ${escapeHtml(order.publicId.toUpperCase())}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${lines.join("")}<tr><td colspan="2" style="border-top:1px solid #EEF4FC"></td></tr>${row(pricing.split ? "Due today" : "Total", cents(order.amountCents), true)}</table>${pricing.split ? paragraph(`Then ${pricing.installments - 1} more payment${pricing.installments > 2 ? "s" : ""} of ${cents(pricing.laterCents)} every ${INSTALLMENT_INTERVAL_DAYS} days. Total ${cents(pricing.totalCents)}.`) : ""}</div>`;
}

/** Welcome + receipt (Buying Flow.dc.html, screen 5): the same three links the thank-you page shows. */
export async function sendWelcomeEmail(company: Company, order: Order, pricing: OrderPricing, lead: Lead | null): Promise<void> {
  if (order.receiptSentAt) return;
  const first = order.customerName.split(/\s+/)[0] || "there";
  const owner = await ownerFirst(company);
  const links = await orderLinks(company, order, lead);
  const brandColor = "#1668F0";
  const body =
    heading(`Welcome aboard, ${first}.`) +
    paragraph(`Thanks for choosing the ${escapeHtml(pricing.offer.name)}. Your payment of ${cents(order.amountCents)} went through; the receipt is below. Two quick things and then it's on ${escapeHtml(owner === company.name ? "us" : "me")}:`) +
    (links.calendly ? button(links.calendly, "1 · Book your Brand Voice Interview", brandColor) : "") +
    button(links.intake, `${links.calendly ? "2" : "1"} · Complete your 3-minute intake`, brandColor) +
    paragraph(`You can follow every step in your client portal: <a href="${escapeHtml(links.portal)}" style="font-weight:700;color:${brandColor}">open my portal</a>. Sign-in is a one-tap link sent to this address — no password.`) +
    paragraph(`Reply to this email any time — it comes straight to ${escapeHtml(owner)}.<br/>— ${escapeHtml(owner)}`) +
    receiptRows(order, pricing);
  const r = await sendCompanyMail(company, {
    to: order.customerEmail,
    subject: "You're in — next step is your Brand Voice Interview",
    template: "order_welcome",
    body,
    footer: `${escapeHtml(company.name)} · Activity-based marketing, not paid advertising.`,
    actionUrl: links.intake,
    metadata: { orderId: order.id },
  });
  await db.update(ordersTable).set({ receiptSentAt: new Date(), updatedAt: new Date() }).where(eq(ordersTable.id, order.id));
  if (!r.success) logger.warn({ orderId: order.id, error: r.error }, "Welcome email not delivered");
}

async function notifyOwnerOfOrder(company: Company, order: Order, pricing: OrderPricing): Promise<void> {
  if (!company.ownerEmail) return;
  const base = await companyBaseUrl(company);
  const consoleUrl = `${env.appUrl}/app`;
  await sendCompanyMail(company, {
    to: company.ownerEmail,
    subject: `New order · ${pricing.offer.name} · ${order.customerName}`,
    template: "order_owner_alert",
    body:
      heading(`${order.customerName} just bought the ${pricing.offer.name}`) +
      paragraph(`${cents(order.amountCents)} ${pricing.split ? `today, ${pricing.installments - 1} more installment${pricing.installments > 2 ? "s" : ""} scheduled` : "paid in full"}${pricing.bumps.length ? ` · ${pricing.bumps.map((b) => b.label).join(", ")}` : ""}.`) +
      paragraph(`${escapeHtml(order.customerEmail)}${order.customerPhone ? ` · ${escapeHtml(order.customerPhone)}` : ""}`) +
      button(consoleUrl, "Open the console", "#0A1626") +
      paragraph(`Their portal lives at ${escapeHtml(base)}.`),
    actionUrl: consoleUrl,
    replyTo: order.customerEmail,
    metadata: { orderId: order.id },
  });
}

// ---------------------------------------------------------------------------
// Installments
// ---------------------------------------------------------------------------

/** Statuses an installment can be (re)claimed from for collection. */
const COLLECTABLE = ["scheduled", "failed"];

/**
 * Collect one installment: charge the saved card off-session (live), or record money taken
 * elsewhere (`manual` — never touches the card), or settle it in demo mode.
 *
 * The row is claimed first (scheduled|failed → processing, attempts + 1) in one UPDATE, so two
 * schedulers on two autoscale instances, or a scheduler tick racing a console click, can never
 * both charge it. The Stripe idempotency key is tied to that attempt number.
 */
export async function chargeInstallment(installment: OrderInstallment, opts: { manual?: boolean } = {}): Promise<{ ok: boolean; pending?: boolean; error: string | null; installment: OrderInstallment }> {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, installment.orderId)).limit(1);
  if (!order) return { ok: false, error: "Order not found", installment };
  const [current] = await db.select().from(orderInstallmentsTable).where(eq(orderInstallmentsTable.id, installment.id)).limit(1);
  if (!current) return { ok: false, error: "Installment not found", installment };
  if (current.status === "paid") return { ok: true, error: null, installment: current };
  if (!COLLECTABLE.includes(current.status)) return { ok: false, error: current.status === "processing" ? "This payment is already being processed" : `This installment is ${current.status}`, installment: current };
  if (order.status !== "paid") return { ok: false, error: `The order is ${order.status}`, installment: current };

  const mode = checkoutMode();
  const useCard = mode === "live" && !opts.manual;
  if (useCard && !(order.stripeCustomerId && order.stripePaymentMethodId)) {
    const [updated] = await db.update(orderInstallmentsTable).set({ attempts: current.attempts + 1, status: "failed", lastError: "No saved card on this order", updatedAt: new Date() }).where(and(eq(orderInstallmentsTable.id, current.id), inArray(orderInstallmentsTable.status, COLLECTABLE))).returning();
    return { ok: false, error: "No saved card on this order", installment: updated ?? current };
  }

  const [claimed] = await db
    .update(orderInstallmentsTable)
    .set({ status: "processing", attempts: sql`${orderInstallmentsTable.attempts} + 1`, lastError: null, updatedAt: new Date() })
    .where(and(eq(orderInstallmentsTable.id, current.id), inArray(orderInstallmentsTable.status, COLLECTABLE)))
    .returning();
  if (!claimed) {
    const [now] = await db.select().from(orderInstallmentsTable).where(eq(orderInstallmentsTable.id, current.id)).limit(1);
    return { ok: now?.status === "paid", error: now?.status === "paid" ? null : "This payment is already being processed", installment: now ?? current };
  }

  if (!useCard) {
    // Demo mode, or a manual "mark paid" for money taken outside Stripe.
    const updated = await settleInstallmentPaid(claimed.id, null);
    if (updated) await afterInstallmentPaid(order, updated);
    return { ok: true, error: null, installment: updated ?? claimed };
  }

  const account = order.stripeAccountId ?? (await companyStripeAccount(order.companyId));
  if (!account) {
    const [updated] = await db.update(orderInstallmentsTable).set({ status: "failed", lastError: "No connected Stripe account", updatedAt: new Date() }).where(eq(orderInstallmentsTable.id, claimed.id)).returning();
    return { ok: false, error: "No connected Stripe account", installment: updated };
  }
  const r = await chargeOffSession(account, {
    amountCents: claimed.amountCents,
    currency: order.currency,
    customerId: order.stripeCustomerId!,
    paymentMethodId: order.stripePaymentMethodId!,
    description: `${order.offerName} · payment ${claimed.seq} of ${order.installments} · ${order.publicId}`,
    metadata: { orderPublicId: order.publicId, installmentSeq: String(claimed.seq), companyId: String(order.companyId) },
    idempotencyKey: `inst-${claimed.id}-${claimed.attempts}`,
  });
  if (r.ok) {
    const updated = await settleInstallmentPaid(claimed.id, r.paymentIntentId);
    if (updated) await afterInstallmentPaid(order, updated);
    const [final] = updated ? [updated] : await db.select().from(orderInstallmentsTable).where(eq(orderInstallmentsTable.id, claimed.id));
    return { ok: true, error: null, installment: final };
  }
  if (r.pending) {
    // Stays "processing"; payment_intent.succeeded / payment_failed settles it.
    const [updated] = await db.update(orderInstallmentsTable).set({ stripePaymentIntentId: r.paymentIntentId, updatedAt: new Date() }).where(eq(orderInstallmentsTable.id, claimed.id)).returning();
    return { ok: false, pending: true, error: "Stripe is still processing this payment", installment: updated };
  }
  const [updated] = await db
    .update(orderInstallmentsTable)
    .set({ status: "failed", lastError: r.error, stripePaymentIntentId: r.paymentIntentId ?? claimed.stripePaymentIntentId, updatedAt: new Date() })
    .where(and(eq(orderInstallmentsTable.id, claimed.id), eq(orderInstallmentsTable.status, "processing")))
    .returning();
  return { ok: false, error: r.error, installment: updated ?? claimed };
}

/** processing|scheduled|failed → paid, exactly once. Returns the row only for the caller that made the transition. */
async function settleInstallmentPaid(installmentId: number, paymentIntentId: string | null): Promise<OrderInstallment | null> {
  const [row] = await db
    .update(orderInstallmentsTable)
    .set({ status: "paid", paidAt: new Date(), lastError: null, updatedAt: new Date(), ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}) })
    .where(and(eq(orderInstallmentsTable.id, installmentId), inArray(orderInstallmentsTable.status, ["processing", "scheduled", "failed"])))
    .returning();
  return row ?? null;
}

/** The order an installment PaymentIntent belongs to, only if it came from that order's connected account. */
async function installmentForIntent(pi: { id: string; metadata: Record<string, string> | null | undefined }, accountId: string | null): Promise<{ order: Order; installment: OrderInstallment } | null> {
  const publicId = pi.metadata?.orderPublicId;
  const seq = Number(pi.metadata?.installmentSeq);
  if (!publicId || !Number.isInteger(seq)) return null;
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.publicId, publicId)).limit(1);
  if (!order) return null;
  if (!order.stripeAccountId || order.stripeAccountId !== accountId) {
    logger.warn({ orderId: order.id, accountId, expected: order.stripeAccountId, pi: pi.id }, "Installment event from an account that does not own the order — ignored");
    return null;
  }
  const [installment] = await db.select().from(orderInstallmentsTable).where(and(eq(orderInstallmentsTable.orderId, order.id), eq(orderInstallmentsTable.seq, seq))).limit(1);
  return installment ? { order, installment } : null;
}

/** payment_intent.succeeded for an installment (e.g. one that was still "processing" when charged). */
export async function applyInstallmentSucceeded(pi: { id: string; amount: number; currency: string; metadata: Record<string, string> | null | undefined }, accountId: string | null): Promise<string | null> {
  const found = await installmentForIntent(pi, accountId);
  if (!found) return null;
  if (pi.amount !== found.installment.amountCents || pi.currency.toLowerCase() !== found.order.currency.toLowerCase()) return `amount ${pi.amount} ${pi.currency} does not match installment ${found.installment.amountCents} ${found.order.currency}`;
  const updated = await settleInstallmentPaid(found.installment.id, pi.id);
  if (updated) await afterInstallmentPaid(found.order, updated);
  return null;
}

/** payment_intent.payment_failed for an installment. Never downgrades a paid (or canceled/refunded) one; ignores stale attempts. */
export async function applyInstallmentFailed(pi: { id: string; metadata: Record<string, string> | null | undefined; last_payment_error?: { message?: string } | null }, accountId: string | null): Promise<void> {
  const found = await installmentForIntent(pi, accountId);
  if (!found) return;
  await db
    .update(orderInstallmentsTable)
    .set({ status: "failed", lastError: pi.last_payment_error?.message ?? "Payment failed", stripePaymentIntentId: pi.id, updatedAt: new Date() })
    .where(and(eq(orderInstallmentsTable.id, found.installment.id), inArray(orderInstallmentsTable.status, ["processing", "scheduled", "failed"]), or(isNull(orderInstallmentsTable.stripePaymentIntentId), eq(orderInstallmentsTable.stripePaymentIntentId, pi.id))));
}

async function afterInstallmentPaid(order: Order, installment: OrderInstallment): Promise<void> {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, order.companyId)).limit(1);
  if (!company) return;
  if (order.leadId) {
    const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId)).limit(1);
    if (lead) await logActivity(lead, "order", `Payment ${installment.seq} of ${order.installments} received · ${cents(installment.amountCents)}`, { meta: { orderId: order.id, installmentId: installment.id } });
  }
  try {
    await sendCompanyMail(company, {
      to: order.customerEmail,
      subject: `Receipt · payment ${installment.seq} of ${order.installments} · ${order.offerName}`,
      template: "installment_receipt",
      body: heading(`Payment ${installment.seq} of ${order.installments} received`) + paragraph(`${cents(installment.amountCents)} for your ${escapeHtml(order.offerName)} went through on ${installment.paidAt?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) ?? "today"}. Reference ${escapeHtml(order.publicId.toUpperCase())}.`),
      metadata: { orderId: order.id, installmentId: installment.id },
    });
  } catch (err) {
    logger.warn({ err, installmentId: installment.id }, "Installment receipt failed");
  }
}

/**
 * An installment left "processing" with no PaymentIntent for an hour means the process died between
 * claiming it and hearing back from Stripe. We cannot know whether the card was charged, so it is
 * surfaced as failed with a note to check Stripe — never retried automatically.
 */
export async function releaseStuckInstallments(olderThanMs = 60 * 60_000): Promise<number> {
  const rows = await db
    .update(orderInstallmentsTable)
    .set({ status: "failed", lastError: "Interrupted while charging — check the Stripe dashboard for this payment before retrying", updatedAt: new Date() })
    .where(and(eq(orderInstallmentsTable.status, "processing"), isNull(orderInstallmentsTable.stripePaymentIntentId), lt(orderInstallmentsTable.updatedAt, new Date(Date.now() - olderThanMs))))
    .returning({ id: orderInstallmentsTable.id });
  if (rows.length) logger.warn({ installmentIds: rows.map((r) => r.id) }, "Released installments stuck in processing");
  return rows.length;
}

/** Charge every installment that is due and not yet paid (hourly). */
export async function runDueInstallments(): Promise<number> {
  await releaseStuckInstallments();
  const due = await db
    .select()
    .from(orderInstallmentsTable)
    .where(and(eq(orderInstallmentsTable.status, "scheduled"), or(isNull(orderInstallmentsTable.dueAt), lte(orderInstallmentsTable.dueAt, new Date()))))
    .limit(50);
  let charged = 0;
  if (checkoutMode() !== "live") return 0; // demo installments are settled from the console, never silently
  for (const inst of due) {
    const r = await chargeInstallment(inst);
    if (r.ok) charged++;
  }
  return charged;
}

export interface RefundFacts {
  paymentIntentId: string;
  chargeId: string | null;
  /** Cumulative refunded on this charge (Stripe's charge.amount_refunded), so replays and reordering are harmless. */
  amountRefundedCents: number;
  /** charge.refunded: the whole charge is refunded. */
  fully: boolean;
  accountId: string | null;
}

/**
 * Refund seen at Stripe. Matches the checkout charge (order) or an installment charge, only on the
 * account that owns the order. A full refund of the checkout charge marks the order refunded; a partial
 * one keeps it paid and records the amount. Nothing else (portal, stages) is undone automatically.
 */
export async function recordRefund(f: RefundFacts): Promise<{ order: Order; target: "order" | "installment" } | null> {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.stripePaymentIntentId, f.paymentIntentId)).limit(1);
  let target: "order" | "installment" = "order";
  let owner = order ?? null;
  let installment: OrderInstallment | null = null;
  if (!owner) {
    [installment] = await db.select().from(orderInstallmentsTable).where(eq(orderInstallmentsTable.stripePaymentIntentId, f.paymentIntentId)).limit(1);
    if (!installment) return null;
    [owner] = await db.select().from(ordersTable).where(eq(ordersTable.id, installment.orderId)).limit(1);
    if (!owner) return null;
    target = "installment";
  }
  if (!owner.stripeAccountId || owner.stripeAccountId !== f.accountId) {
    logger.warn({ orderId: owner.id, accountId: f.accountId, expected: owner.stripeAccountId }, "Refund event from an account that does not own the order — ignored");
    return null;
  }
  const now = new Date();
  let updated: Order = owner;
  let changed = false;
  if (target === "order") {
    const amount = Math.max(owner.refundedCents, f.amountRefundedCents);
    const fully = f.fully || amount >= owner.amountCents;
    const [row] = await db
      .update(ordersTable)
      .set({ refundedCents: amount, ...(fully ? { status: "refunded", refundedAt: owner.refundedAt ?? now } : {}), updatedAt: now })
      .where(eq(ordersTable.id, owner.id))
      .returning();
    updated = row;
    changed = amount !== owner.refundedCents || (fully && owner.status !== "refunded");
  } else if (installment) {
    const amount = Math.max(installment.refundedCents, f.amountRefundedCents);
    const fully = f.fully || amount >= installment.amountCents;
    await db.update(orderInstallmentsTable).set({ refundedCents: amount, ...(fully ? { status: "refunded" } : {}), updatedAt: now }).where(eq(orderInstallmentsTable.id, installment.id));
    changed = amount !== installment.refundedCents || (fully && installment.status !== "refunded");
  }
  if (changed && owner.leadId) {
    const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, owner.leadId)).limit(1);
    const what = target === "installment" && installment ? `payment ${installment.seq} of ${owner.installments}` : owner.offerName;
    if (lead) await logActivity(lead, "order", `Refund recorded · ${what} · ${cents(f.amountRefundedCents)}${f.fully ? " (full)" : " (partial)"}${f.chargeId ? ` · ${f.chargeId}` : ""}`, { meta: { orderId: owner.id, installmentId: installment?.id ?? null } });
  }
  return { order: updated, target };
}

// ---------------------------------------------------------------------------
// Lifecycle reminders (Buying Flow.dc.html "Also in the sequence")
// ---------------------------------------------------------------------------

/** Intake reminder at +48h when the intake is still empty; interview prep 24h before a booking. */
export async function runLifecycleReminders(): Promise<{ intakeReminders: number; prepNotes: number }> {
  let intakeReminders = 0;
  let prepNotes = 0;
  const cutoff = new Date(Date.now() - 48 * 3600_000);
  const paid = await db.select().from(ordersTable).where(and(eq(ordersTable.status, "paid"), isNull(ordersTable.intakeReminderAt), lte(ordersTable.paidAt, cutoff))).limit(50);
  for (const order of paid) {
    if (!order.clientId) continue;
    const [intake] = await db.select().from(intakesTable).where(eq(intakesTable.clientId, order.clientId)).limit(1);
    await db.update(ordersTable).set({ intakeReminderAt: new Date() }).where(eq(ordersTable.id, order.id));
    if (intake?.completedAt) continue;
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, order.companyId)).limit(1);
    if (!company) continue;
    const links = await orderLinks(company, order);
    const owner = await ownerFirst(company);
    await sendCompanyMail(company, {
      to: order.customerEmail,
      subject: "Three minutes before your interview",
      template: "intake_reminder",
      body: heading("Your intake is still open") + paragraph(`${escapeHtml(owner)} reads it before your Brand Voice Interview so the 90 minutes go to the right places. It takes about three minutes.`) + button(links.intake, "Complete my intake", "#1668F0"),
      actionUrl: links.intake,
      metadata: { orderId: order.id },
    });
    const tw = await companyTwilio(company.id);
    if (tw?.reminders && order.customerPhone) await sendSms(company, { to: order.customerPhone, body: `${company.name}: your 3-minute intake for ${owner} is still open — ${links.intake}`, purpose: "intake_reminder", leadId: order.leadId, clientId: order.clientId });
    intakeReminders++;
  }
  const soon = new Date(Date.now() + 25 * 3600_000);
  const upcoming = await db.select().from(bookingsTable).where(and(eq(bookingsTable.status, "scheduled"), isNull(bookingsTable.prepSentAt), lte(bookingsTable.startAt, soon))).limit(50);
  for (const b of upcoming) {
    if (!b.startAt || b.startAt.getTime() < Date.now()) continue;
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, b.companyId)).limit(1);
    if (!company || !b.inviteeEmail) continue;
    await db.update(bookingsTable).set({ prepSentAt: new Date() }).where(eq(bookingsTable.id, b.id));
    const owner = await ownerFirst(company);
    await sendCompanyMail(company, {
      to: b.inviteeEmail,
      subject: "Tomorrow: your Brand Voice Interview — what to have handy",
      template: "interview_prep",
      body:
        heading("See you tomorrow") +
        paragraph(`Your Brand Voice Interview with ${escapeHtml(owner)} is on ${escapeHtml(b.startAt.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }))}. Talk the way you would to a client — ${escapeHtml(owner)} asks the questions.`) +
        paragraph("Have handy: two or three clients you loved working with, the result you are proudest of, and the question buyers always ask you first."),
      metadata: { bookingId: b.id },
    });
    const tw = await companyTwilio(company.id);
    if (tw?.reminders) {
      const [client] = await db.select().from(clientsTable).where(and(eq(clientsTable.companyId, company.id), eq(clientsTable.email, b.inviteeEmail.toLowerCase()))).limit(1);
      if (client?.phone) await sendSms(company, { to: client.phone, body: `${company.name}: reminder — your Brand Voice Interview with ${owner} is ${b.startAt.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. The Zoom link is in your calendar invite.`, purpose: "interview_prep", clientId: client.id, leadId: b.leadId });
    }
    prepNotes++;
  }
  return { intakeReminders, prepNotes };
}

let timer: ReturnType<typeof setInterval> | null = null;
/** Hourly: due installments and lifecycle reminders. Not started under tests. */
export function startCommerceScheduler(): void {
  if (timer || env.isTest) return;
  const tick = async () => {
    try {
      const charged = await runDueInstallments();
      const r = await runLifecycleReminders();
      const stale = await failStaleAssessments();
      if (charged || r.intakeReminders || r.prepNotes || stale) logger.info({ charged, ...r, staleAssessments: stale }, "Commerce scheduler tick");
    } catch (err) {
      logger.error({ err }, "Commerce scheduler failed");
    }
  };
  timer = setInterval(() => void tick(), 60 * 60_000);
  timer.unref();
  setTimeout(() => void tick(), 30_000).unref();
}
