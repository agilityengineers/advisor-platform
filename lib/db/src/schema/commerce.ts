import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { leadsTable } from "./crm";
import { usersTable } from "./users";

/** A paying client (created when an order is paid, or linked to an existing one). */
export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  publicId: text("public_id").notNull().unique(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  leadId: integer("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  linkedin: text("linkedin").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("idx_clients_company").on(t.companyId), index("idx_clients_email").on(t.email)]);
export type Client = typeof clientsTable.$inferSelect;

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  publicId: text("public_id").notNull().unique(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  leadId: integer("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  offerKey: text("offer_key").notNull(),
  offerName: text("offer_name").notNull().default(""),
  /** "full" or "plan" (installments). */
  paymentMode: text("payment_mode").notNull().default("full"),
  installments: integer("installments").notNull().default(1),
  bumps: jsonb("bumps").$type<{ key: string; label: string; amountCents: number }[]>().notNull().default([]),
  amountCents: integer("amount_cents").notNull().default(0),
  currency: text("currency").notNull().default("usd"),
  customerName: text("customer_name").notNull().default(""),
  customerEmail: text("customer_email").notNull().default(""),
  customerPhone: text("customer_phone").notNull().default(""),
  stripeAccountId: text("stripe_account_id"),
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** Saved for off-session installment charges (payment plans). */
  stripeCustomerId: text("stripe_customer_id"),
  stripePaymentMethodId: text("stripe_payment_method_id"),
  status: text("status").notNull().default("pending"),
  /** Lifecycle emails already sent, so the schedulers never repeat one. */
  receiptSentAt: timestamp("receipt_sent_at"),
  intakeReminderAt: timestamp("intake_reminder_at"),
  paidAt: timestamp("paid_at"),
  refundedAt: timestamp("refunded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("idx_orders_company").on(t.companyId), index("idx_orders_stripe_session").on(t.stripeSessionId)]);
export type Order = typeof ordersTable.$inferSelect;

export const orderInstallmentsTable = pgTable("order_installments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  amountCents: integer("amount_cents").notNull(),
  dueAt: timestamp("due_at"),
  status: text("status").notNull().default("scheduled"),
  stripeInvoiceId: text("stripe_invoice_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  paidAt: timestamp("paid_at"),
}, (t) => [index("idx_order_installments_order").on(t.orderId)]);
export type OrderInstallment = typeof orderInstallmentsTable.$inferSelect;

export const intakesTable = pgTable("intakes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "set null" }),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("idx_intakes_client").on(t.clientId)]);
export type Intake = typeof intakesTable.$inferSelect;

/** Portal tracker: 7 stages per client (payment, intake, interview, blueprint, draft, revisions, published). */
export const clientStagesTable = pgTable("client_stages", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  status: text("status").$type<"pending" | "current" | "done" | "scheduled">().notNull().default("pending"),
  sort: integer("sort").notNull().default(0),
  note: text("note").notNull().default(""),
  completedAt: timestamp("completed_at"),
}, (t) => [index("idx_client_stages_client").on(t.clientId)]);
export type ClientStage = typeof clientStagesTable.$inferSelect;

export const clientFilesTable = pgTable("client_files", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  stageKey: text("stage_key").notNull().default(""),
  name: text("name").notNull(),
  url: text("url").notNull(),
  size: integer("size").notNull().default(0),
  contentType: text("content_type").notNull().default(""),
  uploadedBy: integer("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("idx_client_files_client").on(t.clientId)]);
export type ClientFile = typeof clientFilesTable.$inferSelect;
