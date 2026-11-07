import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

/** Pricing plans. Seeded from DEFAULT_PLANS; the feature matrix is editable in Platform Admin. */
export const plansTable = pgTable("plans", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  /** Monthly price in whole dollars; null = custom. */
  price: integer("price"),
  desc: text("desc").notNull().default(""),
  featureKeys: jsonb("feature_keys").$type<string[]>().notNull().default([]),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type Plan = typeof plansTable.$inferSelect;

export const platformConfigTable = pgTable("platform_config", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
