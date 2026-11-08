import { Router, type IRouter } from "express";
import { PublicLeadBody } from "@workspace/shared";
import { optionalAuth } from "../lib/auth";
import { publicFormLimiter } from "../lib/rateLimit";
import { createLead } from "../lib/leads";
import { calendlyUrlFor } from "../lib/integrations";
import { publishedContent, contentRows, baselineFor } from "./siteContent";
import { reviewsFor, reviewView } from "./reviews";
import { publicCompanyPayload } from "./tenant";
import { publishedRubric } from "./rubric";
import { SITE_CONTENT_DEFAULTS, GRADER_SAMPLE, mergeContent, scoreProfile, type GraderResult } from "@workspace/shared";
import { eq, and } from "drizzle-orm";
import { db, profileAssessmentsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { graderMode, startAssessment } from "../lib/grader";

const router: IRouter = Router();

/**
 * Everything a company's public landing page needs, resolved from the host.
 * `?preview=1` returns the draft to signed-in staff of that company (or the
 * super admin); visitors only ever receive the published version.
 */
router.get("/public/site", optionalAuth, async (req, res) => {
  const tenant = req.tenant;
  if (!tenant || tenant.kind !== "company") {
    res.status(404).json({ error: "No company at this address" });
    return;
  }
  const company = tenant.company;
  if (company.status === "suspended") {
    res.status(410).json({ error: "This site is suspended" });
    return;
  }
  const wantsPreview = req.query.preview === "1";
  const user = req.user;
  const mayPreview = Boolean(user && (user.role === "super_admin" || (user.companyId === company.id && user.role !== "client")));
  let payload: Awaited<ReturnType<typeof publishedContent>> & { preview: boolean };
  if (wantsPreview && mayPreview) {
    const { draft, published } = await contentRows(company.id);
    const baseline = await baselineFor(company);
    const content = mergeContent(mergeContent(SITE_CONTENT_DEFAULTS, baseline), draft?.content ?? published?.content ?? {});
    payload = { content, version: draft ? (published?.version ?? 0) + 1 : (published?.version ?? 0), publishedAt: null, customized: Boolean(draft ?? published), preview: true };
  } else {
    payload = { ...(await publishedContent(company)), preview: false };
    res.setHeader("Cache-Control", "public, max-age=60");
  }
  const [reviews, calendlyUrl, publicCompany] = await Promise.all([reviewsFor(company.id, true), calendlyUrlFor(company.id), publicCompanyPayload(company)]);
  res.json({
    company: publicCompany,
    site: payload,
    reviews: reviews.map((r) => ({ ...reviewView(r), quote: r.quote })),
    calendlyUrl,
  });
});

/** The landing-page form: six fields + honeypot → the company's pipeline. */
router.post("/public/leads", publicFormLimiter, async (req, res) => {
  const tenant = req.tenant;
  if (!tenant || tenant.kind !== "company") {
    res.status(404).json({ error: "No company at this address" });
    return;
  }
  if (tenant.company.status === "suspended") {
    res.status(410).json({ error: "This site is suspended" });
    return;
  }
  const parsed = PublicLeadBody.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    if (first?.path[0] === "website") {
      // Honeypot filled: answer like a success and drop it.
      res.status(202).json({ ok: true });
      return;
    }
    res.status(400).json({ error: first?.message ?? "Please check the form", field: first?.path[0] ?? null });
    return;
  }
  const { website: _hp, ...fields } = parsed.data;
  const lead = await createLead(tenant.company, { ...fields, source: "landing_form", meta: { ip: req.ip ?? null, userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300) } });
  // The grade the journey promises starts now; the owner reviews it before anything is sent.
  if (lead.linkedin && graderMode() !== "off") {
    const graded = startAssessment(tenant.company, lead, { trigger: "lead_form", notify: false }).catch((err) => logger.warn({ err, leadId: lead.id }, "Auto-grade did not start"));
    if (process.env.NODE_ENV === "test") await graded;
  }
  const calendlyUrl = await calendlyUrlFor(tenant.company.id);
  const prefill = calendlyUrl ? `${calendlyUrl}${calendlyUrl.includes("?") ? "&" : "?"}name=${encodeURIComponent(lead.name)}&email=${encodeURIComponent(lead.email)}&utm_source=advisor_platform&utm_content=${encodeURIComponent(lead.publicId)}${lead.linkedin ? `&a1=${encodeURIComponent(lead.linkedin)}` : ""}` : null;
  logger.info({ companyId: tenant.company.id, leadId: lead.id, source: "landing_form" }, "Lead created from landing form");
  res.status(201).json({ ok: true, leadId: lead.publicId, firstName: lead.name.split(/\s+/)[0], calendlyUrl: prefill });
});

