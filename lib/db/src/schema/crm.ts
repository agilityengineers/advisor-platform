import { pgTable, serial, integer, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import type { StageKind } from "@workspace/shared";
import { companiesTable } from "./companies";

export const pipelineStagesTable = pgTable("pipeline_stages", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").$type<StageKind>().notNull().default("open"),
  color: text("color").notNull().default("#1668F0"),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("idx_pipeline_stages_company").on(t.companyId)]);
export type PipelineStage = typeof pipelineStagesTable.$inferSelect;

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  /** Opaque id for public URLs (grade report, booking). */
  publicId: text("public_id").notNull().unique(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  category: text("category").notNull().default(""),
  linkedin: text("linkedin").notNull().default(""),
  goal: text("goal").notNull().default(""),
  stageId: integer("stage_id").references(() => pipelineStagesTable.id, { onDelete: "set null" }),
  source: text("source").notNull().default("landing_form"),
  ownerUserId: integer("owner_user_id"),
  /** Platform-pipeline leads (demo / trial requests) carry the intent here. */
  intent: text("intent"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  bookedAt: timestamp("booked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("idx_leads_company").on(t.companyId), index("idx_leads_company_stage").on(t.companyId, t.stageId), index("idx_leads_email").on(t.email)]);
export type Lead = typeof leadsTable.$inferSelect;

export const leadActivityTable = pgTable("lead_activity", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull(),
  type: text("type").notNull(),
  body: text("body").notNull().default(""),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  actorUserId: integer("actor_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("idx_lead_activity_lead").on(t.leadId)]);
export type LeadActivity = typeof leadActivityTable.$inferSelect;

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  leadId: integer("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  orderId: integer("order_id"),
  provider: text("provider").notNull().default("calendly"),
  eventUri: text("event_uri").notNull().default(""),
  inviteeUri: text("invitee_uri").notNull().default(""),
  inviteeEmail: text("invitee_email").notNull().default(""),
  startAt: timestamp("start_at"),
  endAt: timestamp("end_at"),
  status: text("status").notNull().default("scheduled"),
  raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("idx_bookings_company").on(t.companyId), uniqueIndex("uq_bookings_invitee").on(t.inviteeUri)]);
export type Booking = typeof bookingsTable.$inferSelect;
