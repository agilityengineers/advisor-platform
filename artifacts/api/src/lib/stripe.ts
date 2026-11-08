import Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { db, companyIntegrationsTable, type Company, type Order } from "@workspace/db";
import { BUMPS, type OrderPricing } from "@workspace/shared";
import { env } from "../env";
import { logger } from "./logger";

/**
 * Stripe Connect (direct charges on the company's connected account).
 *
 *  - "live": the platform Stripe keys are configured and consistent; Checkout
 *    Sessions, webhooks and off-session installment charges all talk to
 *    Stripe. With sk_test_ keys this is Stripe **test mode** (no real money);
 *    sk_live_ keys additionally need STRIPE_LIVE_ENABLED=true.
 *  - "demo": no key outside production. Orders are created and a "demo
 *    payment" button marks them paid so the whole flow can be exercised.
 *  - "off": production without a key, or a key set that fails the checks
 *    below — the checkout answers 503 rather than take money it can't reconcile.
 */
export type CheckoutMode = "live" | "demo" | "off";
export type StripeKeyMode = "test" | "live";

export interface StripeConfigStatus {
  mode: CheckoutMode;
  /** test / live, from the secret key's prefix (null without a usable key). */
  keyMode: StripeKeyMode | null;
  liveEnabled: boolean;
  publishableKey: boolean;
  webhookSecret: boolean;
  connectClientId: boolean;
  /** Why the platform keys can't be used, in words an operator can act on. Empty when fine. */
  problems: string[];
}

export function stripeKeyMode(key: string): StripeKeyMode | null {
  const m = /^(?:sk|rk|pk)_(test|live)_[A-Za-z0-9]+$/.exec(key.trim());
  return m ? (m[1] as StripeKeyMode) : null;
}

type StripeEnv = Pick<typeof env, "stripeSecretKey" | "stripePublishableKey" | "stripeWebhookSecret" | "stripeConnectClientId" | "stripeLiveEnabled" | "checkoutDemo">;

/** Validate the platform keys as a set. Pure, so boot logging, readiness and the checkout agree. */
export function stripeConfig(e: StripeEnv = env): StripeConfigStatus {
  const env = e;
  const secret = env.stripeSecretKey.trim();
  const base = { liveEnabled: env.stripeLiveEnabled, publishableKey: Boolean(env.stripePublishableKey), webhookSecret: Boolean(env.stripeWebhookSecret), connectClientId: Boolean(env.stripeConnectClientId) };
  if (!secret) return { ...base, mode: env.checkoutDemo ? "demo" : "off", keyMode: null, problems: env.checkoutDemo ? [] : ["STRIPE_SECRET_KEY is not set"] };
  const problems: string[] = [];
  const keyMode = stripeKeyMode(secret);
  if (!keyMode || secret.startsWith("pk_")) problems.push("STRIPE_SECRET_KEY is not a Stripe secret key (sk_test_… / sk_live_… or a restricted rk_ key)");
  const pk = env.stripePublishableKey.trim();
  if (!pk) problems.push("STRIPE_PUBLISHABLE_KEY is not set (the embedded Checkout cannot load without it)");
  else if (!pk.startsWith("pk_") || stripeKeyMode(pk) === null) problems.push("STRIPE_PUBLISHABLE_KEY is not a publishable key (pk_test_… / pk_live_…)");
  else if (keyMode && stripeKeyMode(pk) !== keyMode) problems.push(`STRIPE_PUBLISHABLE_KEY is a ${stripeKeyMode(pk)}-mode key but STRIPE_SECRET_KEY is ${keyMode}-mode`);
  const whsec = env.stripeWebhookSecret.trim();
  if (!whsec) problems.push("STRIPE_WEBHOOK_SECRET is not set (installments, refunds and late payments are reconciled by the Connect webhook)");
  else if (!whsec.startsWith("whsec_")) problems.push("STRIPE_WEBHOOK_SECRET is not a webhook signing secret (whsec_…)");
  if (keyMode === "live" && !env.stripeLiveEnabled) problems.push("Live Stripe keys are set but STRIPE_LIVE_ENABLED is not \"true\" — verify the flow in test mode first, then turn it on");
  return { ...base, mode: problems.length ? "off" : "live", keyMode, problems };
}