/** A lead never sees the findings: the summary carries scores and quick wins only. */
export function summarizeResult(result: GraderResult): GraderResult {
  return {
    ...result,
    categories: result.categories.map((c) => ({ ...c, findings: [], recs: [] })),
    immediate: [],
    shortTerm: [],
    ongoing: [],
    tips: [],
  };
}

/**
 * The Profile Grade report. `sample` renders the platform sample profile against
 * the company's published rubric (so the page can be previewed before any
 * assessment exists); a real public id serves that assessment, summarised unless
 * it has been unlocked. The assessment pipeline itself arrives with the Grader phase.
 */
router.get("/public/grade/:publicId", optionalAuth, async (req, res) => {
  const tenant = req.tenant;
  if (!tenant || tenant.kind !== "company") {
    res.status(404).json({ error: "No company at this address" });
    return;
  }
  const company = tenant.company;
  if (company.status === "suspended") {
    res.status(410).json({ error: "This site is suspended" });
    return;
  }
  const publicId = String(req.params.publicId);
  const [publicCompany, calendlyUrl, published] = await Promise.all([publicCompanyPayload(company), calendlyUrlFor(company.id), publishedContent(company)]);
  const brand = published.content.brand;
  const base = { company: publicCompany, brand: { ownerName: brand.ownerName, ownerFullName: brand.ownerFullName, ownerPhoto: brand.ownerPhoto, logoUrl: brand.logoUrl }, calendlyUrl };

  if (publicId === "sample") {
    const { rubric, version } = await publishedRubric(company.id);
    const result = scoreProfile(rubric, GRADER_SAMPLE);
    const staff = Boolean(req.user && (req.user.role === "super_admin" || (req.user.companyId === company.id && req.user.role !== "client")));
    const unlocked = req.query.view === "full" && staff;
    res.json({ ...base, sample: true, profileName: GRADER_SAMPLE.name, linkedinUrl: GRADER_SAMPLE.linkedinUrl ?? "", unlocked, canToggle: staff, rubricVersion: version, categoryCount: rubric.categories.length, result: unlocked ? result : summarizeResult(result), status: "scored", createdAt: null });
    return;
  }

  const [assessment] = await db.select().from(profileAssessmentsTable).where(and(eq(profileAssessmentsTable.companyId, company.id), eq(profileAssessmentsTable.publicId, publicId))).limit(1);
  if (!assessment) {
    res.status(404).json({ error: "We couldn't find that report" });
    return;
  }
  res.setHeader("Cache-Control", "private, no-store");
  const result = assessment.scores ?? null;
  const rubric = await publishedRubric(company.id);
  const staff = Boolean(req.user && (req.user.role === "super_admin" || (req.user.companyId === company.id && req.user.role !== "client")));
  // Staff always see the full report; a lead sees it once unlocked (or, for staff previewing the lead's view, with ?view=summary).
  const unlocked = staff ? req.query.view !== "summary" : assessment.unlocked;
  res.json({
    ...base,
    sample: false,
    profileName: assessment.profile?.name ?? "",
    linkedinUrl: assessment.linkedinUrl,
    unlocked,
    leadUnlocked: assessment.unlocked,
    canToggle: staff,
    rubricVersion: assessment.rubricVersion ?? rubric.version,
    categoryCount: rubric.rubric.categories.length,
    status: assessment.status,
    result: result ? (unlocked ? result : summarizeResult(result)) : null,
    errorMessage: staff ? assessment.errorMessage : null,
    createdAt: assessment.createdAt.toISOString(),
  });
});

export default router;
