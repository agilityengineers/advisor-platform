/**
 * Payments in Stripe TEST mode: platform keys are sk_test_/pk_test_/whsec_, the Connect webhook is
 * signed and verified for real (stripe-node's own signer), and only the outbound Stripe API calls
 * (Checkout Sessions, PaymentIntents) are faked — so the suite runs in CI without network or keys.
 *
 * Covers what has to hold before live charges are switched on: checkout on the connected account,
 * fulfilment exactly once (return page racing the webhook), tenant/amount checks on every event,
 * webhook idempotency and retry-after-failure, installments claimed once and never downgraded,
 * "mark paid" never touching the card, and full/partial refunds on orders and installments.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_platform0000000000";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_platform0000000000";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_testsecret0000000000";
  process.env.STRIPE_LIVE_ENABLED = "";
  return {
    sessions: new Map<string, Record<string, unknown>>(),
    sessionCreates: [] as { params: Record<string, unknown>; opts: Record<string, unknown> }[],
    piCreates: [] as { params: Record<string, unknown>; opts: Record<string, unknown> }[],
    /** What the next off-session PaymentIntent does. */
    piOutcome: "succeeded" as "succeeded" | "processing" | "declined",
    piDelayMs: 0,
    seq: 0,
  };
});

vi.mock("stripe", async (importOriginal) => {
  const mod = await importOriginal<typeof import("stripe")>();
  const Real = mod.default;
  class FakeStripe extends Real {
    constructor(...args: ConstructorParameters<typeof Real>) {
      super(...args);
      const self = this as unknown as Record<string, unknown>;
      self.checkout = {
        sessions: {
          create: async (params: Record<string, unknown>, opts: Record<string, unknown>) => {
            fake.sessionCreates.push({ params, opts });
            const id = `cs_test_${++fake.seq}`;
            const lineItems = params.line_items as { price_data: { unit_amount: number } }[];
            const session = { id, object: "checkout.session", client_secret: `${id}_secret`, url: null, amount_total: lineItems.reduce((s, l) => s + l.price_data.unit_amount, 0), currency: "usd", payment_status: "unpaid", metadata: params.metadata, customer: null, payment_intent: null, account: opts.stripeAccount };
            fake.sessions.set(id, session);
            return session;
          },
          retrieve: async (id: string) => {
            const s = fake.sessions.get(id);
            if (!s) throw new Error(`No such session ${id}`);
            return s;
          },
        },
      };
      self.paymentIntents = {
        create: async (params: Record<string, unknown>, opts: Record<string, unknown>) => {
          fake.piCreates.push({ params, opts });
          if (fake.piDelayMs) await new Promise((r) => setTimeout(r, fake.piDelayMs));
          const id = `pi_test_inst_${++fake.seq}`;
          if (fake.piOutcome === "declined") {
            const err = new Error("Your card was declined.") as Error & { payment_intent: { id: string } };
            err.payment_intent = { id };
            throw err;
          }
          return { id, status: fake.piOutcome, amount: params.amount, currency: params.currency, metadata: params.metadata };
        },
      };
    }
  }
  return { ...mod, default: FakeStripe };
});

import Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { db, pool, companiesTable, companyIntegrationsTable, ordersTable, orderInstallmentsTable, clientsTable, emailLogsTable, webhookEventsTable } from "@workspace/db";
import { startTestServer, type TestServer } from "../test/harness";
import { MTC_ADMIN_EMAIL, MTC_SLUG } from "../lib/seed";
import { chargeInstallment, releaseStuckInstallments, runDueInstallments } from "../lib/orders";
import { checkoutMode, stripeConfig } from "../lib/stripe";

const ACCT = "acct_1TestMtcConnected";
const OTHER = "acct_1SomeoneElse";
const HOST = `${MTC_SLUG}.advisor-platform.findabusinesspro.com`;
const signer = new Stripe("sk_test_signer");

let server: TestServer;
let mtcId = 0;
let adminToken = "";
let superToken = "";
let eventSeq = 0;
/** Each simulated buyer comes from its own address, so the public-form rate limit stays on. */
let buyerIp = 0;

