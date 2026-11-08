import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, bookingsTable, clientsTable, intakesTable, leadsTable, ordersTable, type Company, type Order } from "@workspace/db";
import { CheckoutBody, IntakeBody, BookedBody, ownerFirstName } from "@workspace/shared";
import { publicFormLimiter } from "../lib/rateLimit";
import { companyFeatures } from "../lib/features";
import { checkoutMode, checkoutReady, createCheckoutSession, readCheckoutSession } from "../lib/stripe";
import { createPendingOrder, fulfillOrder, orderByPublicId, orderLinks, pricingFor, installmentsFor } from "../lib/orders";
import { loadClientBundle, setStageStatus, stageViews } from "../lib/portal";
import { logActivity, normalizeLinkedin } from "../lib/leads";
import { sendCompanyMail } from "../lib/companyMail";
import { heading, paragraph, escapeHtml, button } from "../lib/email";
import { publishedContent } from "./siteContent";
import { env } from "../env";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function companyOr404(req: Request, res: Response): Company | null {
  const tenant = req.tenant;
  if (!tenant || tenant.kind !== "company") {
    res.status(404).json({ error: "No company at this address" });
    return null;
  }
  if (tenant.company.status === "suspended") {
    res.status(410).json({ error: "This site is suspended" });
    return null;
  }
  return tenant.company;
}

/** Start a purchase: a pending order and, in live mode, an embedded Checkout Session on the company's account. */
router.post("/public/checkout", publicFormLimiter, async (req, res) => {
  const company = companyOr404(req, res);
  if (!company) return;
  const parsed = CheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    if (first?.path[0] === "website") {
      res.status(202).json({ ok: true });
      return;
    }
    res.status(400).json({ error: first?.message ?? "Please check the form", field: first?.path[0] ?? null });
    return;
  }
  const features = await companyFeatures(company);
  const ready = await checkoutReady(company.id, features.stripe_checkout);
  if (!ready.ready) {
    res.status(ready.mode === "off" ? 503 : 409).json({ error: ready.mode === "off" ? "Online checkout isn't available yet. Book a call instead." : "This company hasn't finished setting up checkout. Book a call instead.", reason: ready.reason });
    return;
  }
  const { website: _hp, ...input } = parsed.data;
  const { order, pricing } = await createPendingOrder(company, { ...input, meta: { ip: req.ip ?? null } });
  const links = await orderLinks(company, order);
  if (ready.mode === "demo") {
    res.status(201).json({ mode: "demo", orderId: order.publicId, dueTodayCents: pricing.dueTodayCents, thanksUrl: links.thanks });
    return;
  }
  try {
    const session = await createCheckoutSession(company, order, pricing, links.thanks);
    await db.update(ordersTable).set({ stripeSessionId: session.sessionId, stripeAccountId: session.accountId, updatedAt: new Date() }).where(eq(ordersTable.id, order.id));
    res.status(201).json({ mode: "live", orderId: order.publicId, dueTodayCents: pricing.dueTodayCents, clientSecret: session.clientSecret, url: session.url, publishableKey: env.stripePublishableKey || null, accountId: session.accountId, thanksUrl: links.thanks });
  } catch (err) {
    logger.error({ err, orderId: order.id }, "Stripe Checkout Session failed");
    res.status(502).json({ error: "Stripe couldn't start the checkout. Please try again in a moment." });
  }
});

