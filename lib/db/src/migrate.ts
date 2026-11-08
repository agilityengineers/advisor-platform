import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

/** Arbitrary but fixed: the advisory lock this application takes while migrating. */
const MIGRATION_LOCK_KEY = 7_311_209_042;

/**
 * Find `lib/db/drizzle`, walking up from the working directory.
 *
 * Resolving relative to this module does not survive bundling (esbuild inlines
 * it into artifacts/api/dist). Walking up from cwd works for the API server
 * (started at the repo root), for `pnpm --filter` scripts (started in the
 * package directory), and for tests. MIGRATIONS_DIR overrides it.
 */
export function findMigrationsDirectory(from: string = process.cwd()): string {
  const override = process.env.MIGRATIONS_DIR;
  if (override) {
    if (!existsSync(override)) throw new Error(`MIGRATIONS_DIR is set to "${override}", which does not exist`);
    return resolve(override);
  }
  let current = resolve(from);
  for (let depth = 0; depth < 12; depth++) {
    const candidate = join(current, "lib", "db", "drizzle");
    if (existsSync(join(candidate, "meta", "_journal.json"))) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(
    `Could not find lib/db/drizzle walking up from "${from}". The migrations must ship with the code; ` +
      "set MIGRATIONS_DIR if they live elsewhere in this deployment.",
  );
}

/**
 * Apply pending drizzle-kit migrations under a Postgres advisory lock, so two
 * autoscale instances booting together cannot migrate in parallel.
 */
export async function applyMigrations(options: { directory?: string; onProgress?: (msg: string) => void } = {}): Promise<void> {
  const migrationsFolder = options.directory ?? findMigrationsDirectory();
  const say = options.onProgress ?? (() => {});
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    try {
      say(`Applying migrations from ${migrationsFolder}`);
      await migrate(db, { migrationsFolder });
      say("Migrations up to date");
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
}

/** Names of applied migrations, from drizzle's own ledger. */
export async function appliedMigrations(): Promise<{ count: number }> {
  const { rows } = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM drizzle.__drizzle_migrations");
  return { count: Number(rows[0]?.count ?? 0) };
}
