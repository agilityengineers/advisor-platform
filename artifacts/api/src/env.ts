import { randomBytes } from "node:crypto";

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

function required(name: string, devFallback?: () => string): string {
  const value = process.env[name];
  if (value) return value;
  if (!isProduction && devFallback) {
    const generated = devFallback();
    process.env[name] = generated;
    return generated;
  }
  throw new Error(`${name} must be set (add it as a Replit Secret).`);
}

function list(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export const env = {
  isProduction,
  isDevelopment: !isProduction && !isTest,
  isTest,
  port: Number(process.env.PORT ?? 5000),
  logLevel: process.env.LOG_LEVEL ?? (isTest ? "silent" : "info"),
  databaseUrl: required("DATABASE_URL"),
  sessionSecret: required("SESSION_SECRET", () => randomBytes(48).toString("base64url")),
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD ?? "",
  mtcAdminPassword: process.env.MTC_ADMIN_PASSWORD ?? "",
  seedDemo: process.env.SEED_DEMO === "true",
  platformPrimaryDomain: (process.env.PLATFORM_PRIMARY_DOMAIN ?? "advisor-platform.com").toLowerCase(),
  platformSubdomainBase: (process.env.PLATFORM_SUBDOMAIN_BASE ?? "advisor-platform.com").toLowerCase(),
  /** Older subdomain bases that still resolve `<slug>.<base>` (links and CNAMEs issued before the move to advisor-platform.com). */
  platformLegacySubdomainBases: list("PLATFORM_LEGACY_SUBDOMAIN_BASES", ["advisor-platform.findabusinesspro.com"]),
  platformHosts: list("PLATFORM_HOSTS", [
    "advisor-platform.com",
    "www.advisor-platform.com",
    "advisor-platform.findabusinesspro.com",
    "advisor-platform.authority-desk.com",
  ]),
  appUrl: (process.env.APP_URL ?? (isProduction ? "https://advisor-platform.com" : `http://localhost:${process.env.PORT ?? 5000}`)).replace(/\/$/, ""),
  sendgridApiKey: process.env.SENDGRID_API_KEY ?? "",
  platformFromEmail: process.env.PLATFORM_FROM_EMAIL ?? "partner@advisor-platform.findabusinesspro.com",
  platformFromName: process.env.PLATFORM_FROM_NAME ?? "Advisor Platform",
  brightDataApiKey: process.env.BRIGHTDATA_API_KEY ?? "",
  /** Base64 (SPKI DER) public key of the platform SendGrid account's signed Event Webhook; companies add theirs in Integrations. */
  sendgridWebhookPublicKey: process.env.SENDGRID_WEBHOOK_PUBLIC_KEY ?? "",
  /**
   * Grade with deterministic sample profiles instead of Bright Data (automatic outside production without a key).
   * Never in production: GRADER_DEMO is ignored there, so a lead is graded on their real profile or not at all.
   */
  graderDemo: !isProduction && (process.env.GRADER_DEMO === "true" || !process.env.BRIGHTDATA_API_KEY),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  /** Stripe Connect OAuth client id (ca_…) for "Connect with Stripe"; pasting an acct_ id still works without it. */
  stripeConnectClientId: process.env.STRIPE_CONNECT_CLIENT_ID ?? "",
  /**
   * Second key for real money: sk_live_ keys are refused until this is "true", so the platform can only
   * take live charges after test mode has been verified end to end (see "Payments go-live" in replit.md).
   */
  stripeLiveEnabled: process.env.STRIPE_LIVE_ENABLED === "true",
  /** Lets the checkout run without Stripe outside production (orders are marked paid by a demo button). */
  checkoutDemo: process.env.CHECKOUT_DEMO === "true" || (!isProduction && !process.env.STRIPE_SECRET_KEY),
  corsAllowedOrigins: list("CORS_ALLOWED_ORIGINS", []),
};
