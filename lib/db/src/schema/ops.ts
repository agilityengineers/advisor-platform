import { pgTable, serial, integer, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";

export const emailLogsTable = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  template: text("template").notNull(),
  /** platform | company */
  sender: text("sender").notNull().default("platform"),
  status: text("status").notNull(),
  providerMessageId: text("provider_message_id"),
  errorMessage: text("error_message"),
  lastEvent: text("last_event"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("idx_email_logs_company").on(t.companyId), index("idx_email_logs_recipient").on(t.recipient)]);

export const emailEventsTable = pgTable("email_events", {
  id: serial("id").primaryKey(),
  emailLogId: integer("email_log_id"),
  companyId: integer("company_id"),
  providerEventId: text("provider_event_id").unique(),
  event: text("event").notNull(),
  recipient: text("recipient").notNull().default(""),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp("occurred_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("idx_email_events_log").on(t.emailLogId)]);

export const smsLogsTable = pgTable("sms_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  direction: text("direction").notNull().default("outbound"),
  to: text("to").notNull(),
  from: text("from").notNull().default(""),
  body: text("body").notNull(),
  purpose: text("purpose").notNull().default(""),
  status: text("status").notNull(),
  providerSid: text("provider_sid"),
  errorMessage: text("error_message"),
  leadId: integer("lead_id"),
  clientId: integer("client_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("idx_sms_logs_company").on(t.companyId)]);

/** Inbound webhooks, idempotent by (provider, event id). Written before processing. */
export const webhookEventsTable = pgTable("webhook_events", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  eventType: text("event_type").notNull().default(""),
  companyId: integer("company_id"),
  payload: jsonb("payload").$type<unknown>().notNull(),
  status: text("status").notNull().default("received"),
  error: text("error"),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
}, (t) => [uniqueIndex("uq_webhook_events_provider_event").on(t.provider, t.eventId)]);

/** Append-only. No FKs so rows outlive the user/company they describe. */
export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  companyId: integer("company_id"),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: integer("resource_id"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("idx_audit_logs_company").on(t.companyId), index("idx_audit_logs_user").on(t.userId)]);

/**
 * A super admin signed in *as* another user (staff or client) to audit or fix their account.
 * The impersonation JWT carries this row's id; a session is live only while `endedAt` is null
 * and `expiresAt` is in the future, so ending it here revokes the token immediately.
 */
export const impersonationSessionsTable = pgTable("impersonation_sessions", {
  id: serial("id").primaryKey(),
  superAdminId: integer("super_admin_id").notNull(),
  targetUserId: integer("target_user_id").notNull(),
  companyId: integer("company_id"),
  reason: text("reason").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  endedAt: timestamp("ended_at"),
  /** "ended" (by the super admin), "expired", or "revoked". */
  endedReason: text("ended_reason"),
  ipAddress: text("ip_address"),
}, (t) => [index("idx_impersonation_sessions_admin").on(t.superAdminId), index("idx_impersonation_sessions_company").on(t.companyId)]);
export type ImpersonationSession = typeof impersonationSessionsTable.$inferSelect;
