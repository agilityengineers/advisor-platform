import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { eq as eqOp, and, count } from "drizzle-orm";
import { db, companyBrandingTable, companyIntegrationsTable, customDomainsTable, leadsTable, reviewsTable, siteContentTable } from "@workspace/db";
import { calendlyUrlFor } from "../lib/integrations";
import { authMiddleware, requireCompany } from "../lib/auth";
import { companyFeatureDetail, getPlan } from "../lib/features";
import { companyBaseUrl } from "../lib/urls";

const router: IRouter = Router();

/** Shell data for the company console: identity, plan, features (with sources), integrations status, domain. */
router.get("/companies/:companyId/summary", authMiddleware, requireCompany, async (req, res) => {
  const company = req.company!;
  const [branding] = await db.select().from(companyBrandingTable).where(eq(companyBrandingTable.companyId, company.id)).limit(1);
  const plan = await getPlan(company.plan);
  const features = await companyFeatureDetail(company);
  const integrations = await db.select({ provider: companyIntegrationsTable.provider, status: companyIntegrationsTable.status }).from(companyIntegrationsTable).where(eq(companyIntegrationsTable.companyId, company.id));
  const [domain] = await db.select().from(customDomainsTable).where(eq(customDomainsTable.companyId, company.id)).limit(1);
  const [[leadCount], [reviewCount], contentRows, calendlyUrl] = await Promise.all([
    db.select({ n: count() }).from(leadsTable).where(eqOp(leadsTable.companyId, company.id)),
    db.select({ n: count() }).from(reviewsTable).where(and(eqOp(reviewsTable.companyId, company.id), eqOp(reviewsTable.visible, true))),
    db.select({ status: siteContentTable.status }).from(siteContentTable).where(eqOp(siteContentTable.companyId, company.id)),
    calendlyUrlFor(company.id),
  ]);
  res.json({
    counts: { leads: Number(leadCount?.n ?? 0), reviewsLive: Number(reviewCount?.n ?? 0), hasDraft: contentRows.some((r) => r.status === "draft") },
    calendlyUrl,
    company: { id: company.id, name: company.name, slug: company.slug, ownerName: company.ownerName, ownerEmail: company.ownerEmail, plan: company.plan, status: company.status, trialEndsAt: company.trialEndsAt, createdAt: company.createdAt },
    plan: plan ? { key: plan.key, name: plan.name, price: plan.price } : { key: company.plan, name: company.plan, price: null },
    branding: branding ?? null,
    features,
    integrations: Object.fromEntries(integrations.map((i) => [i.provider, i.status])),
    domain: domain ? { domain: domain.domain, verified: domain.verified, active: domain.active, sslStatus: domain.sslStatus } : null,
    publicUrl: await companyBaseUrl(company),
    viewer: { role: req.user!.role, isSuperAdmin: req.user!.role === "super_admin", perms: req.currentUser!.perms },
  });
});

export default router;
