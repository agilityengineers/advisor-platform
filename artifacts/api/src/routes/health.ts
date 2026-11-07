import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, appliedMigrations } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/readyz", async (_req, res) => {
  const checks: Record<string, unknown> = {};
  let ready = true;
  try {
    await db.execute(sql`SELECT 1`);
    checks.db = "up";
    checks.migrations = await appliedMigrations();
  } catch {
    checks.db = "down";
    ready = false;
  }
  res.status(ready ? 200 : 503).json({ status: ready ? "ok" : "unavailable", ...checks });
});

export default router;
