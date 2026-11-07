import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: ["./src/test/globalSetup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      RATE_LIMIT_STORE: "memory",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "test-session-secret-0123456789abcdef",
      PLATFORM_ENCRYPTION_KEY: process.env.PLATFORM_ENCRYPTION_KEY ?? "test-encryption-key-0123456789abcdef",
      SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD ?? "TestSuperAdmin!2026",
      MTC_ADMIN_PASSWORD: process.env.MTC_ADMIN_PASSWORD ?? "TestMtcAdmin!2026",
    },
  },
});
