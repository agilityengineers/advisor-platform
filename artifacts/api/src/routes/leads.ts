import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, leadsTable, pipelineStagesTable, bookingsTable, profileAssessmentsTable, usersTable, type Lead, type PipelineStage } from "@workspace/db";
import { LeadCreateBody, LeadUpdateBody, LeadNoteBody, LeadEmailBody, StagesBody, OUTREACH_TEMPLATES, STAGE_PALETTE, fillOutreach, stageColor } from "@workspace/shared";
import { authMiddleware, requireCompany, requirePermission, requireRole } from "../lib/auth";
import { requireFeature } from "../lib/features";
import { createLead, leadActivity, loadLead, logActivity, stagesFor } from "../lib/leads";
import { calendlyUrlFor, companySender } from "../lib/integrations";
import { sendEmail, renderEmail, escapeHtml } from "../lib/email";
import { letterheadFor } from "../lib/letterhead";
import { audit } from "../lib/audit";

const router: IRouter = Router();
const base = [authMiddleware, requireCompany] as const;

function leadView(l: Lead, stages: PipelineStage[], extra: { booked?: Date | null; grade?: string | null } = {}) {
  const stage = stages.find((s) => s.id === l.stageId) ?? null;
  return {
    id: l.id,
    publicId: l.publicId,
    name: l.name,
    email: l.email,
    phone: l.phone,
    category: l.category,
    linkedin: l.linkedin,
    goal: l.goal,
    source: l.source,
    intent: l.intent,
    stageId: l.stageId,
    stage: stage ? { id: stage.id, name: stage.name, kind: stage.kind, color: stage.color, ...stageColor(stage.color) } : null,
    ownerUserId: l.ownerUserId,
    bookedAt: (extra.booked ?? l.bookedAt)?.toISOString() ?? null,
    grade: extra.grade ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

function stageView(s: PipelineStage, count: number) {
  return { id: s.id, name: s.name, kind: s.kind, color: s.color, sort: s.sort, count, ...stageColor(s.color) };
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

router.get("/companies/:companyId/leads", ...base, requirePermission("clients", "read"), async (req, res) => {
  const company = req.company!;
  const [leads, stages] = await Promise.all([db.select().from(leadsTable).where(eq(leadsTable.companyId, company.id)).orderBy(desc(leadsTable.createdAt)), stagesFor(company.id)]);
  const leadIds = leads.map((l) => l.id);
  const [bookings, grades] = leadIds.length
    ? await Promise.all([
        db.select({ leadId: bookingsTable.leadId, startAt: bookingsTable.startAt }).from(bookingsTable).where(and(inArray(bookingsTable.leadId, leadIds), eq(bookingsTable.status, "scheduled"))),
        db.select({ leadId: profileAssessmentsTable.leadId, grade: profileAssessmentsTable.grade }).from(profileAssessmentsTable).where(inArray(profileAssessmentsTable.leadId, leadIds)),
      ])
    : [[], []];
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const firstOpen = stages.find((s) => s.kind === "open");
  const counts = Object.fromEntries(stages.map((s) => [s.id, leads.filter((l) => l.stageId === s.id).length]));
  const kindOf = (l: Lead) => stages.find((s) => s.id === l.stageId)?.kind ?? "open";
  res.json({
    leads: leads.map((l) => leadView(l, stages, { booked: bookings.find((b) => b.leadId === l.id)?.startAt ?? null, grade: grades.find((g) => g.leadId === l.id)?.grade ?? null })),
    stages: stages.map((s) => stageView(s, counts[s.id] ?? 0)),
    kpis: {
      newThisWeek: leads.filter((l) => l.createdAt >= weekAgo && (!firstOpen || l.stageId === firstOpen.id)).length,
      inConversation: leads.filter((l) => kindOf(l) === "open" && firstOpen && l.stageId !== firstOpen.id).length,
      clients: leads.filter((l) => kindOf(l) === "won").length,
      total: leads.length,
      lastReceivedAt: leads[0]?.createdAt.toISOString() ?? null,
    },
    calendlyUrl: await calendlyUrlFor(company.id),
  });
});

router.post("/companies/:companyId/leads", ...base, requirePermission("clients", "write"), async (req, res) => {
  const parsed = LeadCreateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid lead" });
    return;
  }
  const lead = await createLead(req.company!, { ...parsed.data, actorUserId: req.user!.userId });
  const stages = await stagesFor(req.company!.id);
  res.status(201).json(leadView(lead, stages));
});

router.get("/companies/:companyId/leads/:leadId", ...base, requirePermission("clients", "read"), async (req, res) => {
  const company = req.company!;
  const lead = await loadLead(company.id, Number(req.params.leadId));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const [stages, activity, bookings, assessments, calendlyUrl] = await Promise.all([
    stagesFor(company.id),
    leadActivity(lead.id),
    db.select().from(bookingsTable).where(eq(bookingsTable.leadId, lead.id)).orderBy(desc(bookingsTable.createdAt)),
    db.select({ id: profileAssessmentsTable.id, publicId: profileAssessmentsTable.publicId, grade: profileAssessmentsTable.grade, status: profileAssessmentsTable.status, rubricVersion: profileAssessmentsTable.rubricVersion, unlocked: profileAssessmentsTable.unlocked, createdAt: profileAssessmentsTable.createdAt }).from(profileAssessmentsTable).where(eq(profileAssessmentsTable.leadId, lead.id)).orderBy(desc(profileAssessmentsTable.createdAt)),
    calendlyUrlFor(company.id),
  ]);
  const booking = bookings.find((b) => b.status === "scheduled") ?? bookings[0] ?? null;
  const prefill = calendlyUrl ? `${calendlyUrl}${calendlyUrl.includes("?") ? "&" : "?"}name=${encodeURIComponent(lead.name)}&email=${encodeURIComponent(lead.email)}&utm_source=advisor_platform&utm_content=${encodeURIComponent(lead.publicId)}` : null;
  res.json({
    lead: leadView(lead, stages, { booked: booking?.startAt ?? null, grade: assessments[0]?.grade ?? null }),
    activity: activity.map((a) => ({ id: a.id, type: a.type, body: a.body, meta: a.meta, actorUserId: a.actorUserId, createdAt: a.createdAt.toISOString() })),
    booking: booking ? { id: booking.id, startAt: booking.startAt?.toISOString() ?? null, status: booking.status, eventUri: booking.eventUri } : null,
    assessments: assessments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    calendly: { connected: Boolean(calendlyUrl), prefillUrl: prefill },
    templates: OUTREACH_TEMPLATES.map((t) => ({ key: t.key, label: t.label, timing: t.timing, subject: fillOutreach(t.subject, { name: lead.name, company: company.name, owner: company.ownerName }) })),
  });
});

router.patch("/companies/:companyId/leads/:leadId", ...base, async (req, res) => {
  const company = req.company!;
  const lead = await loadLead(company.id, Number(req.params.leadId));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const parsed = LeadUpdateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const b = parsed.data;
  const user = req.currentUser!;
  const stageChange = b.stageId !== undefined && b.stageId !== lead.stageId;
  const otherChanges = Object.keys(b).some((k) => k !== "stageId");
  const { hasPermission } = await import("@workspace/shared");
  if (stageChange && !hasPermission(user, "pipeline", "write")) {
    res.status(403).json({ error: "You need write access to pipeline" });
    return;
  }
  if (otherChanges && !hasPermission(user, "clients", "write")) {
    res.status(403).json({ error: "You need write access to clients" });
    return;
  }
  const stages = await stagesFor(company.id);
  if (b.stageId !== undefined && !stages.some((s) => s.id === b.stageId)) {
    res.status(400).json({ error: "Unknown stage" });
    return;
  }
  if (b.ownerUserId) {
    const [owner] = await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.id, b.ownerUserId), eq(usersTable.companyId, company.id), isNull(usersTable.deactivatedAt), ne(usersTable.role, "client"))).limit(1);
    if (!owner) {
      res.status(400).json({ error: "Owner must be a member of this company's team" });
      return;
    }
  }
  const [updated] = await db
    .update(leadsTable)
    .set({ ...b, linkedin: b.linkedin !== undefined ? b.linkedin.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "") : undefined, updatedAt: new Date() })
    .where(eq(leadsTable.id, lead.id))
    .returning();
  if (stageChange) {
    const from = stages.find((s) => s.id === lead.stageId)?.name ?? "—";
    const to = stages.find((s) => s.id === b.stageId)?.name ?? "—";
    await logActivity(lead, "stage_changed", `Moved from ${from} to ${to}`, { actorUserId: user.id, meta: { fromStageId: lead.stageId, toStageId: b.stageId } });
  }
  res.json(leadView(updated, stages));
});

