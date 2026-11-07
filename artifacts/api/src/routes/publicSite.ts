import { Router, type IRouter } from "express";
import { PublicLeadBody } from "@workspace/shared";
import { optionalAuth } from "../lib/auth";
import { publicFormLimiter } from "../lib/rateLimit";
import { createLead } from "../lib/leads";
import { calendlyUrlFor } from "../lib/integrations";
import { publishedContent, contentRows, baselineFor } from "./siteContent";
import { reviewsFor, reviewView } from "./reviews";
import { publicCompanyPayload } from "./tenant";
import { SITE_CONTENT_DEFAULTS, mergeContent } from "@workspace/shared";
import { logger } from "../lib/logger";

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
  const calendlyUrl = await calendlyUrlFor(tenant.company.id);
  const prefill = calendlyUrl ? `${calendlyUrl}${calendlyUrl.includes("?") ? "&" : "?"}name=${encodeURIComponent(lead.name)}&email=${encodeURIComponent(lead.email)}&utm_source=advisor_platform&utm_content=${encodeURIComponent(lead.publicId)}${lead.linkedin ? `&a1=${encodeURIComponent(lead.linkedin)}` : ""}` : null;
  logger.info({ companyId: tenant.company.id, leadId: lead.id, source: "landing_form" }, "Lead created from landing form");
  res.status(201).json({ ok: true, leadId: lead.publicId, firstName: lead.name.split(/\s+/)[0], calendlyUrl: prefill });
});

export default router;
