import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, eq, gte, inArray, like, lt, sql } from "drizzle-orm";
import { db, companiesTable, companyIntegrationsTable, webhookEventsTable, companyBrandingTable, plansTable, landingTemplatesTable, siteContentTable, usersTable, auditLogsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import {
  COMPANY_STATUSES,
  FEATURE_KEYS,
  FEATURE_REGISTRY,
  PLATFORM,
  SITE_CONTENT_DEFAULTS,
  fillTemplate,
  isFeatureKey,
  mergeContent,
  slugSchema,
  templateFromContent,
  emailSchema,
  type FeatureOverrides,
  type SiteContentOverrides,
} from "@workspace/shared";
import { authMiddleware, requireSuperAdmin } from "../lib/auth";
import { companyFeatures, getPlans, invalidatePlanCache } from "../lib/features";
import { checkoutReady, stripeConfig, STRIPE_WEBHOOK_EVENTS } from "../lib/stripe";
import { listCompanyRows, companyDetail } from "../lib/companyOverview";
import { provisionCompanyDefaults } from "../lib/seed";
import { createInvite } from "./team";
import { audit } from "../lib/audit";
import { invalidateTenantCache } from "../lib/tenant";
import { env } from "../env";
import { newPlatformLeadCount } from "./platformLeads";

const router: IRouter = Router();
const guard = [authMiddleware, requireSuperAdmin] as const;

const RESERVED_SLUGS = new Set(["www", "api", "app", "admin", "mail", "static", "platform", "advisor-platform", "t"]);

async function loadCompany(id: string | number) {
  const companyId = Number(id);
  if (!Number.isInteger(companyId) || companyId <= 0) return null;
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  return company ?? null;
}

// ---------------------------------------------------------------------------
// Overview + companies
// ---------------------------------------------------------------------------

router.get("/admin/overview", ...guard, async (_req, res) => {
  const [rows, plans, templates, newRequests] = await Promise.all([listCompanyRows(), getPlans(), db.select({ id: landingTemplatesTable.id }).from(landingTemplatesTable), newPlatformLeadCount()]);
  const mrr = rows.filter((r) => r.status === "active").reduce((s, r) => s + (r.planPrice ?? 0), 0);
  res.json({
    kpis: { total: rows.length, active: rows.filter((r) => r.status === "active").length, trial: rows.filter((r) => r.status === "trial").length, comp: rows.filter((r) => r.status === "comp").length, suspended: rows.filter((r) => r.status === "suspended").length, mrr },
    companies: rows,
    plans: plans.map((p) => ({ key: p.key, name: p.name, price: p.price, desc: p.desc, featureKeys: p.featureKeys, sort: p.sort })),
    counts: { companies: rows.length, templates: templates.length, features: FEATURE_REGISTRY.length, plans: plans.length, newRequests },
    platform: { name: PLATFORM.name, domains: PLATFORM.domains, primaryDomain: env.platformPrimaryDomain, subdomainBase: env.platformSubdomainBase, superAdmin: PLATFORM.superAdmin },
  });
});

const CreateCompanyBody = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slugSchema,
  ownerName: z.string().trim().min(2).max(120),
  ownerEmail: emailSchema,
  plan: z.string().min(1),
  status: z.enum(["trial", "active", "comp"]),
});

