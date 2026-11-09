/**
 * Vitest global setup: migrate and seed the test database once per run.
 * Migrations and seeding are limited to the explicitly configured scratch database.
 */
import { resolveTestDatabaseUrl } from "./databaseSafety";

export default async function setup(): Promise<void> {
  process.env.DATABASE_URL = resolveTestDatabaseUrl(process.env);
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
  process.env.PLATFORM_ENCRYPTION_KEY ??= "test-encryption-key-0123456789abcdef";
  process.env.SUPER_ADMIN_PASSWORD ??= "TestSuperAdmin!2026";
  process.env.MTC_ADMIN_PASSWORD ??= "TestMtcAdmin!2026";
  const { applyMigrations, pool } = await import("@workspace/db");
  await applyMigrations();
  const { initEncryptionKey } = await import("../lib/encryption");
  await initEncryptionKey();
  const { runBootSeed } = await import("../lib/seed");
  await runBootSeed();
  await pool.end();
}
