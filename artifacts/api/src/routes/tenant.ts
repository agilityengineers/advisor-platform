import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, companyBrandingTable, companiesTable, customDomainsTable, type Company } from "@workspace/db";
import { PLATFORM } from "@workspace/shared";
import { companyFeatures } from "../lib/features";
import { env } from "../env";

const router: IRouter = Router();

export async function publicCompanyPayload(company: Company) {
  const [branding] = await db.select().from(companyBrandingTable).where(eq(companyBrandingTable.companyId, company.id)).limit(1);
  const features = await companyFeatures(company);
  // Without the White label feature, logo and colours fall back to the platform defaults on public surfaces.
  const whiteLabel = features.white_label;
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    ownerName: company.ownerName,
    status: company.status,
    branding: {
      companyName: branding?.companyName || company.name,
      tagline: branding?.tagline ?? "",
      logoUrl: whiteLabel ? (branding?.logoUrl ?? "") : "",
      primaryColor: whiteLabel ? (branding?.primaryColor ?? "#1668F0") : "#1668F0",
      accentColor: whiteLabel ? (branding?.accentColor ?? "#0A1626") : "#0A1626",
    },
    // Only the flags public pages need; nothing about the plan itself.
    publicFeatures: {
      authority_desk: features.authority_desk,
      hero_video: features.hero_video,
      calendly: features.calendly,
      stripe_checkout: features.stripe_checkout,
      reviews: features.reviews,
      client_portal: features.client_portal,
    },
  };
}

/** What the SPA asks first: who am I serving? */
router.get("/tenant", async (req, res) => {
  const tenant = req.tenant;
  if (!tenant || tenant.kind === "platform") {
    res.json({ kind: "platform", platform: { name: PLATFORM.name, domains: PLATFORM.domains, primaryDomain: env.platformPrimaryDomain }, host: tenant?.host ?? null });
    return;
  }
  if (tenant.company.status === "suspended") {
    res.json({ kind: "company_suspended", company: { name: tenant.company.name, slug: tenant.company.slug }, via: tenant.via });
    return;
  }
  res.json({ kind: "company", via: tenant.via, company: await publicCompanyPayload(tenant.company) });
});

router.get("/tenant/by-slug/:slug", async (req, res) => {
  const slug = String(req.params.slug).toLowerCase();
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.slug, slug)).limit(1);
  if (!company || company.status === "suspended") {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json(await publicCompanyPayload(company));
});

/** Used by the platform and the resolver to know which custom domains exist (public, non-sensitive). */
router.get("/tenant/domains/:domain/status", async (req, res) => {
  const domain = String(req.params.domain).toLowerCase();
  const [row] = await db.select({ verified: customDomainsTable.verified, active: customDomainsTable.active, ssl: customDomainsTable.sslStatus }).from(customDomainsTable).where(eq(customDomainsTable.domain, domain)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Unknown domain" });
    return;
  }
  res.json(row);
});

export default router;