router.post("/admin/companies", ...guard, async (req, res) => {
  const parsed = CreateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid company", issues: parsed.error.issues });
    return;
  }
  const body = parsed.data;
  if (RESERVED_SLUGS.has(body.slug)) {
    res.status(400).json({ error: "That subdomain is reserved" });
    return;
  }
  const plans = await getPlans();
  if (!plans.some((p) => p.key === body.plan)) {
    res.status(400).json({ error: "Unknown plan" });
    return;
  }
  const [slugTaken] = await db.select({ id: companiesTable.id }).from(companiesTable).where(eq(companiesTable.slug, body.slug)).limit(1);
  if (slugTaken) {
    res.status(409).json({ error: "That subdomain is already taken" });
    return;
  }
  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, body.ownerEmail)).limit(1);
  if (existingUser && existingUser.companyId) {
    res.status(409).json({ error: "That email already belongs to another company's account" });
    return;
  }
  if (existingUser && existingUser.role === "super_admin") {
    res.status(409).json({ error: "The super admin cannot be a company's Admin" });
    return;
  }

  const trialEndsAt = body.status === "trial" ? new Date(Date.now() + 14 * 86_400_000) : null;
  const [company] = await db
    .insert(companiesTable)
    .values({ name: body.name, slug: body.slug, ownerName: body.ownerName, ownerEmail: body.ownerEmail, plan: body.plan, status: body.status, trialEndsAt, overrides: {} })
    .returning();
  await db.insert(companyBrandingTable).values({ companyId: company.id, companyName: body.name, tagline: "", logoUrl: "", primaryColor: "#1668F0", accentColor: "#0A1626" });
  await provisionCompanyDefaults(company);

  // Seed the CMS with the default template as a draft so the Admin starts from a page, not a blank.
  const [defaultTemplate] = await db.select().from(landingTemplatesTable).where(eq(landingTemplatesTable.isDefault, true)).orderBy(landingTemplatesTable.id).limit(1);
  if (defaultTemplate) {
    const filled = fillTemplate(defaultTemplate.content, { name: company.name, owner: company.ownerName, branding: { companyName: body.name, logoUrl: "" } });
    await db.insert(siteContentTable).values({ companyId: company.id, status: "draft", content: filled, version: 1, updatedBy: req.user!.userId }).onConflictDoNothing();
  }

  const invite = await createInvite({ company, email: body.ownerEmail, name: body.ownerName, role: "admin", invitedBy: req.user!.userId, sender: "platform" });
  await audit(req, { action: "company_created", resourceType: "company", resourceId: company.id, companyId: company.id, details: { slug: company.slug, plan: company.plan, status: company.status, adminEmail: body.ownerEmail } });
  res.status(201).json({ company: await companyDetail(company), invite });
});

router.get("/admin/companies/:companyId", ...guard, async (req, res) => {
  const company = await loadCompany(req.params.companyId as string);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json(await companyDetail(company));
});

const PatchCompanyBody = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  ownerName: z.string().trim().min(2).max(120).optional(),
  ownerEmail: emailSchema.optional(),
  plan: z.string().min(1).optional(),
  status: z.enum(COMPANY_STATUSES).optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
});

router.patch("/admin/companies/:companyId", ...guard, async (req, res) => {
  const company = await loadCompany(req.params.companyId as string);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const parsed = PatchCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const b = parsed.data;
  if (b.plan) {
    const plans = await getPlans();
    if (!plans.some((p) => p.key === b.plan)) {
      res.status(400).json({ error: "Unknown plan" });
      return;
    }
  }
  const patch: Partial<typeof companiesTable.$inferInsert> = { updatedAt: new Date() };
  if (b.name !== undefined) patch.name = b.name;
  if (b.ownerName !== undefined) patch.ownerName = b.ownerName;
  if (b.ownerEmail !== undefined) patch.ownerEmail = b.ownerEmail;
  if (b.plan !== undefined) patch.plan = b.plan;
  if (b.trialEndsAt !== undefined) patch.trialEndsAt = b.trialEndsAt ? new Date(b.trialEndsAt) : null;
  if (b.status !== undefined) {
    patch.status = b.status;
    patch.suspendedAt = b.status === "suspended" ? new Date() : null;
    if (b.status === "trial" && !company.trialEndsAt && b.trialEndsAt === undefined) patch.trialEndsAt = new Date(Date.now() + 14 * 86_400_000);
  }
  const [updated] = await db.update(companiesTable).set(patch).where(eq(companiesTable.id, company.id)).returning();
  invalidateTenantCache({ slug: company.slug });
  const changes = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
  await audit(req, {
    action: b.status === "suspended" ? "company_suspended" : b.status && company.status === "suspended" ? "company_reactivated" : b.plan && b.plan !== company.plan ? "company_plan_changed" : "company_updated",
    resourceType: "company",
    resourceId: company.id,
    companyId: company.id,
    details: { before: { plan: company.plan, status: company.status }, changes },
  });
  res.json(await companyDetail(updated));
});

const OverrideBody = z.object({ mode: z.enum(["plan", "on", "off"]) });