/** What the Connect webhook endpoint ("events on connected accounts") must send to /api/webhooks/stripe. */
export const STRIPE_WEBHOOK_EVENTS = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "payment_intent.succeeded", "payment_intent.payment_failed", "charge.refunded"] as const;

export function checkoutMode(): CheckoutMode {
  return stripeConfig().mode;
}

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!client) client = new Stripe(env.stripeSecretKey, { typescript: true });
  return client;
}

/**
 * The company's connected account id, when Stripe is connected (or pending onboarding).
 * `chargeable` additionally requires onboarding to be complete (status "connected") — a new
 * Checkout Session needs that; collecting on an existing order only needs the id.
 */
export async function companyStripeAccount(companyId: number, opts: { chargeable?: boolean } = {}): Promise<string | null> {
  const [row] = await db.select().from(companyIntegrationsTable).where(and(eq(companyIntegrationsTable.companyId, companyId), eq(companyIntegrationsTable.provider, "stripe"))).limit(1);
  if (!row || row.status === "not_connected" || row.status === "error") return null;
  if (opts.chargeable && row.status !== "connected") return null;
  const id = String((row.config as Record<string, unknown>).accountId ?? "").trim();
  return /^acct_[A-Za-z0-9]+$/.test(id) ? id : null;
}

/** Whether a visitor can buy from this company right now. */
export async function checkoutReady(companyId: number, featureEnabled: boolean): Promise<{ ready: boolean; mode: CheckoutMode; reason: string | null }> {
  const mode = checkoutMode();
  if (!featureEnabled) return { ready: false, mode, reason: "Stripe checkout is not in this company's plan" };
  if (mode === "off") return { ready: false, mode, reason: "Stripe is not configured on the platform" };
  if (mode === "demo") return { ready: true, mode, reason: null };
  const account = await companyStripeAccount(companyId, { chargeable: true });
  return account ? { ready: true, mode, reason: null } : { ready: false, mode, reason: "The company has not connected Stripe (or finished Stripe onboarding) yet" };
}

export interface SessionResult {
  sessionId: string;
  clientSecret: string | null;
  url: string | null;
  accountId: string;
}

/** An embedded Checkout Session on the company's connected account for this order. */
export async function createCheckoutSession(company: Company, order: Order, pricing: OrderPricing, returnUrl: string): Promise<SessionResult> {
  const account = await companyStripeAccount(company.id, { chargeable: true });
  if (!account) throw new Error("Company has no connected Stripe account");
  const first = pricing.split ? pricing.laterCents : pricing.baseCents;
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: 1,
      price_data: {
        currency: order.currency,
        unit_amount: first,
        product_data: { name: pricing.split ? `${pricing.offer.name} — payment 1 of ${pricing.installments}` : pricing.offer.name, description: pricing.offer.sub },
      },
    },
    ...pricing.bumps.map((b) => ({ quantity: 1, price_data: { currency: order.currency, unit_amount: b.amountCents, product_data: { name: b.label, description: BUMPS[b.key].body } } })),
  ];
  const metadata = { orderPublicId: order.publicId, companyId: String(company.id), offer: order.offerKey, plan: order.paymentMode };
  const session = await stripe().checkout.sessions.create(
    {
      ui_mode: "embedded",
      mode: "payment",
      return_url: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
      customer_email: order.customerEmail,
      customer_creation: "always",
      line_items: lineItems,
      payment_intent_data: { ...(pricing.split ? { setup_future_usage: "off_session" as const } : {}), metadata, description: `${company.name} · ${pricing.offer.name} · ${order.publicId}` },
      metadata,
    },
    { stripeAccount: account },
  );
  return { sessionId: session.id, clientSecret: session.client_secret ?? null, url: session.url ?? null, accountId: account };
}

export interface SessionPayment {
  paid: boolean;
  amountTotal: number | null;
  currency: string | null;
  paymentIntentId: string | null;
  customerId: string | null;
  paymentMethodId: string | null;
}