function signedEvent(type: string, object: Record<string, unknown>, opts: { account?: string | null; id?: string } = {}) {
  const event = { id: opts.id ?? `evt_test_${Date.now()}_${++eventSeq}`, object: "event", api_version: "2025-01-01", created: Math.floor(Date.now() / 1000), type, data: { object }, ...(opts.account === null ? {} : { account: opts.account ?? ACCT }), livemode: false };
  const payload = JSON.stringify(event);
  const header = signer.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
  return { event, payload, header };
}

async function deliver(type: string, object: Record<string, unknown>, opts: { account?: string | null; id?: string } = {}) {
  const { event, payload, header } = signedEvent(type, object, opts);
  const res = await fetch(`${server.url}/api/webhooks/stripe`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header }, body: payload });
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, eventId: event.id };
}

async function startCheckout(email: string, plan: "full" | "split") {
  const r = await server.api<{ mode: string; orderId: string; clientSecret: string; publishableKey: string; accountId: string; dueTodayCents: number }>("/api/public/checkout", { method: "POST", host: HOST, headers: { "x-forwarded-for": `198.51.100.${++buyerIp}` }, body: JSON.stringify({ offer: "voice", plan, bumps: {}, name: "Test Buyer", email }) });
  expect(r.status).toBe(201);
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.publicId, r.body.orderId));
  return { res: r.body, order };
}

/** The buyer finished paying in Stripe's embedded Checkout. */
function completeSession(sessionId: string, pi: string) {
  const s = fake.sessions.get(sessionId)!;
  Object.assign(s, { payment_status: "paid", status: "complete", customer: `cus_test_${sessionId}`, payment_intent: { id: pi, object: "payment_intent", payment_method: `pm_test_${sessionId}` } });
  return { ...s, payment_intent: pi, customer: `cus_test_${sessionId}` };
}

const welcomeCount = async (email: string) => (await db.select().from(emailLogsTable).where(and(eq(emailLogsTable.recipient, email), eq(emailLogsTable.template, "order_welcome")))).length;

beforeAll(async () => {
  server = await startTestServer();
  const [mtc] = await db.select().from(companiesTable).where(eq(companiesTable.slug, MTC_SLUG));
  mtcId = mtc.id;
  await db.update(companyIntegrationsTable).set({ status: "connected", config: { accountId: ACCT, chargesEnabled: true } }).where(and(eq(companyIntegrationsTable.companyId, mtcId), eq(companyIntegrationsTable.provider, "stripe")));
  adminToken = (await server.api<{ token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: MTC_ADMIN_EMAIL, password: process.env.MTC_ADMIN_PASSWORD }) })).body.token;
  superToken = (await server.api<{ token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: "clarencewilliams", password: process.env.SUPER_ADMIN_PASSWORD }) })).body.token;
});

afterAll(async () => {
  await db.update(companyIntegrationsTable).set({ status: "not_connected", config: {} }).where(and(eq(companyIntegrationsTable.companyId, mtcId), eq(companyIntegrationsTable.provider, "stripe")));
  await server.close();
  await pool.end();
});

beforeEach(() => {
  fake.piOutcome = "succeeded";
  fake.piDelayMs = 0;
});