async function orderPayload(company: Company, orderRow: Order) {
  const pricing = pricingFor(orderRow);
  const lead = orderRow.leadId ? ((await db.select().from(leadsTable).where(eq(leadsTable.id, orderRow.leadId)).limit(1))[0] ?? null) : null;
  const links = await orderLinks(company, orderRow, lead);
  const [client] = orderRow.clientId ? await db.select().from(clientsTable).where(eq(clientsTable.id, orderRow.clientId)).limit(1) : [];
  const published = await publishedContent(company);
  const brand = published.content.brand;
  const owner = ownerFirstName(brand) || company.ownerName.split(/\s+/)[0] || company.name;
  let stages: ReturnType<typeof stageViews> = [];
  let intakeDone = false;
  let booking: { startAt: string | null; confirmed: boolean } | null = null;
  if (client) {
    const bundle = await loadClientBundle(client);
    stages = stageViews(bundle, owner);
    intakeDone = Boolean(bundle.intake?.completedAt);
    const b = bundle.bookings.find((x) => x.status === "scheduled");
    booking = b ? { startAt: b.startAt?.toISOString() ?? null, confirmed: b.confirmed } : null;
  }
  const installments = (await installmentsFor(orderRow.id)).map((i) => ({ seq: i.seq, amountCents: i.amountCents, dueAt: i.dueAt?.toISOString() ?? null, status: i.status, paidAt: i.paidAt?.toISOString() ?? null }));
  return {
    order: {
      publicId: orderRow.publicId,
      status: orderRow.status,
      offer: { key: orderRow.offerKey, name: pricing.offer.name, sub: pricing.offer.sub, includes: pricing.offer.includes },
      plan: pricing.plan,
      installments: pricing.installments,
      bumps: pricing.bumps,
      amountCents: orderRow.amountCents,
      totalCents: pricing.totalCents,
      laterCents: pricing.laterCents,
      customerName: orderRow.customerName,
      firstName: orderRow.customerName.split(/\s+/)[0] || "there",
      customerEmail: orderRow.customerEmail,
      paidAt: orderRow.paidAt?.toISOString() ?? null,
      createdAt: orderRow.createdAt.toISOString(),
      schedule: installments,
    },
    links,
    company: { name: brand.companyName || company.name, ownerFirst: owner, ownerFullName: brand.ownerFullName || company.ownerName, ownerPhoto: brand.ownerPhoto, ownerTitle: brand.ownerTitle, logoUrl: brand.logoUrl, iconUrl: brand.iconUrl },
    intakeDone,
    intake: client ? ((await db.select().from(intakesTable).where(eq(intakesTable.clientId, client.id)).limit(1))[0]?.data ?? {}) : {},
    booking,
    stages,
    checkoutMode: checkoutMode(),
    linkedin: lead?.linkedin ?? client?.linkedin ?? "",
  };
}

/** The buyer's order (thank-you, booking, intake pages). Knowing the unguessable id is the credential. */
router.get("/public/orders/:publicId", async (req, res) => {
  const company = companyOr404(req, res);
  if (!company) return;
  let order = await orderByPublicId(company.id, String(req.params.publicId));
  if (!order) {
    res.status(404).json({ error: "We couldn't find that order" });
    return;
  }
  // The return page beats the webhook: confirm the session directly so nobody waits on Stripe's delivery.
  const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : null;
  if (order.status === "pending" && sessionId && checkoutMode() === "live" && order.stripeSessionId === sessionId && order.stripeAccountId) {
    try {
      const paid = await readCheckoutSession(sessionId, order.stripeAccountId);
      if (paid.paid) order = (await fulfillOrder(order.id, { source: "stripe", sessionId, accountId: order.stripeAccountId, paymentIntentId: paid.paymentIntentId, customerId: paid.customerId, paymentMethodId: paid.paymentMethodId })).order;
    } catch (err) {
      logger.warn({ err, orderId: order.id }, "Could not confirm checkout session on return");
    }
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await orderPayload(company, order));
});

/** Demo mode only: the "Pay" button marks the order paid so the whole flow can be walked without Stripe. */
router.post("/public/orders/:publicId/demo-pay", publicFormLimiter, async (req, res) => {
  const company = companyOr404(req, res);
  if (!company) return;
  if (checkoutMode() !== "demo") {
    res.status(404).json({ error: "Not available" });
    return;
  }
  const order = await orderByPublicId(company.id, String(req.params.publicId));
  if (!order) {
    res.status(404).json({ error: "We couldn't find that order" });
    return;
  }
  const r = await fulfillOrder(order.id, { source: "demo" });
  res.json(await orderPayload(company, r.order));
});