/** Features: Plan / On / Off per key. "plan" removes the override. */
router.put("/admin/companies/:companyId/overrides/:feature", ...guard, async (req, res) => {
  const company = await loadCompany(req.params.companyId as string);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const feature = String(req.params.feature);
  if (!isFeatureKey(feature)) {
    res.status(400).json({ error: `Unknown feature "${feature}"`, validKeys: FEATURE_KEYS });
    return;
  }
  const parsed = OverrideBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "mode must be plan, on or off" });
    return;
  }
  const overrides: FeatureOverrides = { ...(company.overrides ?? {}) };
  if (parsed.data.mode === "plan") delete overrides[feature];
  else overrides[feature] = parsed.data.mode === "on";
  const [updated] = await db.update(companiesTable).set({ overrides, updatedAt: new Date() }).where(eq(companiesTable.id, company.id)).returning();
  invalidateTenantCache({ slug: company.slug });
  await audit(req, { action: `feature_override_${parsed.data.mode}`, resourceType: "company", resourceId: company.id, companyId: company.id, details: { feature, mode: parsed.data.mode } });
  res.json(await companyDetail(updated));
});

/** Snapshot the company's live page into a template (logo, photos, testimonials stripped; names tokenized). */
router.post("/admin/companies/:companyId/save-template", ...guard, async (req, res) => {
  const company = await loadCompany(req.params.companyId as string);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const [published] = await db.select().from(siteContentTable).where(and(eq(siteContentTable.companyId, company.id), eq(siteContentTable.status, "published"))).limit(1);
  if (!published) {
    res.status(400).json({ error: "This company has not published a page yet" });
    return;
  }
  const merged = mergeContent(SITE_CONTENT_DEFAULTS, published.content);
  const content = templateFromContent(merged as unknown as SiteContentOverrides, { name: company.name, owner: company.ownerName });
  const slug = `from-${company.slug}`;
  const values = {
    slug,
    name: `${company.name} page`,
    source: `Saved from ${company.name}`,
    audience: "As published",
    summary: "Snapshot of this company's live landing page with logo, photos, and testimonials stripped and names tokenized.",
    sourceCompanyId: company.id,
    content,
    isDefault: false,
    createdBy: req.user!.userId,
  };
  const [template] = await db
    .insert(landingTemplatesTable)
    .values(values)
    .onConflictDoUpdate({ target: landingTemplatesTable.slug, set: { ...values, updatedAt: new Date() } })
    .returning();
  await audit(req, { action: "template_saved_from_company", resourceType: "landing_template", resourceId: template.id, companyId: company.id, details: { slug } });
  res.status(201).json(template);
});

/** Resend the first-Admin invitation (e.g. the original expired). */
router.post("/admin/companies/:companyId/resend-invite", ...guard, async (req, res) => {
  const company = await loadCompany(req.params.companyId as string);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const invite = await createInvite({ company, email: company.ownerEmail, name: company.ownerName, role: "admin", invitedBy: req.user!.userId, sender: "platform" });
  await audit(req, { action: "company_admin_invite_resent", resourceType: "company", resourceId: company.id, companyId: company.id, details: { email: company.ownerEmail } });
  res.json(invite);
});

// ---------------------------------------------------------------------------
// Plans + feature registry
// ---------------------------------------------------------------------------

router.get("/admin/plans", ...guard, async (_req, res) => {
  const plans = await db.select().from(plansTable).orderBy(plansTable.sort);
  const companies = await db.select({ plan: companiesTable.plan }).from(companiesTable);
  res.json({
    registry: FEATURE_REGISTRY,
    plans: plans.map((p) => ({ ...p, companies: companies.filter((c) => c.plan === p.key).length })),
  });
});

const PatchPlanBody = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  price: z.number().int().min(0).max(100000).nullable().optional(),
  desc: z.string().trim().max(200).optional(),
  featureKeys: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

router.patch("/admin/plans/:key", ...guard, async (req, res) => {
  const key = String(req.params.key);
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.key, key)).limit(1);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  const parsed = PatchPlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const b = parsed.data;
  const patch: Partial<typeof plansTable.$inferInsert> = { updatedAt: new Date() };
  if (b.name !== undefined) patch.name = b.name;
  if (b.price !== undefined) patch.price = b.price;
  if (b.desc !== undefined) patch.desc = b.desc;
  if (b.active !== undefined) patch.active = b.active;
  if (b.featureKeys) {
    const unknown = b.featureKeys.filter((k) => !isFeatureKey(k));
    if (unknown.length) {
      res.status(400).json({ error: `Unknown feature keys: ${unknown.join(", ")}` });
      return;
    }
    patch.featureKeys = FEATURE_KEYS.filter((k) => b.featureKeys!.includes(k));
  }
  const [updated] = await db.update(plansTable).set(patch).where(eq(plansTable.id, plan.id)).returning();
  invalidatePlanCache();
  await audit(req, { action: "plan_updated", resourceType: "plan", resourceId: plan.id, details: { key, changes: b } });
  res.json(updated);
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

