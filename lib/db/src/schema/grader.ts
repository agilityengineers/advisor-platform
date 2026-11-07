import { pgTable, serial, integer, text, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import type { Rubric, GraderResult, GraderProfile } from "@workspace/shared";
import { companiesTable } from "./companies";
import { leadsTable } from "./crm";

/** Versioned rubrics. companyId null = platform default. One draft per company; published rows are immutable. */
export const graderRubricsTable = pgTable("grader_rubrics", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  status: text("status").$type<"draft" | "published">().notNull().default("draft"),
  rubric: jsonb("rubric").$type<Rubric>().notNull(),
  publishedAt: timestamp("published_at"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("idx_grader_rubrics_company").on(t.companyId), uniqueIndex("uq_grader_rubrics_company_version_status").on(t.companyId, t.version, t.status)]);
export type GraderRubricRow = typeof graderRubricsTable.$inferSelect;

export const profileAssessmentsTable = pgTable("profile_assessments", {
  id: serial("id").primaryKey(),
  publicId: text("public_id").notNull().unique(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  leadId: integer("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  linkedinUrl: text("linkedin_url").notNull(),
  status: text("status").notNull().default("pending"),
  attempt: integer("attempt").notNull().default(1),
  errorMessage: text("error_message"),
  profile: jsonb("profile").$type<GraderProfile>(),
  rawSnapshot: jsonb("raw_snapshot").$type<Record<string, unknown>>(),
  scores: jsonb("scores").$type<GraderResult>(),
  grade: text("grade"),
  rubricVersion: integer("rubric_version"),
  unlocked: boolean("unlocked").notNull().default(false),
  unlockedAt: timestamp("unlocked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("idx_profile_assessments_company").on(t.companyId), index("idx_profile_assessments_lead").on(t.leadId)]);
export type ProfileAssessment = typeof profileAssessmentsTable.$inferSelect;