describe("platform configuration", () => {
  it("runs Stripe in test mode with a consistent key set", () => {
    expect(stripeConfig()).toMatchObject({ mode: "live", keyMode: "test", problems: [] });
    expect(checkoutMode()).toBe("live");
  });

  it("refuses live keys until STRIPE_LIVE_ENABLED, and mismatched or missing keys outright", () => {
    const base = { stripeSecretKey: "sk_live_abc123", stripePublishableKey: "pk_live_abc123", stripeWebhookSecret: "whsec_x", stripeConnectClientId: "", stripeLiveEnabled: false, checkoutDemo: false };
    const notYet = stripeConfig(base);
    expect(notYet.mode).toBe("off");
    expect(notYet.problems.join(" ")).toMatch(/STRIPE_LIVE_ENABLED/);
    expect(stripeConfig({ ...base, stripeLiveEnabled: true })).toMatchObject({ mode: "live", keyMode: "live", problems: [] });

    const mixed = stripeConfig({ ...base, stripeSecretKey: "sk_test_abc123" });
    expect(mixed.mode).toBe("off");
    expect(mixed.problems.join(" ")).toMatch(/live-mode key but STRIPE_SECRET_KEY is test-mode/);

    const noHook = stripeConfig({ ...base, stripeSecretKey: "sk_test_abc123", stripePublishableKey: "pk_test_abc123", stripeWebhookSecret: "" });
    expect(noHook.mode).toBe("off");
    expect(noHook.problems.join(" ")).toMatch(/STRIPE_WEBHOOK_SECRET is not set/);

    expect(stripeConfig({ ...base, stripeSecretKey: "pk_test_abc123" }).problems.join(" ")).toMatch(/not a Stripe secret key/);
    expect(stripeConfig({ ...base, stripeSecretKey: "", checkoutDemo: true })).toMatchObject({ mode: "demo", problems: [] });
    expect(stripeConfig({ ...base, stripeSecretKey: "", checkoutDemo: false })).toMatchObject({ mode: "off" });
  });

  it("reports readiness to the super admin only", async () => {
    expect((await server.api("/api/admin/payments/readiness", { token: adminToken })).status).toBe(403);
    const r = await server.api<{ platform: { mode: string; keyMode: string; problems: string[]; webhookUrl: string; requiredEvents: string[] }; companies: { slug: string; checkoutReady: boolean; accountId: string | null }[] }>("/api/admin/payments/readiness", { token: superToken });
    expect(r.status).toBe(200);
    expect(r.body.platform).toMatchObject({ mode: "live", keyMode: "test", problems: [] });
    expect(r.body.platform.webhookUrl).toMatch(/\/api\/webhooks\/stripe$/);
    expect(r.body.platform.requiredEvents).toContain("charge.refunded");
    expect(r.body.companies.find((c) => c.slug === MTC_SLUG)).toMatchObject({ checkoutReady: true, accountId: ACCT });
  });

  it("does not open checkout for a company whose Stripe onboarding is unfinished", async () => {
    await db.update(companyIntegrationsTable).set({ status: "pending" }).where(and(eq(companyIntegrationsTable.companyId, mtcId), eq(companyIntegrationsTable.provider, "stripe")));
    try {
      const r = await server.api<{ reason: string }>("/api/public/checkout", { method: "POST", host: HOST, body: JSON.stringify({ offer: "voice", plan: "full", bumps: {}, name: "Early Bird", email: `early-${Date.now()}@example.com` }) });
      expect(r.status).toBe(409);
      expect(r.body.reason).toMatch(/onboarding/);
    } finally {
      await db.update(companyIntegrationsTable).set({ status: "connected" }).where(and(eq(companyIntegrationsTable.companyId, mtcId), eq(companyIntegrationsTable.provider, "stripe")));
    }
  });
});