/** Read a session back (the return page does this so a slow webhook never leaves a buyer waiting). */
export async function readCheckoutSession(sessionId: string, accountId: string): Promise<SessionPayment> {
  const session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] }, { stripeAccount: accountId });
  const pi = typeof session.payment_intent === "string" ? null : session.payment_intent;
  const pm = pi?.payment_method ?? null;
  return {
    paid: session.payment_status === "paid",
    amountTotal: session.amount_total ?? null,
    currency: session.currency ?? null,
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : (pi?.id ?? null),
    customerId: typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null),
    paymentMethodId: typeof pm === "string" ? pm : (pm?.id ?? null),
  };
}

/**
 * A Checkout Session is only proof of payment for an order when it is the session we created for
 * that order, on that order's connected account, for that order's amount. Webhooks are signed by
 * the platform, but every connected (Standard) account owner can create sessions with any metadata.
 */
export function sessionMismatch(order: Pick<Order, "stripeSessionId" | "stripeAccountId" | "amountCents" | "currency">, s: { sessionId: string; accountId: string | null; amountTotal: number | null; currency: string | null }): string | null {
  if (!order.stripeSessionId || order.stripeSessionId !== s.sessionId) return "session id does not match the order";
  if (!order.stripeAccountId || order.stripeAccountId !== s.accountId) return "connected account does not match the order";
  if (s.amountTotal !== null && s.amountTotal !== order.amountCents) return `amount ${s.amountTotal} does not match the order's ${order.amountCents}`;
  if (s.currency && s.currency.toLowerCase() !== order.currency.toLowerCase()) return `currency ${s.currency} does not match the order's ${order.currency}`;
  return null;
}

export interface OffSessionResult {
  /** succeeded */
  ok: boolean;
  /** Stripe accepted it but has not settled (status "processing"); the webhook finishes it. */
  pending: boolean;
  paymentIntentId: string | null;
  error: string | null;
}

/** Charge a later installment off-session with the card saved at checkout. */
export async function chargeOffSession(accountId: string, params: { amountCents: number; currency: string; customerId: string; paymentMethodId: string; description: string; metadata: Record<string, string>; idempotencyKey: string }): Promise<OffSessionResult> {
  try {
    const pi = await stripe().paymentIntents.create(
      { amount: params.amountCents, currency: params.currency, customer: params.customerId, payment_method: params.paymentMethodId, off_session: true, confirm: true, description: params.description, metadata: params.metadata },
      { stripeAccount: accountId, idempotencyKey: params.idempotencyKey },
    );
    if (pi.status === "succeeded") return { ok: true, pending: false, paymentIntentId: pi.id, error: null };
    if (pi.status === "processing") return { ok: false, pending: true, paymentIntentId: pi.id, error: null };
    const error = pi.status === "requires_action" ? "The bank wants the customer to authenticate this payment — send them a payment link or take it another way" : `Payment ${pi.status}`;
    return { ok: false, pending: false, paymentIntentId: pi.id, error };
  } catch (err) {
    const e = err as Stripe.errors.StripeError & { payment_intent?: { id?: string } };
    logger.warn({ err, accountId }, "Off-session installment charge failed");
    return { ok: false, pending: false, paymentIntentId: e.payment_intent?.id ?? null, error: e.message || "Card charge failed" };
  }
}

/** Verify and parse a webhook delivery. */
export function parseStripeEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
  if (!env.stripeWebhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  if (!signature) throw new Error("Missing Stripe-Signature header");
  return stripe().webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
}

/** Stripe Connect OAuth (Standard accounts): the URL a company owner is sent to. */
export function connectAuthorizeUrl(state: string, redirectUri: string, email: string): string | null {
  if (!env.stripeConnectClientId) return null;
  const params = new URLSearchParams({ response_type: "code", client_id: env.stripeConnectClientId, scope: "read_write", state, redirect_uri: redirectUri, "stripe_user[email]": email });
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeConnectCode(code: string): Promise<string> {
  const res = await stripe().oauth.token({ grant_type: "authorization_code", code });
  if (!res.stripe_user_id) throw new Error("Stripe did not return an account id");
  return res.stripe_user_id;
}
