import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, platformLeadsTable, companiesTable, PLATFORM_LEAD_STATUSES, type PlatformLead } from "@workspace/db";
import { PLATFORM, PlatformLeadBody, PlatformLeadUpdateBody } from "@workspace/shared";
import { authMiddleware, requireSuperAdmin } from "../lib/auth";
import { publicFormLimiter } from "../lib/rateLimit";
import { newPublicId } from "../lib/tokens";
import { sendEmail, renderEmail, heading, paragraph, escapeHtml, PLATFORM_LETTERHEAD } from "../lib/email";
import { publishedPlatformContent } from "./platformContent";
import { audit } from "../lib/audit";
import { logger } from "../lib/logger";
import { env } from "../env";

const router: IRouter = Router();
const guard = [authMiddleware, requireSuperAdmin] as const;

export function platformLeadView(l: PlatformLead, company?: { id: number; name: string; slug: string } | null) {
  return {
    id: l.id,
    publicId: l.publicId,
    name: l.name,
    company: l.company,
    email: l.email,
    linkedin: l.linkedin,
    intent: l.intent,
    status: l.status,
    notes: l.notes,
    convertedCompanyId: l.convertedCompanyId,
    convertedCompany: company ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

/** Calendly prefill for the founder's demo link, so the booking screen already knows who they are. */
function prefill(url: string, lead: Pick<PlatformLead, "name" | "email" | "publicId" | "intent">): string {
  if (!url) return "";
  const params = new URLSearchParams({ name: lead.name, email: lead.email, utm_source: "advisor_platform", utm_campaign: lead.intent, utm_content: lead.publicId });
  return `${url}${url.includes("?") ? "&" : "?"}${params.toString()}`;
}

/**
 * The Advisor Platform landing form. Only answered on platform hosts: a company
 * site has its own form that writes into that company's pipeline.
 */
router.post("/public/platform-leads", publicFormLimiter, async (req, res) => {
  if (req.tenant && req.tenant.kind !== "platform") {
    res.status(404).json({ error: "Not available on this site" });
    return;
  }
  const parsed = PlatformLeadBody.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    if (first?.path[0] === "website") {
      res.status(202).json({ ok: true });
      return;
    }
    res.status(400).json({ error: first?.message ?? "Please check the form", field: first?.path[0] ?? null });
    return;
  }
  const { website: _hp, ...fields } = parsed.data;
  const [lead] = await db
    .insert(platformLeadsTable)
    .values({
      publicId: newPublicId("pl_"),
      name: fields.name,
      company: fields.company,
      email: fields.email.toLowerCase(),
      linkedin: fields.linkedin.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, ""),
      intent: fields.intent,
      meta: { ip: req.ip ?? null, userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300), referer: String(req.headers.referer ?? "").slice(0, 300) },
    })
    .returning();
  const content = await publishedPlatformContent();
  const calendlyUrl = content.content.founder.calendlyUrl;
  logger.info({ platformLeadId: lead.id, intent: lead.intent }, "Platform lead created");

  // Tell the founder. Best effort — the row is the record; mail is a courtesy.
  void sendEmail({
    to: PLATFORM.superAdmin.email,
    subject: `${lead.intent === "trial" ? "Trial" : "Demo"} request · ${lead.company || lead.name}`,
    template: "platform_lead_alert",
    html: renderEmail(
      PLATFORM_LETTERHEAD,
      heading(`${lead.intent === "trial" ? "New trial request" : "New demo request"}`) +
        paragraph(`<strong>${escapeHtml(lead.name)}</strong> · ${escapeHtml(lead.company)}<br/>${escapeHtml(lead.email)}${lead.linkedin ? `<br/>${escapeHtml(lead.linkedin)}` : ""}`) +
        paragraph(`Review it in Platform Admin → Requests: <a href="${env.appUrl}/admin/requests">${env.appUrl}/admin/requests</a>`),
    ),
    text: `${lead.intent} request from ${lead.name} (${lead.company}) ${lead.email} ${lead.linkedin}`.trim(),
    actionUrl: `${env.appUrl}/admin/requests`,
    metadata: { platformLeadId: lead.id },
  }).catch((err) => logger.warn({ err }, "Platform lead alert failed"));

  res.status(201).json({ ok: true, requestId: lead.publicId, firstName: lead.name.split(/\s+/)[0], intent: lead.intent, calendlyUrl: prefill(calendlyUrl, lead) || null });
});

router.get("/admin/platform-leads", ...guard, async (_req, res) => {
  const rows = await db
    .select({ lead: platformLeadsTable, company: { id: companiesTable.id, name: companiesTable.name, slug: companiesTable.slug } })
    .from(platformLeadsTable)
    .leftJoin(companiesTable, eq(platformLeadsTable.convertedCompanyId, companiesTable.id))
    .orderBy(desc(platformLeadsTable.createdAt), desc(platformLeadsTable.id));
  const counts = Object.fromEntries(PLATFORM_LEAD_STATUSES.map((s) => [s, 0])) as Record<(typeof PLATFORM_LEAD_STATUSES)[number], number>;
  for (const r of rows) counts[r.lead.status] = (counts[r.lead.status] ?? 0) + 1;
  res.json({ requests: rows.map((r) => platformLeadView(r.lead, r.company?.id ? r.company : null)), counts, statuses: PLATFORM_LEAD_STATUSES });
});

router.patch("/admin/platform-leads/:id", ...guard, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = PlatformLeadUpdateBody.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid request" : (parsed.error.issues[0]?.message ?? "Invalid request") });
    return;
  }
  const [existing] = await db.select().from(platformLeadsTable).where(eq(platformLeadsTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  const patch = parsed.data;
  if (patch.convertedCompanyId) {
    const [company] = await db.select({ id: companiesTable.id }).from(companiesTable).where(eq(companiesTable.id, patch.convertedCompanyId)).limit(1);
    if (!company) {
      res.status(400).json({ error: "That company does not exist" });
      return;
    }
  }
  const [updated] = await db
    .update(platformLeadsTable)
    .set({
      status: patch.status ?? (patch.convertedCompanyId ? "converted" : existing.status),
      notes: patch.notes ?? existing.notes,
      convertedCompanyId: patch.convertedCompanyId === undefined ? existing.convertedCompanyId : patch.convertedCompanyId,
      updatedAt: new Date(),
    })
    .where(eq(platformLeadsTable.id, id))
    .returning();
  await audit(req, { action: "platform_lead_updated", resourceType: "platform_lead", resourceId: id, details: { ...patch } });
  const company = updated.convertedCompanyId ? (await db.select({ id: companiesTable.id, name: companiesTable.name, slug: companiesTable.slug }).from(companiesTable).where(eq(companiesTable.id, updated.convertedCompanyId)).limit(1))[0] ?? null : null;
  res.json({ request: platformLeadView(updated, company) });
});

/** New-request count for the admin nav badge. */
export async function newPlatformLeadCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(platformLeadsTable).where(eq(platformLeadsTable.status, "new"));
  return row?.n ?? 0;
}

export default router;