/** Intake (Buying Flow screen 4). */
router.post("/public/orders/:publicId/intake", publicFormLimiter, async (req, res) => {
  const company = companyOr404(req, res);
  if (!company) return;
  const order = await orderByPublicId(company.id, String(req.params.publicId));
  if (!order || order.status !== "paid" || !order.clientId) {
    res.status(404).json({ error: "We couldn't find a paid order for this link" });
    return;
  }
  const parsed = IntakeBody.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    res.status(400).json({ error: first?.message ?? "Please check the form", field: first?.path[0] ?? null });
    return;
  }
  const data = { ...parsed.data, linkedin: normalizeLinkedin(parsed.data.linkedin) };
  const now = new Date();
  const [existing] = await db.select().from(intakesTable).where(eq(intakesTable.clientId, order.clientId)).limit(1);
  if (existing) await db.update(intakesTable).set({ data, completedAt: now, updatedAt: now, orderId: existing.orderId ?? order.id }).where(eq(intakesTable.id, existing.id));
  else await db.insert(intakesTable).values({ companyId: company.id, orderId: order.id, clientId: order.clientId, data, completedAt: now });
  await db.update(clientsTable).set({ name: data.name, phone: data.phone || undefined, linkedin: data.linkedin, updatedAt: now }).where(eq(clientsTable.id, order.clientId));
  if (order.leadId) {
    const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId)).limit(1);
    if (lead) {
      await db.update(leadsTable).set({ linkedin: data.linkedin || lead.linkedin, phone: data.phone || lead.phone, goal: lead.goal || data.knownFor, updatedAt: now }).where(eq(leadsTable.id, lead.id));
      await logActivity(lead, "note", `Intake completed · wants to be known for: ${data.knownFor.slice(0, 200)}`, { meta: { orderId: order.id, intake: true } });
    }
  }
  await setStageStatus(order.clientId, "intake", "done");
  if (company.ownerEmail) {
    void sendCompanyMail(company, {
      to: company.ownerEmail,
      subject: `Intake received · ${data.name}`,
      template: "intake_received", kind: "system",
      body:
        heading(`${data.name} completed their intake`) +
        paragraph(`<strong>LinkedIn:</strong> ${escapeHtml(data.linkedin)}<br/><strong>Known for:</strong> ${escapeHtml(data.knownFor)}<br/><strong>Audience:</strong> ${escapeHtml(data.audience || "—")}<br/><strong>Publish:</strong> ${data.access === "self" ? "They'll paste it themselves" : "Screen-share upload"}`) +
        button(`${env.appUrl}/app`, "Open the console", "#0A1626"),
      replyTo: order.customerEmail,
      metadata: { orderId: order.id },
    }).catch((err) => logger.warn({ err }, "Intake alert failed"));
  }
  res.json(await orderPayload(company, order));
});

/** The browser saw Calendly's `event_scheduled` message: record a provisional booking; the webhook confirms it. */
router.post("/public/orders/:publicId/booked", publicFormLimiter, async (req, res) => {
  const company = companyOr404(req, res);
  if (!company) return;
  const order = await orderByPublicId(company.id, String(req.params.publicId));
  if (!order || order.status !== "paid") {
    res.status(404).json({ error: "We couldn't find a paid order for this link" });
    return;
  }
  const parsed = BookedBody.safeParse(req.body ?? {});
  const body = parsed.success ? parsed.data : { eventUri: "", inviteeUri: "" };
  const inviteeUri = body.inviteeUri || `provisional:${order.publicId}`;
  const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.inviteeUri, inviteeUri)).limit(1);
  if (!existing) {
    await db.insert(bookingsTable).values({ companyId: company.id, leadId: order.leadId, orderId: order.id, provider: "calendly", eventUri: body.eventUri, inviteeUri, inviteeEmail: order.customerEmail, status: "scheduled", confirmed: false, raw: { source: "browser" } });
    if (order.leadId) {
      await db.update(leadsTable).set({ bookedAt: new Date(), updatedAt: new Date() }).where(eq(leadsTable.id, order.leadId));
      const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId)).limit(1);
      if (lead) await logActivity(lead, "booking", "Brand Voice Interview booked via Calendly (awaiting confirmation)", { meta: { orderId: order.id } });
    }
  }
  if (order.clientId) await setStageStatus(order.clientId, "interview", "scheduled", { onlyIfNotDone: true });
  res.json(await orderPayload(company, order));
});

export default router;