router.delete("/companies/:companyId/leads/:leadId", ...base, requirePermission("clients", "write"), async (req, res) => {
  const company = req.company!;
  const lead = await loadLead(company.id, Number(req.params.leadId));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  await db.delete(leadsTable).where(eq(leadsTable.id, lead.id));
  await audit(req, { action: "lead_deleted", resourceType: "lead", resourceId: lead.id, details: { email: lead.email } });
  res.json({ ok: true });
});

router.post("/companies/:companyId/leads/:leadId/activity", ...base, requirePermission("clients", "write"), async (req, res) => {
  const lead = await loadLead(req.company!.id, Number(req.params.leadId));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const parsed = LeadNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Write a note first" });
    return;
  }
  await logActivity(lead, "note", parsed.data.body, { actorUserId: req.user!.userId });
  res.status(201).json({ ok: true });
});

/** Send one of the outreach templates from the company's own SendGrid, with a personal note. */
router.post("/companies/:companyId/leads/:leadId/email", ...base, requirePermission("clients", "write"), requireFeature("sendgrid"), async (req, res) => {
  const company = req.company!;
  const lead = await loadLead(company.id, Number(req.params.leadId));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const parsed = LeadEmailBody.safeParse(req.body);
  const template = parsed.success ? OUTREACH_TEMPLATES.find((t) => t.key === parsed.data.templateKey) : undefined;
  if (!parsed.success || !template) {
    res.status(400).json({ error: "Pick a template" });
    return;
  }
  const sender = await companySender(company);
  if (!sender) {
    res.status(409).json({ error: "Connect SendGrid in Company settings → Integrations before sending email.", code: "sendgrid_not_connected" });
    return;
  }
  const vars = { name: lead.name, company: company.name, owner: company.ownerName, note: parsed.data.note };
  const subject = fillOutreach(template.subject, vars);
  const text = fillOutreach(template.body, vars);
  const lh = await letterheadFor(company.id);
  const html = renderEmail(lh, text.split("\n\n").map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3D556F">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`).join(""));
  const result = await sendEmail({ to: lead.email, subject, html, text, template: `outreach_${template.key}`, companyId: company.id, sender: "company", from: sender, metadata: { leadId: lead.id, by: req.user!.userId } });
  if (!result.success) {
    res.status(502).json({ error: result.error ?? "SendGrid did not accept the message" });
    return;
  }
  await logActivity(lead, "email_sent", `Email sent: ${template.label}`, { actorUserId: req.user!.userId, meta: { templateKey: template.key, emailLogId: result.emailLogId } });
  res.json({ ok: true, subject });
});

// ---------------------------------------------------------------------------
// Pipeline stages (Manage columns)
// ---------------------------------------------------------------------------

router.get("/companies/:companyId/stages", ...base, requirePermission("pipeline", "read"), async (req, res) => {
  const stages = await stagesFor(req.company!.id);
  const leads = await db.select({ stageId: leadsTable.stageId }).from(leadsTable).where(eq(leadsTable.companyId, req.company!.id));
  res.json(stages.map((s) => stageView(s, leads.filter((l) => l.stageId === s.id).length)));
});

/**
 * Replace the column set: rename, reorder, add, remove, change kind. Leads in a
 * removed column move to the first remaining open column. At least one open
 * stage is required.
 */
router.put("/companies/:companyId/stages", ...base, requireFeature("pipeline_board"), requireRole("admin", "super_admin", "manager"), requirePermission("pipeline", "write"), async (req, res) => {
  const company = req.company!;
  const parsed = StagesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid stages" });
    return;
  }
  const input = parsed.data.stages;
  if (!input.some((s) => s.kind === "open")) {
    res.status(400).json({ error: "Keep at least one open stage" });
    return;
  }
  const names = input.map((s) => s.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    res.status(400).json({ error: "Stage names must be unique" });
    return;
  }
  const existing = await stagesFor(company.id);
  const keepIds = new Set(input.filter((s) => s.id).map((s) => s.id!));
  for (const s of input) {
    if (s.id && !existing.some((e) => e.id === s.id)) {
      res.status(400).json({ error: "Unknown stage id" });
      return;
    }
  }
  await db.transaction(async (tx) => {
    const idMap = new Map<number, number>();
    for (const [i, s] of input.entries()) {
      const color = s.color && (STAGE_PALETTE as readonly string[]).concat(["navy", "grey"]).includes(s.color) ? s.color : s.kind === "won" ? "navy" : s.kind === "lost" ? "grey" : STAGE_PALETTE[i % STAGE_PALETTE.length];
      if (s.id) {
        await tx.update(pipelineStagesTable).set({ name: s.name, kind: s.kind, color, sort: i }).where(eq(pipelineStagesTable.id, s.id));
        idMap.set(s.id, s.id);
      } else {
        const [row] = await tx.insert(pipelineStagesTable).values({ companyId: company.id, name: s.name, kind: s.kind, color, sort: i }).returning();
        idMap.set(-i - 1, row.id);
      }
    }
    const removed = existing.filter((e) => !keepIds.has(e.id));
    if (removed.length) {
      const after = await tx.select().from(pipelineStagesTable).where(eq(pipelineStagesTable.companyId, company.id)).orderBy(asc(pipelineStagesTable.sort));
      const fallback = after.find((s) => s.kind === "open" && keepIds.has(s.id)) ?? after.find((s) => keepIds.has(s.id));
      if (fallback) {
        await tx
          .update(leadsTable)
          .set({ stageId: fallback.id, updatedAt: new Date() })
          .where(and(eq(leadsTable.companyId, company.id), inArray(leadsTable.stageId, removed.map((r) => r.id))));
      }
      await tx.delete(pipelineStagesTable).where(inArray(pipelineStagesTable.id, removed.map((r) => r.id)));
    }
  });
  await audit(req, { action: "pipeline_stages_updated", resourceType: "pipeline", details: { stages: input.map((s) => s.name) } });
  const stages = await stagesFor(company.id);
  const leads = await db.select({ stageId: leadsTable.stageId }).from(leadsTable).where(eq(leadsTable.companyId, company.id));
  res.json(stages.map((s) => stageView(s, leads.filter((l) => l.stageId === s.id).length)));
});

export default router;
