import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, siteContentTable, landingTemplatesTable, type Company } from "@workspace/db";
import { SECTION_META, SITE_CONTENT_DEFAULTS, fillTemplate, mergeContent, sanitizeOverrides, type SiteContent, type SiteContentOverrides } from "@workspace/shared";
import { authMiddleware, requireCompany, requirePermission } from "../lib/auth";
import { companyFeatures, requireFeature } from "../lib/features";
import { audit } from "../lib/audit";
import { companyBaseUrl } from "../lib/urls";

const router: IRouter = Router();
const base = [authMiddleware, requireCompany, requireFeature("website_cms")] as const;

export async function contentRows(companyId: number) {
  const rows = await db.select().from(siteContentTable).where(eq(siteContentTable.companyId, companyId));
  return { draft: rows.find((r) => r.status === "draft") ?? null, published: rows.find((r) => r.status === "published") ?? null };
}

/**
 * A company with no published page starts from the default template filled
 * with its own name — the public page never renders MTC's copy for someone else.
 */
export async function baselineFor(company: Company): Promise<SiteContentOverrides> {
  if (company.slug === "mytargetclient") return {};
  const [tpl] = await db.select().from(landingTemplatesTable).where(eq(landingTemplatesTable.isDefault, true)).orderBy(landingTemplatesTable.id).limit(1);
  return tpl ? fillTemplate(tpl.content, { name: company.name, owner: company.ownerName }) : { brand: { companyName: company.name, legalLine: company.name, logoUrl: "", footerLogoUrl: "", ownerName: company.ownerName.split(" ")[0] ?? "", ownerPhoto: "" }, visibility: { testimonials: false } };
}

export async function publishedContent(company: Company): Promise<{ content: SiteContent; version: number; publishedAt: string | null; customized: boolean }> {
  const { published } = await contentRows(company.id);
  const baseline = await baselineFor(company);
  const merged = mergeContent(mergeContent(SITE_CONTENT_DEFAULTS, baseline), published?.content ?? {});
  return { content: merged, version: published?.version ?? 0, publishedAt: published?.publishedAt?.toISOString() ?? null, customized: Boolean(published) };
}

router.get("/companies/:companyId/site-content", ...base, requirePermission("website", "read"), async (req, res) => {
  const company = req.company!;
  const { draft, published } = await contentRows(company.id);
  const baseline = await baselineFor(company);
  const baseContent = mergeContent(SITE_CONTENT_DEFAULTS, baseline);
  const live = mergeContent(baseContent, published?.content ?? {});
  const working = mergeContent(baseContent, draft?.content ?? published?.content ?? {});
  const features = await companyFeatures(company);
  const publicUrl = await companyBaseUrl(company);
  res.json({
    meta: SECTION_META,
    defaults: baseContent,
    live,
    working,
    draft: draft ? { content: draft.content, updatedAt: draft.updatedAt.toISOString() } : null,
    published: published ? { content: published.content, version: published.version, publishedAt: published.publishedAt?.toISOString() ?? null } : null,
    status: draft ? "draft" : published ? "published" : "defaults",
    canEditVideo: features.hero_video,
    urls: { live: publicUrl, preview: `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}preview=1` },
  });
});

router.put("/companies/:companyId/site-content/draft", ...base, requirePermission("website", "write"), async (req, res) => {
  const company = req.company!;
  const overrides = sanitizeOverrides(req.body?.content ?? req.body);
  if (overrides.heroMedia?.kind === "video") {
    const features = await companyFeatures(company);
    if (!features.hero_video) {
      res.status(403).json({ error: "Not in your plan", feature: "hero_video", requiredPlanName: "Professional" });
      return;
    }
  }
  const { draft, published } = await contentRows(company.id);
  const now = new Date();
  if (draft) await db.update(siteContentTable).set({ content: overrides, updatedBy: req.user!.userId, updatedAt: now }).where(eq(siteContentTable.id, draft.id));
  else await db.insert(siteContentTable).values({ companyId: company.id, status: "draft", content: overrides, version: (published?.version ?? 0) + 1, updatedBy: req.user!.userId });
  res.json({ ok: true, content: overrides });
});

router.post("/companies/:companyId/site-content/publish", ...base, requirePermission("website", "write"), async (req, res) => {
  const company = req.company!;
  const { draft, published } = await contentRows(company.id);
  if (!draft) {
    res.status(400).json({ error: "There are no unpublished changes" });
    return;
  }
  const now = new Date();
  const version = (published?.version ?? 0) + 1;
  await db.transaction(async (tx) => {
    if (published) await tx.update(siteContentTable).set({ content: draft.content, version, publishedAt: now, updatedBy: req.user!.userId, updatedAt: now }).where(eq(siteContentTable.id, published.id));
    else await tx.insert(siteContentTable).values({ companyId: company.id, status: "published", content: draft.content, version, publishedAt: now, updatedBy: req.user!.userId });
    await tx.delete(siteContentTable).where(eq(siteContentTable.id, draft.id));
  });
  await audit(req, { action: "site_content_published", resourceType: "site_content", details: { version } });
  res.json({ ok: true, version, publishedAt: now.toISOString() });
});

router.post("/companies/:companyId/site-content/discard", ...base, requirePermission("website", "write"), async (req, res) => {
  const { draft } = await contentRows(req.company!.id);
  if (draft) await db.delete(siteContentTable).where(and(eq(siteContentTable.id, draft.id)));
  res.json({ ok: true });
});

export default router;