describe("checkout + fulfilment (test mode)", () => {
  it("creates an embedded Checkout Session on the company's connected account", async () => {
    const email = `split-${Date.now()}@example.com`;
    const { res, order } = await startCheckout(email, "split");
    expect(res).toMatchObject({ mode: "live", publishableKey: "pk_test_platform0000000000", accountId: ACCT });
    expect(res.clientSecret).toMatch(/^cs_test_/);
    const call = fake.sessionCreates.at(-1)!;
    expect(call.opts).toMatchObject({ stripeAccount: ACCT });
    expect(call.params).toMatchObject({ ui_mode: "embedded", mode: "payment", customer_email: email, payment_intent_data: { setup_future_usage: "off_session" }, metadata: { orderPublicId: order.publicId } });
    expect(order).toMatchObject({ status: "pending", stripeAccountId: ACCT, amountCents: res.dueTodayCents });
  });

  it("rejects unsigned and forged deliveries", async () => {
    const forged = await fetch(`${server.url}/api/webhooks/stripe`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=deadbeef" }, body: "{}" });
    expect(forged.status).toBe(400);
    const missing = await fetch(`${server.url}/api/webhooks/stripe`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(missing.status).toBe(400);
  });

  it("ignores a completed session from another account, for another amount, or not the order's session", async () => {
    const email = `spoof-${Date.now()}@example.com`;
    const { order } = await startCheckout(email, "full");
    const session = completeSession(order.stripeSessionId!, "pi_test_spoof");
    expect((await deliver("checkout.session.completed", session, { account: OTHER })).body).toMatchObject({ received: true, ignored: true });
    expect((await deliver("checkout.session.completed", { ...session, amount_total: 100 })).body).toMatchObject({ ignored: true });
    expect((await deliver("checkout.session.completed", { ...session, id: "cs_test_not_ours" })).body).toMatchObject({ ignored: true });
    const [after] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
    expect(after.status).toBe("pending");
    const [ignored] = await db.select().from(webhookEventsTable).where(and(eq(webhookEventsTable.provider, "stripe"), eq(webhookEventsTable.status, "ignored")));
    expect(ignored.error).toMatch(/does not match/);
  });

  it("fulfils exactly once when the return page and the webhook arrive together, and dedupes redeliveries", async () => {
    const email = `race-${Date.now()}@example.com`;
    const { order } = await startCheckout(email, "split");
    const session = completeSession(order.stripeSessionId!, "pi_test_race_first");
    const { event, payload, header } = signedEvent("checkout.session.completed", session);
    const hook = () => fetch(`${server.url}/api/webhooks/stripe`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header }, body: payload }).then((r) => r.status);
    const returnPage = () => server.api<{ order: { status: string } }>(`/api/public/orders/${order.publicId}?session_id=${order.stripeSessionId}`, { host: HOST });
    const [a, b, c] = await Promise.all([hook(), returnPage(), returnPage()]);
    expect(a).toBe(200);
    expect([b.body.order.status, c.body.order.status]).toEqual(["paid", "paid"]);

    expect(await welcomeCount(email)).toBe(1);
    expect(await db.select().from(clientsTable).where(and(eq(clientsTable.companyId, mtcId), eq(clientsTable.email, email)))).toHaveLength(1);
    const [paid] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
    expect(paid).toMatchObject({ status: "paid", stripePaymentIntentId: "pi_test_race_first", stripeCustomerId: `cus_test_${order.stripeSessionId}`, stripePaymentMethodId: `pm_test_${order.stripeSessionId}` });
    expect(await db.select().from(orderInstallmentsTable).where(eq(orderInstallmentsTable.orderId, order.id))).toHaveLength(1);

    // Stripe redelivers the same event: acknowledged, nothing repeated.
    const again = await fetch(`${server.url}/api/webhooks/stripe`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header }, body: payload });
    expect(await again.json()).toMatchObject({ duplicate: true });
    expect(await welcomeCount(email)).toBe(1);
    expect(event.id).toBeTruthy();
  });

  it("re-processes an event whose first delivery failed (the retry is the point)", async () => {
    const email = `retry-${Date.now()}@example.com`;
    const { order } = await startCheckout(email, "full");
    const session = completeSession(order.stripeSessionId!, "pi_test_retry");
    const eventId = `evt_test_retry_${Date.now()}`;
    await db.insert(webhookEventsTable).values({ provider: "stripe", eventId, eventType: "checkout.session.completed", payload: {}, status: "failed", error: "database was down" });
    const r = await deliver("checkout.session.completed", session, { id: eventId });
    expect(r.body).toMatchObject({ received: true });
    expect(r.body.duplicate).toBeUndefined();
    const [after] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
    expect(after.status).toBe("paid");
    const [row] = await db.select().from(webhookEventsTable).where(and(eq(webhookEventsTable.provider, "stripe"), eq(webhookEventsTable.eventId, eventId)));
    expect(row).toMatchObject({ status: "processed", error: null });
  });
});

