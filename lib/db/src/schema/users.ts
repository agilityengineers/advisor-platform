import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import type { Perms, Role } from "@workspace/shared";
import { companiesTable } from "./companies";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  /** Only the super admin has one today (`clarencewilliams`); staff may sign in with it. */
  username: text("username").unique(),
  /** Null until the person accepts an invite or completes a reset; clients may never have one. */
  passwordHash: text("password_hash"),
  role: text("role").$type<Role>().notNull().default("client"),
  /** Null for the super admin, who bypasses tenant checks. */
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "set null" }),
  /** Granular team permissions (managers / advisors). Admins implicitly have write everywhere. */
  perms: jsonb("perms").$type<Perms>().notNull().default({}),
  phone: text("phone"),
  avatarUrl: text("avatar_url"),
  deactivatedAt: timestamp("deactivated_at"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("idx_users_company").on(t.companyId)]);
export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;

/** Password reset tokens. Only a SHA-256 of the token is stored. */
export const passwordResetsTable = pgTable("password_resets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  requestedIp: text("requested_ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("idx_password_resets_user").on(t.userId)]);

/** Client sign-in links (magic links). Same hashing rules as password resets. */
export const magicLinksTable = pgTable("magic_links", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  requestedIp: text("requested_ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("idx_magic_links_user").on(t.userId)]);
