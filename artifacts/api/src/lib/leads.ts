import { and, asc, desc, eq } from "drizzle-orm";
import { db, leadsTable, leadActivityTable, pipelineStagesTable, type Company, type Lead, type PipelineStage } from "@workspace/db";
import type { ActivityType } from "@workspace/shared";
import { newPublicId } from "./tokens";

export async function stagesFor(companyId: number): Promise<PipelineStage[]> {
  return db.select().from(pipelineStagesTable).where(eq(pipelineStagesTable.companyId, companyId)).orderBy(asc(pipelineStagesTable.sort), asc(pipelineStagesTable.id));
}

export async function firstOpenStage(companyId: number): Promise<PipelineStage | null> {
  const stages = await stagesFor(companyId);
  return stages.find((s) => s.kind === "open") ?? stages[0] ?? null;
}

export async function logActivity(lead: Pick<Lead, "id" | "companyId">, type: ActivityType, body: string, opts: { actorUserId?: number | null; meta?: Record<string, unknown> } = {}): Promise<void> {
  await db.insert(leadActivityTable).values({ leadId: lead.id, companyId: lead.companyId, type, body, meta: opts.meta ?? {}, actorUserId: opts.actorUserId ?? null });
}

export interface NewLeadInput {
  name: string;
  email: string;
  phone?: string;
  category?: string;
  linkedin?: string;
  goal?: string;
  source: string;
  stageId?: number | null;
  intent?: string | null;
  meta?: Record<string, unknown>;
  actorUserId?: number | null;
}

/** Create a lead in the first open stage (or a given stage) and record how it arrived. */
export async function createLead(company: Pick<Company, "id">, input: NewLeadInput): Promise<Lead> {
  const stage = input.stageId ? (await stagesFor(company.id)).find((s) => s.id === input.stageId) ?? null : await firstOpenStage(company.id);
  const [lead] = await db
    .insert(leadsTable)
    .values({
      publicId: newPublicId("ld_"),
      companyId: company.id,
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone ?? "",
      category: input.category ?? "",
      linkedin: normalizeLinkedin(input.linkedin ?? ""),
      goal: input.goal ?? "",
      stageId: stage?.id ?? null,
      source: input.source,
      intent: input.intent ?? null,
      meta: input.meta ?? {},
    })
    .returning();
  const how: Record<string, string> = {
    landing_form: "Form submitted via landing page",
    platform_form: "Demo / trial request submitted",
    grader: "Profile Grader request",
    manual: "Added manually",
    import: "Imported",
    test: "Test lead created",
  };
  await logActivity(lead, input.source === "landing_form" || input.source === "platform_form" ? "form_submitted" : "created", how[input.source] ?? "Lead created", { actorUserId: input.actorUserId ?? null });
  return lead;
}

export function normalizeLinkedin(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return v.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");
}

export async function leadActivity(leadId: number) {
  return db.select().from(leadActivityTable).where(eq(leadActivityTable.leadId, leadId)).orderBy(desc(leadActivityTable.createdAt), desc(leadActivityTable.id));
}

export async function loadLead(companyId: number, leadId: number): Promise<Lead | null> {
  const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.companyId, companyId), eq(leadsTable.id, leadId))).limit(1);
  return lead ?? null;
}
