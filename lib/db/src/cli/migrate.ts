import { applyMigrations } from "../migrate";
import { pool } from "../index";

applyMigrations({ onProgress: (m) => console.log(`[migrate] ${m}`) })
  .then(async () => {
    await pool.end();
  })
  .catch(async (err) => {
    console.error("[migrate] failed:", err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
