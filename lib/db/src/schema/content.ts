import { pgTable, serial, integer, text, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import type { SiteContentOverrides } from "@workspace/shared";
import { companiesTable } from "./companies";

export type ContentStatus = "draft" | "published";

/** Company landing-page content: one draft row and one published row per company. */
export const siteContentTable = pgTable("site_content", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  status: text("status").$type<ContentStatus>().notNull(),
  content: jsonb("content").$type<SiteContentOverrides>().notNull().default({}),
  version: integer("version").notNull().default(1),
  publishedAt: timestamp("published_at"),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("uq_site_content_company_status").on(t.companyId, t.status)]);
export type SiteContentRow = typeof siteContentTable.$inferSelect;

/** Advisor Platform landing content (super admin CMS). One draft, one published. */
export const platformContentTable = pgTable("platform_content", {
  id: serial("id").primaryKey(),
  status: text("status").$type<ContentStatus>().notNull().unique(),
  content: jsonb("content").$type<Record<string, unknown>>().notNull().default({}),
  version: integer("version").notNull().default(1),
  publishedAt: timestamp("published_at"),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const landingTemplatesTable = pgTable("landing_templates", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  source: text("source").notNull().default(""),
  audience: text("audience").notNull().default(""),
  summary: text("summary").notNull().default(""),
  sourceCompanyId: integer("source_company_id").references(() => companiesTable.id, { onDelete: "set null" }),
  content: jsonb("content").$type<SiteContentOverrides>().notNull().default({}),
  tokens: jsonb("tokens").$type<string[]>().notNull().default(["{company}", "{owner}", "{ownerFirst}"]),
  isDefault: boolean("is_default").notNull().default(false),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type LandingTemplateRow = typeof landingTemplatesTable.$inferSelect;

export const reviewsTable = pgTable("reviews", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  category: text("category").notNull().default(""),
  linkedin: text("linkedin").notNull().default(""),
  quote: text("quote").notNull(),
  reviewedOn: text("reviewed_on").notNull().default(""),
  visible: boolean("visible").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("idx_reviews_company").on(t.companyId)]);
export type Review = typeof reviewsTable.$inferSelect;
