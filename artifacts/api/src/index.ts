import { createServer } from "node:http";
import { applyMigrations } from "@workspace/db";
import { env } from "./env";
import { createApp } from "./app";
import { logger } from "./lib/logger";
import { initEncryptionKey } from "./lib/encryption";
import { runBootSeed } from "./lib/seed";
import { mountSpa } from "./lib/spa";
import { startDomainRecheckScheduler } from "./lib/domains";

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

  const app = createApp();
  await mountSpa(app);
  const server = createServer(app);

  server.listen(env.port, "0.0.0.0", () => {
    logger.info({ port: env.port, env: process.env.NODE_ENV }, "Advisor Platform listening");
    startDomainRecheckScheduler();
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
