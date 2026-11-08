import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  pool,
  usersTable,
  companiesTable,
  companyBrandingTable,
  companyIntegrationsTable,
  plansTable,
  pipelineStagesTable,
  reviewsTable,
  siteContentTable,
  graderRubricsTable,
  landingTemplatesTable,
  type Company,
} from "@workspace/db";
import { DEFAULT_PLANS, DEFAULT_STAGES, DEFAULT_TEMPLATES, GRADER_DEFAULT, INTEGRATION_PROVIDERS, PLATFORM, REVIEWS_SEED, DEFAULT_PERMS } from "@workspace/shared";
import { env } from "../env";
import { logger } from "./logger";

export const MTC_SLUG = "mytargetclient";
export const MTC_ADMIN_EMAIL = "briantraichel@gmail.com";

const DEV_SUPER_ADMIN_PASSWORD = "Success2026";

/** Plans: insert what is missing, never overwrite an edited feature matrix. */
export async function ensurePlans(): Promise<void> {
  for (const plan of DEFAULT_PLANS) {
    await db
      .insert(plansTable)
      .values({ key: plan.key, name: plan.name, price: plan.price, desc: plan.desc, featureKeys: [...plan.featureKeys], sort: plan.sort, active: true })
      .onConflictDoNothing({ target: plansTable.key });
  }
}

/**
 * The canonical super admin, ensured on every boot. Password re-synced from
 * SUPER_ADMIN_PASSWORD (mandatory in production; dev falls back to a known
 * default with a warning). Idempotent upsert on the unique email.
 */
export async function ensureSuperAdmin(): Promise<void> {
  let password = env.superAdminPassword;
  if (!password) {
    if (env.isProduction) throw new Error("SUPER_ADMIN_PASSWORD must be set in production. Refusing to boot with a public default.");
    password = DEV_SUPER_ADMIN_PASSWORD;
    logger.warn("SUPER_ADMIN_PASSWORD not set — using the built-in development password for the super admin");
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await db
    .insert(usersTable)
    .values({ name: PLATFORM.superAdmin.name, email: PLATFORM.superAdmin.email, username: PLATFORM.superAdmin.username, passwordHash, role: "super_admin", companyId: null })
    .onConflictDoUpdate({
      target: usersTable.email,
      set: { passwordHash, role: "super_admin", username: PLATFORM.superAdmin.username, companyId: null, deactivatedAt: null, updatedAt: new Date() },
    });
  // Exactly one super admin login is ever valid.
  await db
    .update(usersTable)
    .set({ deactivatedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(usersTable.role, "super_admin"), isNull(usersTable.deactivatedAt), eq(usersTable.email, usersTable.email)))
    .then(() => undefined)
    .catch(() => undefined);
  // The statement above cannot express "not this email" portably with the same helper; do it explicitly:
  const others = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable).where(eq(usersTable.role, "super_admin"));
  for (const other of others) {
    if (other.email === PLATFORM.superAdmin.email) {
      await db.update(usersTable).set({ deactivatedAt: null }).where(eq(usersTable.id, other.id));
    } else {
      await db.update(usersTable).set({ deactivatedAt: new Date() }).where(eq(usersTable.id, other.id));
      logger.warn({ email: other.email }, "Deactivated non-canonical super admin");
    }
  }
  logger.info({ email: PLATFORM.superAdmin.email }, "Super admin ensured");
}

export interface SeedCompanyInput {
  name: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  plan: string;
  status: "trial" | "active" | "comp";
  overrides?: Record<string, boolean>;
  branding: { companyName: string; tagline: string; logoUrl: string; primaryColor: string; accentColor: string };
  adminPassword?: string;
  publishDefaults?: boolean;
  team?: { name: string; email: string; role: "manager" | "advisor"; perms?: Record<string, "none" | "read" | "write"> }[];
}

/** Everything a brand-new company needs: stages, integrations rows, rubric v1. Idempotent. */
export async function provisionCompanyDefaults(company: Company): Promise<void> {
  const stages = await db.select({ id: pipelineStagesTable.id }).from(pipelineStagesTable).where(eq(pipelineStagesTable.companyId, company.id)).limit(1);
  if (stages.length === 0) {
    await db.insert(pipelineStagesTable).values(DEFAULT_STAGES.map((s, i) => ({ companyId: company.id, name: s.name, kind: s.kind, color: s.color, sort: i })));
  }
  for (const provider of INTEGRATION_PROVIDERS) {
    await db.insert(companyIntegrationsTable).values({ companyId: company.id, provider, status: "not_connected" }).onConflictDoNothing();
  }
  const rubric = await db.select({ id: graderRubricsTable.id }).from(graderRubricsTable).where(and(eq(graderRubricsTable.companyId, company.id), eq(graderRubricsTable.status, "published"))).limit(1);
  if (rubric.length === 0) {
    await db.insert(graderRubricsTable).values({ companyId: company.id, version: 1, status: "published", rubric: GRADER_DEFAULT, publishedAt: new Date() });
  }
}

