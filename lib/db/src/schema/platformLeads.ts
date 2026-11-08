import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import type { PlatformFormIntent } from "@workspace/shared";
import { companiesTable } from "./companies";

export const PLATFORM_LEAD_STATUSES = ["new", "contacted", "demo_booked", "trial_started", "converted", "closed"] as const;
export type PlatformLeadStatus = (typeof PLATFORM_LEAD_STATUSES)[number];

/**
 * The platform's own pipeline: demo and trial requests from the Advisor Platform
 * landing page. Not a company lead — the platform is not a tenant.
 */
export const platformLeadsTable = pgTable("platform_leads", {
  id: serial("id").primaryKey(),
  publicId: text("public_id").notNull().unique(),
  name: text("name").notNull(),
  company: text("company").notNull().default(""),
  email: text("email").notNull(),
  linkedin: text("linkedin").notNull().default(""),
  intent: text("intent").$type<PlatformFormIntent>().notNull().default("demo"),
  status: text("status").$type<PlatformLeadStatus>().notNull().default("new"),
  notes: text("notes").notNull().default(""),
  /** Set when the request becomes a company on the platform. */
  convertedCompanyId: integer("converted_company_id").references(() => companiesTable.id, { onDelete: "set null" }),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("idx_platform_leads_status").on(t.status), index("idx_platform_leads_email").on(t.email)]);
export type PlatformLead = typeof platformLeadsTable.$inferSelect;
