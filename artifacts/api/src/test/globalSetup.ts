/**
 * Vitest global setup: migrate and seed the test database once per run.
 * Needs DATABASE_URL (CI provides one; locally use a scratch database).
 */
export default async function setup(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to run the API tests");
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
