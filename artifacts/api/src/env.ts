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
  platformPrimaryDomain: (process.env.PLATFORM_PRIMARY_DOMAIN ?? "advisor-platform.findabusinesspro.com").toLowerCase(),
  platformSubdomainBase: (process.env.PLATFORM_SUBDOMAIN_BASE ?? "advisor-platform.findabusinesspro.com").toLowerCase(),
  platformHosts: list("PLATFORM_HOSTS", [
    "advisor-platform.com",
    "www.advisor-platform.com",
    "advisor-platform.findabusinesspro.com",
    "advisor-platform.authority-desk.com",
  ]),
  appUrl: (process.env.APP_URL ?? (isProduction ? "https://advisor-platform.findabusinesspro.com" : `http://localhost:${process.env.PORT ?? 5000}`)).replace(/\/$/, ""),
  sendgridApiKey: process.env.SENDGRID_API_KEY ?? "",
  platformFromEmail: process.env.PLATFORM_FROM_EMAIL ?? "partner@advisor-platform.findabusinesspro.com",
  platformFromName: process.env.PLATFORM_FROM_NAME ?? "Advisor Platform",
  brightDataApiKey: process.env.BRIGHTDATA_API_KEY ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  corsAllowedOrigins: list("CORS_ALLOWED_ORIGINS", []),
};
