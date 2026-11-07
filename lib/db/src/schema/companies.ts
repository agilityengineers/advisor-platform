import { pgTable, serial, integer, text, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import type { FeatureOverrides, IntegrationProvider, IntegrationStatus, CompanyStatus, DnsProvider, Perms } from "@workspace/shared";

/** A tenant. Every Admin is a company; plan sets the baseline, overrides win. */
export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerName: text("owner_name").notNull().default(""),
  ownerEmail: text("owner_email").notNull().default(""),
  plan: text("plan").notNull().default("starter"),
  status: text("status").$type<CompanyStatus>().notNull().default("trial"),
  trialEndsAt: timestamp("trial_ends_at"),
  /** { featureKey: true|false } forced on/off by the super admin regardless of plan. */
  overrides: jsonb("overrides").$type<FeatureOverrides>().notNull().default({}),
  suspendedAt: timestamp("suspended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type Company = typeof companiesTable.$inferSelect;
export type InsertCompany = typeof companiesTable.$inferInsert;

export const companyBrandingTable = pgTable("company_branding", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull().default(""),
  tagline: text("tagline").notNull().default(""),
  logoUrl: text("logo_url").notNull().default(""),
  primaryColor: text("primary_color").notNull().default("#1668F0"),
  accentColor: text("accent_color").notNull().default("#0A1626"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("uq_company_branding_company").on(t.companyId)]);
export type CompanyBranding = typeof companyBrandingTable.$inferSelect;

export const customDomainsTable = pgTable("custom_domains", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  domain: text("domain").notNull().unique(),
  verificationToken: text("verification_token").notNull(),
  verificationMethod: text("verification_method").notNull().default("dns_txt"),
  provider: text("provider").$type<DnsProvider>().notNull().default("other"),
  verified: boolean("verified").notNull().default(false),
  verifiedAt: timestamp("verified_at"),
  sslStatus: text("ssl_status").notNull().default("pending"),
  active: boolean("active").notNull().default(false),
  lastCheckedAt: timestamp("last_checked_at"),
  /** Automatic re-checks stop after this moment (48h after creation). */
  recheckUntil: timestamp("recheck_until"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("idx_custom_domains_company").on(t.companyId)]);
export type CustomDomain = typeof customDomainsTable.$inferSelect;

/** Non-secret integration state. Secrets live in company_secrets, referenced by id. */
export const companyIntegrationsTable = pgTable("company_integrations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  provider: text("provider").$type<IntegrationProvider>().notNull(),
  status: text("status").$type<IntegrationStatus>().notNull().default("not_connected"),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  lastError: text("last_error"),
  connectedAt: timestamp("connected_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("uq_company_integrations_provider").on(t.companyId, t.provider)]);
export type CompanyIntegration = typeof companyIntegrationsTable.$inferSelect;

/** Encrypted at rest with PLATFORM_ENCRYPTION_KEY. Never returned to the browser; last4 only. */
export const companySecretsTable = pgTable("company_secrets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  provider: text("provider").$type<IntegrationProvider>().notNull(),
  name: text("name").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  last4: text("last4").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("uq_company_secrets_name").on(t.companyId, t.provider, t.name)]);
export type CompanySecret = typeof companySecretsTable.$inferSelect;

export const teamInvitesTable = pgTable("team_invites", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  role: text("role").notNull().default("advisor"),
  perms: jsonb("perms").$type<Perms>().notNull().default({}),
  /** SHA-256 of the emailed token. The token itself is never stored. */
  tokenHash: text("token_hash").notNull().unique(),
  status: text("status").notNull().default("pending"),
  invitedBy: integer("invited_by"),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("idx_team_invites_company").on(t.companyId), index("idx_team_invites_email").on(t.email)]);
export type TeamInvite = typeof teamInvitesTable.$inferSelect;
