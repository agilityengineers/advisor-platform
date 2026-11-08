import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. On Replit, add a Postgres database to the project.");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
export type Db = typeof db;
/** Either the pooled db or a transaction handle — lets helpers run inside tests' rolled-back transactions. */
export type DbExecutor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export * from "./schema";
export * from "./migrate";
