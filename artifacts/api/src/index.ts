import { createServer } from "node:http";
import { applyMigrations } from "@workspace/db";
import { env } from "./env";
import { createApp } from "./app";
import { logger } from "./lib/logger";
import { initEncryptionKey } from "./lib/encryption";
import { runBootSeed } from "./lib/seed";
import { mountSpa } from "./lib/spa";
import { startDomainRecheckScheduler } from "./lib/domains";
import { startCommerceScheduler } from "./lib/orders";
import { stripeConfig } from "./lib/stripe";
import { graderMode } from "./lib/grader";

async function bootstrap(): Promise<void> {
  if (process.env.SKIP_MIGRATIONS === "true") {
    logger.warn("SKIP_MIGRATIONS=true — starting without applying pending migrations");
  } else {
    await applyMigrations({ onProgress: (m) => logger.info({ migration: true }, m) });
  }

  // Both are startup-critical: encrypt() must never run keyless, and a boot
  // that cannot guarantee the super admin login must not serve traffic.
  const keySource = await initEncryptionKey();
  logger.info({ keySource }, "Encryption key ready");
  await runBootSeed();

  // Payments: say plainly why checkout is off rather than let buyers find out.
  const stripeCfg = stripeConfig();
  if (stripeCfg.problems.length) logger.warn({ checkout: stripeCfg.mode, problems: stripeCfg.problems }, "Stripe checkout is OFF until the platform keys are fixed");
  else logger.info({ checkout: stripeCfg.mode, keyMode: stripeCfg.keyMode, connectOAuth: stripeCfg.connectClientId }, stripeCfg.keyMode === "test" ? "Stripe checkout in TEST mode (no real charges)" : stripeCfg.keyMode === "live" ? "Stripe checkout LIVE — real charges" : "Stripe checkout in demo mode");

  const grader = graderMode();
  if (grader === "live") logger.info("Profile Grader: live (Bright Data)");
  else if (grader === "demo") logger.warn("Profile Grader: DEMO mode — leads are graded on sample profiles, not their LinkedIn data");
  else logger.warn("Profile Grader: OFF — set BRIGHTDATA_API_KEY to grade leads' LinkedIn profiles");
  if (env.isProduction && process.env.GRADER_DEMO === "true") logger.warn("GRADER_DEMO=true is ignored in production");

  const app = createApp();
  const server = createServer(app);
  await mountSpa(app, server);

  server.listen(env.port, "0.0.0.0", () => {
    logger.info({ port: env.port, env: process.env.NODE_ENV }, "Advisor Platform listening");
    startDomainRecheckScheduler();
    startCommerceScheduler();
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down");
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  logger.fatal({ err }, "Fatal error during startup");
  process.exit(1);
});