router.get("/admin/templates", ...guard, async (_req, res) => {
  const templates = await db.select().from(landingTemplatesTable).orderBy(desc(landingTemplatesTable.isDefault), landingTemplatesTable.createdAt);
  const companies = await db.select({ id: companiesTable.id, name: companiesTable.name, slug: companiesTable.slug, status: companiesTable.status }).from(companiesTable).orderBy(companiesTable.name);
  res.json({ templates, companies });
});

router.post("/admin/templates/:templateId/apply", ...guard, async (req, res) => {
  const [template] = await db.select().from(landingTemplatesTable).where(eq(landingTemplatesTable.id, Number(req.params.templateId))).limit(1);
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  const parsed = z.object({ companyId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "companyId is required" });
    return;
  }
  const company = await loadCompany(parsed.data.companyId);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const [branding] = await db.select().from(companyBrandingTable).where(eq(companyBrandingTable.companyId, company.id)).limit(1);
  const filled = fillTemplate(template.content, { name: company.name, owner: company.ownerName, branding: branding ? { companyName: branding.companyName, logoUrl: branding.logoUrl } : null });
  const [existing] = await db.select().from(siteContentTable).where(and(eq(siteContentTable.companyId, company.id), eq(siteContentTable.status, "draft"))).limit(1);
  if (existing) await db.update(siteContentTable).set({ content: filled, updatedBy: req.user!.userId, updatedAt: new Date() }).where(eq(siteContentTable.id, existing.id));
  else await db.insert(siteContentTable).values({ companyId: company.id, status: "draft", content: filled, version: 1, updatedBy: req.user!.userId });
  await audit(req, { action: "template_applied", resourceType: "landing_template", resourceId: template.id, companyId: company.id, details: { templateSlug: template.slug } });
  res.json({ ok: true, companyId: company.id, companyName: company.name, templateName: template.name, status: "draft" });
});