describe("installments (test mode)", () => {
  async function paidSplitOrder(tag: string) {
    const email = `${tag}-${Date.now()}@example.com`;
    const { order } = await startCheckout(email, "split");
    await deliver("checkout.session.completed", completeSession(order.stripeSessionId!, `pi_test_${tag}_first`));
    const [inst] = await db.select().from(orderInstallmentsTable).where(eq(orderInstallmentsTable.orderId, order.id));
    await db.update(orderInstallmentsTable).set({ dueAt: new Date(Date.now() - 60_000) }).where(eq(orderInstallmentsTable.id, inst.id));
    const [o] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
    return { order: o, inst: { ...inst, dueAt: new Date(Date.now() - 60_000) }, email };
  }

  it("charges a due installment off-session on the connected account with the saved card", async () => {
    const { order, inst } = await paidSplitOrder("due");
    const before = fake.piCreates.length;
    expect(await runDueInstallments()).toBeGreaterThanOrEqual(1);
    const call = fake.piCreates.slice(before).find((c) => (c.params.metadata as Record<string, string>).orderPublicId === order.publicId)!;
    expect(call.opts).toEqual({ stripeAccount: ACCT, idempotencyKey: `inst-${inst.id}-1` });
    expect(call.params).toMatchObject({ amount: inst.amountCents, customer: order.stripeCustomerId, payment_method: order.stripePaymentMethodId, off_session: true, confirm: true });
    const [after] = await db.select().from(orderInstallmentsTable).where(eq(orderInstallmentsTable.id, inst.id));
    expect(after).toMatchObject({ status: "paid", attempts: 1 });
    expect(after.stripePaymentIntentId).toMatch(/^pi_test_inst_/);
  });

  it("never charges the same installment twice when two collectors race", async () => {
    const { order, inst } = await paidSplitOrder("dup");
    fake.piDelayMs = 150;
    const before = fake.piCreates.length;
    const results = await Promise.all([chargeInstallment(inst), chargeInstallment(inst), chargeInstallment(inst)]);
    const calls = fake.piCreates.slice(before).filter((c) => (c.params.metadata as Record<string, string>).orderPublicId === order.publicId);
    expect(calls).toHaveLength(1);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const receipts = await db.select().from(emailLogsTable).where(and(eq(emailLogsTable.recipient, order.customerEmail), eq(emailLogsTable.template, "installment_receipt")));
    expect(receipts).toHaveLength(1);
  });

  it("\"mark paid\" records money taken elsewhere without touching the saved card", async () => {
    const { order, inst } = await paidSplitOrder("manual");
    const before = fake.piCreates.length;
    const r = await server.api<{ ok: boolean; installment: { status: string } }>(`/api/companies/${mtcId}/orders/${order.id}/installments/${inst.id}`, { method: "POST", token: adminToken, body: JSON.stringify({ action: "mark_paid" }) });
    expect(r.status).toBe(200);
    expect(r.body.installment.status).toBe("paid");
    expect(fake.piCreates.length).toBe(before);
  });

  it("a decline is recorded; a late failure event never downgrades a paid installment", async () => {
    const { order, inst } = await paidSplitOrder("decline");
    fake.piOutcome = "declined";
    const declined = await chargeInstallment(inst);
    expect(declined).toMatchObject({ ok: false, error: "Your card was declined." });
    expect(declined.installment.status).toBe("failed");
    const failedPi = declined.installment.stripePaymentIntentId!;

    // Staff retry from the console succeeds (new attempt, new idempotency key).
    fake.piOutcome = "succeeded";
    const before = fake.piCreates.length;
    const retried = await chargeInstallment(declined.installment);
    expect(retried.ok).toBe(true);
    expect(fake.piCreates[before].opts).toMatchObject({ idempotencyKey: `inst-${inst.id}-2` });

    // Stripe delivers the first attempt's failure late.
    await deliver("payment_intent.payment_failed", { id: failedPi, object: "payment_intent", amount: inst.amountCents, currency: "usd", metadata: { orderPublicId: order.publicId, installmentSeq: String(inst.seq) }, last_payment_error: { message: "declined" } });
    const [after] = await db.select().from(orderInstallmentsTable).where(eq(orderInstallmentsTable.id, inst.id));
    expect(after.status).toBe("paid");
  });

  it("a payment Stripe is still processing is settled (with receipt) by payment_intent.succeeded — only from the owning account", async () => {
    const { order, inst } = await paidSplitOrder("async");
    fake.piOutcome = "processing";
    const r = await chargeInstallment(inst);
    expect(r).toMatchObject({ ok: false, pending: true });
    expect(r.installment.status).toBe("processing");
    const pi = { id: r.installment.stripePaymentIntentId!, object: "payment_intent", amount: inst.amountCents, currency: "usd", metadata: { orderPublicId: order.publicId, installmentSeq: String(inst.seq) } };

    await deliver("payment_intent.succeeded", pi, { account: OTHER });
    expect((await db.select().from(orderInstallmentsTable).where(eq(orderInstallmentsTable.id, inst.id)))[0].status).toBe("processing");
    expect((await deliver("payment_intent.succeeded", { ...pi, amount: 1 })).body).toMatchObject({ ignored: true });
    expect((await db.select().from(orderInstallmentsTable).where(eq(orderInstallmentsTable.id, inst.id)))[0].status).toBe("processing");

    await deliver("payment_intent.succeeded", pi);
    const [after] = await db.select().from(orderInstallmentsTable).where(eq(orderInstallmentsTable.id, inst.id));
    expect(after.status).toBe("paid");
    const receipts = await db.select().from(emailLogsTable).where(and(eq(emailLogsTable.recipient, order.customerEmail), eq(emailLogsTable.template, "installment_receipt")));
    expect(receipts).toHaveLength(1);
  });

  it("an installment abandoned mid-charge is surfaced for a human, never retried blindly", async () => {
    const { inst } = await paidSplitOrder("stuck");
    await db.update(orderInstallmentsTable).set({ status: "processing", updatedAt: new Date(Date.now() - 2 * 3600_000) }).where(eq(orderInstallmentsTable.id, inst.id));
    expect(await releaseStuckInstallments()).toBeGreaterThanOrEqual(1);
    const [after] = await db.select().from(orderInstallmentsTable).where(eq(orderInstallmentsTable.id, inst.id));
    expect(after.status).toBe("failed");
    expect(after.lastError).toMatch(/check the Stripe dashboard/);
  });
});