export async function ensureCompany(input: SeedCompanyInput): Promise<Company> {
  await db
    .insert(companiesTable)
    .values({ name: input.name, slug: input.slug, ownerName: input.ownerName, ownerEmail: input.ownerEmail, plan: input.plan, status: input.status, overrides: input.overrides ?? {} })
    .onConflictDoNothing({ target: companiesTable.slug });
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.slug, input.slug)).limit(1);
  if (!company) throw new Error(`Failed to ensure company ${input.slug}`);

  await db
    .insert(companyBrandingTable)
    .values({ companyId: company.id, ...input.branding })
    .onConflictDoNothing();

  const existingAdmin = await db.select().from(usersTable).where(eq(usersTable.email, input.ownerEmail)).limit(1);
  const passwordHash = input.adminPassword ? await bcrypt.hash(input.adminPassword, 10) : null;
  if (existingAdmin.length === 0) {
    await db.insert(usersTable).values({ name: input.ownerName, email: input.ownerEmail, passwordHash, role: "admin", companyId: company.id });
  } else if (passwordHash && !existingAdmin[0].passwordHash) {
    await db.update(usersTable).set({ passwordHash, updatedAt: new Date() }).where(eq(usersTable.id, existingAdmin[0].id));
  } else if (passwordHash && !env.isProduction) {
    await db.update(usersTable).set({ passwordHash, updatedAt: new Date() }).where(eq(usersTable.id, existingAdmin[0].id));
  }

  for (const member of input.team ?? []) {
    await db
      .insert(usersTable)
      .values({ name: member.name, email: member.email, passwordHash: null, role: member.role, companyId: company.id, perms: member.perms ?? DEFAULT_PERMS[member.role] })
      .onConflictDoNothing({ target: usersTable.email });
  }

  await provisionCompanyDefaults(company);

  if (input.publishDefaults) {
    await db
      .insert(siteContentTable)
      .values({ companyId: company.id, status: "published", content: {}, version: 1, publishedAt: new Date() })
      .onConflictDoNothing();
  }
  return company;
}

/** My Target Client — the first company (an Admin), never the platform. */
export async function ensureMtcCompany(): Promise<Company> {
  const company = await ensureCompany({
    name: "My Target Client",
    slug: MTC_SLUG,
    ownerName: "Brian Traichel",
    ownerEmail: MTC_ADMIN_EMAIL,
    plan: "white_label",
    status: "active",
    overrides: { authority_desk: true },
    branding: { companyName: "My Target Client", tagline: "Better profiles, stronger connection", logoUrl: "/uploads/ptc-logo-no-tag-line-8c493deb.png", primaryColor: "#1668F0", accentColor: "#0A1626" },
    adminPassword: env.mtcAdminPassword || undefined,
    publishDefaults: true,
  });

  const existingReviews = await db.select({ id: reviewsTable.id }).from(reviewsTable).where(eq(reviewsTable.companyId, company.id)).limit(1);
  if (existingReviews.length === 0) {
    await db.insert(reviewsTable).values(
      REVIEWS_SEED.map((r, i) => ({ companyId: company.id, name: r.name, role: r.role, category: r.category, linkedin: r.linkedin, quote: r.quote, reviewedOn: r.date, visible: r.visible, sort: i })),
    );
  }
  return company;
}

export async function ensureTemplates(): Promise<void> {
  for (const t of DEFAULT_TEMPLATES) {
    await db
      .insert(landingTemplatesTable)
      .values({ slug: t.slug, name: t.name, source: t.source, audience: t.audience, summary: t.summary, content: t.content, isDefault: true })
      .onConflictDoNothing({ target: landingTemplatesTable.slug });
  }
}

export async function ensurePlatformRubric(): Promise<void> {
  const existing = await db.select({ id: graderRubricsTable.id }).from(graderRubricsTable).where(and(isNull(graderRubricsTable.companyId), eq(graderRubricsTable.status, "published"))).limit(1);
  if (existing.length === 0) {
    await db.insert(graderRubricsTable).values({ companyId: null, version: 1, status: "published", rubric: GRADER_DEFAULT, publishedAt: new Date() });
  }
}

/** Prototype stand-ins from platform.js. Development only (SEED_DEMO=true). */
export async function seedDemoCompanies(): Promise<void> {
  await ensureCompany({
    name: "Northstar Advisory", slug: "northstar", ownerName: "Dana Whitfield", ownerEmail: "dana@whitfieldadvisory.com", plan: "professional", status: "trial",
    branding: { companyName: "Northstar Advisory", tagline: "", logoUrl: "", primaryColor: "#1668F0", accentColor: "#0A1626" },
  });
  await ensureCompany({
    name: "Career Pro Guider", slug: "careerproguider", ownerName: "Troy Heiner", ownerEmail: "troy@careerproguider.com", plan: "starter", status: "active", overrides: { sendgrid: true },
    branding: { companyName: "Career Pro Guider", tagline: "", logoUrl: "", primaryColor: "#1668F0", accentColor: "#0A1626" },
  });
  const mtc = await db.select().from(companiesTable).where(eq(companiesTable.slug, MTC_SLUG)).limit(1);
  if (mtc[0]) {
    for (const m of [
      { name: "Alicia Morgan", email: "alicia@mytargetclient.com", role: "manager" as const, perms: { clients: "write", pipeline: "write", website: "read", reviews: "write", billing: "read", team: "read" } as const },
      { name: "Devon Price", email: "devon@mytargetclient.com", role: "advisor" as const, perms: { clients: "write", pipeline: "write", website: "none", reviews: "none", billing: "none", team: "none" } as const },
    ]) {
      await db.insert(usersTable).values({ name: m.name, email: m.email, role: m.role, companyId: mtc[0].id, perms: { ...m.perms } }).onConflictDoNothing({ target: usersTable.email });
    }
  }
}

/** Arbitrary but fixed: serialises the boot seed across autoscale instances. */
const SEED_LOCK_KEY = 7_311_209_043;

/** Runs on every boot. Order matters: plans → super admin → MTC → templates → platform rubric. */
export async function runBootSeed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [SEED_LOCK_KEY]);
    try {
      await ensurePlans();
      await ensureSuperAdmin();
      await ensureMtcCompany();
      await ensureTemplates();
      await ensurePlatformRubric();
      if (env.seedDemo && !env.isProduction) await seedDemoCompanies();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [SEED_LOCK_KEY]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
}