router.delete("/admin/templates/:templateId", ...guard, async (req, res) => {
  const [template] = await db.select().from(landingTemplatesTable).where(eq(landingTemplatesTable.id, Number(req.params.templateId))).limit(1);
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  if (template.isDefault) {
    res.status(400).json({ error: "The default template cannot be removed" });
    return;
  }
  await db.delete(landingTemplatesTable).where(eq(landingTemplatesTable.id, template.id));
  await audit(req, { action: "template_deleted", resourceType: "landing_template", resourceId: template.id, details: { slug: template.slug } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Platform settings + audit log
// ---------------------------------------------------------------------------

router.get("/admin/settings", ...guard, async (_req, res) => {
  res.json({
    superAdmin: PLATFORM.superAdmin,
    domains: [
      { host: "advisor-platform.com", tag: "MARKETING", role: "marketing" },
      { host: env.platformPrimaryDomain, tag: "PRIMARY · SUBDOMAINS", role: "primary" },
      { host: "advisor-platform.authority-desk.com", tag: "SEO SURFACE", role: "seo" },
    ],
    subdomainBase: env.platformSubdomainBase,
    keys: {
      sendgrid: Boolean(env.sendgridApiKey),
      brightdata: Boolean(env.brightDataApiKey),
      stripe: Boolean(env.stripeSecretKey),
      stripeWebhook: Boolean(env.stripeWebhookSecret),
      encryptionKeyFromEnv: Boolean(process.env.PLATFORM_ENCRYPTION_KEY),
    },
    platformFrom: { email: env.platformFromEmail, name: env.platformFromName },
  });
});

/**
 * Super-admin audit trail. Filters: `companyId`, `action` (prefix match, e.g. "company_" or "feature_override"),
 * `userId`, `before` (ISO cursor for paging). Actor and company names are joined so the screen needs no lookups.
 */
router.get("/admin/audit", ...guard, async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
  const conditions = [];
  const companyId = Number(req.query.companyId);
  if (Number.isInteger(companyId) && companyId > 0) conditions.push(eq(auditLogsTable.companyId, companyId));
  const userId = Number(req.query.userId);
  if (Number.isInteger(userId) && userId > 0) conditions.push(eq(auditLogsTable.userId, userId));
  const action = typeof req.query.action === "string" ? req.query.action.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "") : "";
  if (action) conditions.push(like(auditLogsTable.action, `${action}%`));
  const before = typeof req.query.before === "string" && !Number.isNaN(Date.parse(req.query.before)) ? new Date(req.query.before) : null;
  if (before) conditions.push(lt(auditLogsTable.createdAt, before));
  const rows = await db
    .select({ entry: auditLogsTable, actorName: usersTable.name, actorEmail: usersTable.email, companyName: companiesTable.name })
    .from(auditLogsTable)
    .leftJoin(usersTable, eq(usersTable.id, auditLogsTable.userId))
    .leftJoin(companiesTable, eq(companiesTable.id, auditLogsTable.companyId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLogsTable.createdAt), desc(auditLogsTable.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const actions = await db.selectDistinct({ action: auditLogsTable.action }).from(auditLogsTable).orderBy(auditLogsTable.action);
  res.json({
    entries: page.map((r) => ({
      id: r.entry.id,
      action: r.entry.action,
      resourceType: r.entry.resourceType,
      resourceId: r.entry.resourceId,
      details: r.entry.details,
      ipAddress: r.entry.ipAddress,
      createdAt: r.entry.createdAt.toISOString(),
      actor: r.entry.userId ? { id: r.entry.userId, name: r.actorName ?? "Deleted user", email: r.actorEmail ?? "" } : null,
      company: r.entry.companyId ? { id: r.entry.companyId, name: r.companyName ?? "Deleted company" } : null,
    })),
    hasMore: rows.length > limit,
    nextBefore: rows.length > limit ? page[page.length - 1].entry.createdAt.toISOString() : null,
    actions: actions.map((a) => a.action),
  });
});

// ---------------------------------------------------------------------------
// Payments readiness: is it safe to take money, and is Stripe talking to us?
// ---------------------------------------------------------------------------

router.get("/admin/payments/readiness", ...guard, async (_req, res) => {
  const platform = stripeConfig();
  const companies = await db.select().from(companiesTable).orderBy(companiesTable.name);
  const integrations = await db.select().from(companyIntegrationsTable).where(eq(companyIntegrationsTable.provider, "stripe"));
  const rows = await Promise.all(
    companies.map(async (c) => {
      const features = await companyFeatures(c);
      const integ = integrations.find((i) => i.companyId === c.id) ?? null;
      const cfg = (integ?.config ?? {}) as Record<string, unknown>;
      const ready = await checkoutReady(c.id, features.stripe_checkout);
      return { id: c.id, name: c.name, slug: c.slug, status: c.status, stripeCheckoutInPlan: features.stripe_checkout, integrationStatus: integ?.status ?? "not_connected", accountId: typeof cfg.accountId === "string" ? cfg.accountId : null, chargesEnabled: typeof cfg.chargesEnabled === "boolean" ? cfg.chargesEnabled : null, checkoutReady: ready.ready, reason: ready.reason };
    }),
  );
  const since = new Date(Date.now() - 7 * 86_400_000);
  const events = await db
    .select({ type: webhookEventsTable.eventType, status: webhookEventsTable.status, count: sql<number>`count(*)::int`, last: sql<string>`max(${webhookEventsTable.receivedAt})` })
    .from(webhookEventsTable)
    .where(and(eq(webhookEventsTable.provider, "stripe"), gte(webhookEventsTable.receivedAt, since)))
    .groupBy(webhookEventsTable.eventType, webhookEventsTable.status);
  const recentProblems = await db
    .select({ eventId: webhookEventsTable.eventId, type: webhookEventsTable.eventType, status: webhookEventsTable.status, error: webhookEventsTable.error, receivedAt: webhookEventsTable.receivedAt })
    .from(webhookEventsTable)
    .where(and(eq(webhookEventsTable.provider, "stripe"), inArray(webhookEventsTable.status, ["failed", "ignored"]), gte(webhookEventsTable.receivedAt, since)))
    .orderBy(desc(webhookEventsTable.receivedAt))
    .limit(20);
  res.setHeader("Cache-Control", "private, no-store");
  res.json({
    platform: { ...platform, webhookUrl: `${env.appUrl}/api/webhooks/stripe`, connectRedirectUrl: `${env.appUrl}/api/stripe/connect/callback`, requiredEvents: STRIPE_WEBHOOK_EVENTS },
    companies: rows,
    webhooks: { since: since.toISOString(), byTypeAndStatus: events, recentProblems },
  });
});

export default router;