describe("refunds (test mode)", () => {
  it("partial refund keeps the order paid with the amount; full refund marks it refunded; replays are harmless", async () => {
    const email = `refund-${Date.now()}@example.com`;
    const { order } = await startCheckout(email, "full");
    await deliver("checkout.session.completed", completeSession(order.stripeSessionId!, "pi_test_refund"));
    const charge = { id: "ch_test_refund", object: "charge", payment_intent: "pi_test_refund", amount: order.amountCents };

    expect((await deliver("charge.refunded", { ...charge, amount_refunded: 10_000, refunded: true }, { account: OTHER })).body).toMatchObject({ ignored: true });
    expect((await db.select().from(ordersTable).where(eq(ordersTable.id, order.id)))[0]).toMatchObject({ status: "paid", refundedCents: 0 });

    await deliver("charge.refunded", { ...charge, amount_refunded: 10_000, refunded: false });
    expect((await db.select().from(ordersTable).where(eq(ordersTable.id, order.id)))[0]).toMatchObject({ status: "paid", refundedCents: 10_000 });

    await deliver("charge.refunded", { ...charge, amount_refunded: order.amountCents, refunded: true });
    // An older partial event delivered late doesn't lower the recorded amount.
    await deliver("charge.refunded", { ...charge, amount_refunded: 10_000, refunded: false });
    const [after] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
    expect(after).toMatchObject({ status: "refunded", refundedCents: order.amountCents });
    expect(after.refundedAt).not.toBeNull();

    // A late confirmation can't resurrect a refunded order.
    const back = await server.api<{ order: { status: string } }>(`/api/public/orders/${order.publicId}?session_id=${order.stripeSessionId}`, { host: HOST });
    expect(back.body.order.status).toBe("refunded");
  });

  it("refunds of an installment charge land on that installment", async () => {
    const email = `instrefund-${Date.now()}@example.com`;
    const { order } = await startCheckout(email, "split");
    await deliver("checkout.session.completed", completeSession(order.stripeSessionId!, "pi_test_instrefund_first"));
    const [inst] = await db.select().from(orderInstallmentsTable).where(eq(orderInstallmentsTable.orderId, order.id));
    const r = await chargeInstallment(inst);
    expect(r.ok).toBe(true);
    await deliver("charge.refunded", { id: "ch_test_inst", object: "charge", payment_intent: r.installment.stripePaymentIntentId, amount: inst.amountCents, amount_refunded: inst.amountCents, refunded: true });
    const [after] = await db.select().from(orderInstallmentsTable).where(eq(orderInstallmentsTable.id, inst.id));
    expect(after).toMatchObject({ status: "refunded", refundedCents: inst.amountCents });
    expect((await db.select().from(ordersTable).where(eq(ordersTable.id, order.id)))[0].status).toBe("paid");
  });
});
