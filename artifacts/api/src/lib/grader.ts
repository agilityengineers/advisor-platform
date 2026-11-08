import { createHash } from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db, companiesTable, leadsTable, profileAssessmentsTable, type Company, type Lead, type ProfileAssessment } from "@workspace/db";
import { normalizeBrightDataProfile, normalizeLinkedinProfileUrl, scoreProfile, type GraderProfile, type GraderResult } from "@workspace/shared";
import { publishedRubric } from "../routes/rubric";
import { logActivity } from "./leads";
import { calendlyUrlFor } from "./integrations";
import { sendCompanyMail } from "./companyMail";
import { button, escapeHtml, heading, paragraph } from "./email";
import { companyBaseUrl } from "./urls";
import { newPublicId } from "./tokens";
import { env } from "../env";
import { logger } from "./logger";

/**
 * Profile Grader: Bright Data fetch → normalise → score against the company's
 * published rubric → gated report. The fetch is the port of
 * LinkedIn-Profile-Grader's fetchLinkedInProfile: trigger the dataset job,
 * poll the snapshot every 2 s for up to 60 s, retry the whole thing once.
 */
export const BRIGHTDATA_DATASET_ID = "gd_l1viktl72bvl7bjuj0";
const POLL_INTERVAL_MS = 2000;
const POLL_ATTEMPTS = 30;
const MAX_ATTEMPTS = 2;
const STALE_AFTER_MS = 15 * 60_000;

export type GraderMode = "live" | "demo" | "off";
export function graderMode(): GraderMode {
  if (env.graderDemo) return "demo";
  if (env.brightDataApiKey) return "live";
  return "off";
}

export type FetchOutcome = { ok: true; profile: GraderProfile; raw: Record<string, unknown>; source: "brightdata" | "sample" } | { ok: false; message: string; details: string; retryable: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchLinkedInProfile(linkedinUrl: string): Promise<FetchOutcome> {
  const apiKey = env.brightDataApiKey;
  if (!apiKey) return { ok: false, message: "Bright Data is not configured", details: "BRIGHTDATA_API_KEY is unset", retryable: false };
  try {
    const trigger = await fetch(`https://api.brightdata.com/datasets/v3/trigger?dataset_id=${BRIGHTDATA_DATASET_ID}&include_errors=true&discover_new=true`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify([{ url: linkedinUrl }]),
    });
    if (!trigger.ok) return { ok: false, message: "Failed to start profile fetch", details: `Status ${trigger.status}: ${(await trigger.text()).slice(0, 300)}`, retryable: trigger.status >= 500 };
    const snapshotId = ((await trigger.json()) as { snapshot_id?: string }).snapshot_id;
    if (!snapshotId) return { ok: false, message: "No snapshot id returned", details: "Bright Data answered without a snapshot_id", retryable: true };
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);
      const res = await fetch(`https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`, { headers: { authorization: `Bearer ${apiKey}` } });
      if (res.status === 202) continue;
      if (res.status !== 200) return { ok: false, message: "Error checking fetch status", details: `Status ${res.status}: ${(await res.text()).slice(0, 300)}`, retryable: res.status >= 500 };
      const raw = (await res.json()) as unknown;
      const profile = normalizeBrightDataProfile(raw, linkedinUrl);
      if (!profile) return { ok: false, message: "Profile data could not be processed", details: `Bright Data returned ${JSON.stringify(raw).slice(0, 300)}`, retryable: false };
      const record = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown>;
      return { ok: true, profile, raw: trimRaw(record), source: "brightdata" };
    }
    return { ok: false, message: "Request timed out", details: `Profile fetch did not complete within ${(POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000} seconds. The profile may be private or LinkedIn slow to respond.`, retryable: true };
  } catch (err) {
    return { ok: false, message: "Network or system error", details: err instanceof Error ? err.message : String(err), retryable: true };
  }
}

/** Keep the snapshot small: scalar fields plus the counts; long arrays are summarised. */
function trimRaw(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (Array.isArray(v)) out[k] = { count: v.length };
    else if (typeof v === "string") out[k] = v.slice(0, 2000);
    else if (v === null || typeof v !== "object") out[k] = v;
  }
  return out;
}

/** Demo mode: a deterministic profile shaped by the URL, so the same link always grades the same. */
export function syntheticProfile(linkedinUrl: string, name: string): GraderProfile {
  const h = createHash("sha256").update(linkedinUrl.toLowerCase()).digest();
  const pick = (i: number, max: number) => h[i % h.length] % (max + 1);
  const headline = pick(0, 1) ? "I help founders grow revenue with positioning that converts | Fractional CMO" : "Senior Director, Field Marketing | Operations";
  const about = pick(1, 1) ? "I help B2B teams improve pipeline quality and scale what works. ".repeat(6) : "Experienced leader. Awarded twice, promoted three times. ".repeat(3);
  return {
    name,
    headline,
    about,
    location: pick(2, 3) ? "Chicago, IL" : "",
    photoPresent: pick(3, 4) ? 1 : 0,
    bannerPresent: pick(4, 2) ? 1 : 0,
    connectionsCount: [120, 340, 500, 1240, 3100][pick(5, 4)],
    followersCount: [80, 420, 1310, 2600, 6200][pick(6, 4)],
    recommendationsCount: pick(7, 12),
    activityScore: pick(8, 3),
    profileWordCount: [120, 260, 410, 650, 900][pick(9, 4)],
    aboutWordCount: [30, 90, 120, 210, 320][pick(10, 4)],
    projectsCount: pick(11, 5),
    certificationsCount: pick(12, 5),
    organizationsCount: pick(13, 2),
    coursesCount: pick(14, 2),
    honorsCount: pick(15, 2),
    publicationsCount: pick(16, 1),
    languagesCount: pick(17, 2),
    featuredCount: pick(18, 2),
    volunteerCount: pick(19, 1),
    serviceLanguageScore: pick(20, 1) ? 3 : pick(21, 1) ? 2 : 0,
    balanceScore: pick(22, 1),
    skillsCount: 10 + pick(23, 60),
    groupsCount: pick(24, 12),
  };
}

export interface StartOptions {
  trigger: "lead_form" | "staff" | "rerun";
  actorUserId?: number | null;
  /** Email the lead the summary when the grade lands. */
  notify: boolean;
  linkedinUrl?: string;
}

/** Create the assessment row and run it (awaited under tests so the outcome is deterministic). */
export async function startAssessment(company: Company, lead: Lead, opts: StartOptions): Promise<ProfileAssessment> {
  const url = normalizeLinkedinProfileUrl(opts.linkedinUrl ?? lead.linkedin);
  if (!url) throw new GraderError("A linkedin.com/in/… profile URL is required", 400);
  const mode = graderMode();
  if (mode === "off") throw new GraderError("The Profile Grader isn't configured on this platform yet (BRIGHTDATA_API_KEY).", 503);
  const [row] = await db.insert(profileAssessmentsTable).values({ publicId: newPublicId("pa_"), companyId: company.id, leadId: lead.id, linkedinUrl: url, status: "pending", attempt: 1 }).returning();
  await logActivity(lead, "grade", opts.trigger === "lead_form" ? "Profile Grade started from the landing form" : opts.trigger === "rerun" ? "Profile Grade re-run" : "Profile Grade started", { actorUserId: opts.actorUserId ?? null, meta: { assessmentId: row.id, trigger: opts.trigger } });
  const run = runAssessment(row.id, { notify: opts.notify, mode }).catch((err) => logger.error({ err, assessmentId: row.id }, "Assessment run crashed"));
  if (env.isTest) await run;
  return (await db.select().from(profileAssessmentsTable).where(eq(profileAssessmentsTable.id, row.id)).limit(1))[0] ?? row;
}

export class GraderError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export async function runAssessment(id: number, opts: { notify: boolean; mode: GraderMode }): Promise<ProfileAssessment | null> {
  const [row] = await db.select().from(profileAssessmentsTable).where(eq(profileAssessmentsTable.id, id)).limit(1);
  if (!row || row.status === "scored") return row ?? null;
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, row.companyId)).limit(1);
  const lead = row.leadId ? ((await db.select().from(leadsTable).where(eq(leadsTable.id, row.leadId)).limit(1))[0] ?? null) : null;
  if (!company) return row;
  let last: FetchOutcome | null = null;
  for (let attempt = row.attempt; attempt <= MAX_ATTEMPTS; attempt++) {
    await db.update(profileAssessmentsTable).set({ status: attempt === 1 ? "fetching" : "retrying", attempt, updatedAt: new Date() }).where(eq(profileAssessmentsTable.id, id));
    const outcome: FetchOutcome = opts.mode === "demo" ? { ok: true, profile: syntheticProfile(row.linkedinUrl, lead?.name ?? "Your"), raw: { source: "sample" }, source: "sample" } : await fetchLinkedInProfile(row.linkedinUrl);
    last = outcome;
    if (outcome.ok) {
      const { rubric, version } = await publishedRubric(company.id);
      const scores = scoreProfile(rubric, outcome.profile);
      const [updated] = await db
        .update(profileAssessmentsTable)
        .set({ status: "scored", profile: outcome.profile, rawSnapshot: { ...outcome.raw, _source: outcome.source }, scores, grade: scores.grade, rubricVersion: version, errorMessage: null, updatedAt: new Date() })
        .where(eq(profileAssessmentsTable.id, id))
        .returning();
      if (lead) await logActivity(lead, "grade", `Profile graded ${scores.grade} · ${scores.pctTotal}% · rubric v${version}${outcome.source === "sample" ? " (demo data)" : ""}`, { meta: { assessmentId: id, grade: scores.grade, pctTotal: scores.pctTotal } });
      if (opts.notify && lead) await sendGradeEmail(company, lead, updated).catch((err) => logger.warn({ err, assessmentId: id }, "Grade email failed"));
      return updated;
    }
    if (!outcome.retryable) break;
  }
  const [failed] = await db.update(profileAssessmentsTable).set({ status: "failed", errorMessage: last && !last.ok ? `${last.message}: ${last.details}`.slice(0, 1000) : "Unknown error", updatedAt: new Date() }).where(eq(profileAssessmentsTable.id, id)).returning();
  if (lead) await logActivity(lead, "grade", `Profile Grade failed · ${last && !last.ok ? last.message : "unknown error"}`, { meta: { assessmentId: id } });
  return failed;
}

/** Re-score the stored profile against the company's current published rubric (no refetch). */
export async function rescoreAssessment(row: ProfileAssessment): Promise<ProfileAssessment> {
  if (!row.profile) throw new GraderError("Nothing to re-score — this assessment never completed", 409);
  const { rubric, version } = await publishedRubric(row.companyId);
  const scores: GraderResult = scoreProfile(rubric, row.profile);
  const [updated] = await db.update(profileAssessmentsTable).set({ scores, grade: scores.grade, rubricVersion: version, updatedAt: new Date() }).where(eq(profileAssessmentsTable.id, row.id)).returning();
  return updated;
}

export async function unlockAssessment(row: ProfileAssessment, reason: string, actorUserId?: number | null): Promise<ProfileAssessment> {
  if (row.unlocked) return row;
  const [updated] = await db.update(profileAssessmentsTable).set({ unlocked: true, unlockedAt: new Date(), updatedAt: new Date() }).where(eq(profileAssessmentsTable.id, row.id)).returning();
  if (row.leadId) {
    const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, row.leadId)).limit(1);
    if (lead) await logActivity(lead, "grade", `Full report unlocked · ${reason}`, { actorUserId: actorUserId ?? null, meta: { assessmentId: row.id } });
  }
  return updated;
}

/** A buyer's reports open the moment they become a client. */
export async function unlockForLead(leadId: number, reason: string): Promise<number> {
  const rows = await db.select().from(profileAssessmentsTable).where(and(eq(profileAssessmentsTable.leadId, leadId), eq(profileAssessmentsTable.unlocked, false)));
  for (const r of rows) await unlockAssessment(r, reason);
  return rows.length;
}

export async function reportUrlFor(company: Company, row: Pick<ProfileAssessment, "publicId">): Promise<string> {
  return `${await companyBaseUrl(company)}/grade/${encodeURIComponent(row.publicId)}`;
}

/** The summary email (Profile Grade.dc.html, lead view): grade, strongest / gap, quick wins, link to the report. */
export async function sendGradeEmail(company: Company, lead: Lead, row: ProfileAssessment): Promise<{ success: boolean; error?: string }> {
  if (!row.scores) return { success: false, error: "Not scored yet" };
  const s = row.scores;
  const url = await reportUrlFor(company, row);
  const calendly = await calendlyUrlFor(company.id);
  const first = lead.name.split(/\s+/)[0] || "there";
  const owner = company.ownerName.split(/\s+/)[0] || company.name;
  const wins = s.quickWins.slice(0, 3).map((w) => `<li style="margin:0 0 6px">${escapeHtml(w.action)}</li>`).join("");
  const body =
    heading(`${first}, your profile scores ${s.pctTotal}% — a ${s.grade}.`) +
    paragraph(`<strong>${escapeHtml(s.gradeLabel)}.</strong> ${escapeHtml(s.gradeMessage)}`) +
    paragraph(`<strong>Strongest:</strong> ${escapeHtml(s.strongest?.name ?? "—")} · <strong>Biggest gap:</strong> ${escapeHtml(s.biggestGap?.name ?? "—")} · Core ${s.coreScore}/${s.coreMax}, additional ${s.additionalScore}/${s.additionalMax}.`) +
    (wins ? `<p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:0.08em;color:#0B4FD0">QUICK WINS</p><ul style="margin:0 0 16px 18px;padding:0;font-size:15px;line-height:1.5;color:#3D556F">${wins}</ul>` : "") +
    button(url, "See my Profile Grade", "#1668F0") +
    paragraph(`The full report — every finding and the prioritised plan — unlocks with an engagement${calendly ? `, or <a href="${escapeHtml(calendly)}" style="font-weight:700;color:#1668F0">book 15 minutes with ${escapeHtml(owner)}</a> to walk through it` : ""}.`);
  const r = await sendCompanyMail(company, { to: lead.email, subject: `Your LinkedIn Profile Grade: ${s.grade} (${s.pctTotal}%)`, template: "profile_grade", body, actionUrl: url, metadata: { assessmentId: row.id, leadId: lead.id } });
  await logActivity(lead, "email_sent", r.success ? `Profile Grade emailed (${s.grade})` : `Profile Grade email not sent · ${r.error ?? "email not configured"}`, { meta: { assessmentId: row.id, emailLogId: r.emailLogId ?? null } });
  return { success: r.success, error: r.error };
}

/** Jobs a dead process left behind are failed, not forgotten. */
export async function failStaleAssessments(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await db.select({ id: profileAssessmentsTable.id }).from(profileAssessmentsTable).where(and(inArray(profileAssessmentsTable.status, ["pending", "fetching", "retrying"]), lt(profileAssessmentsTable.updatedAt, cutoff)));
  if (stale.length) await db.update(profileAssessmentsTable).set({ status: "failed", errorMessage: "Timed out: the fetch did not finish. Re-run the audit.", updatedAt: new Date() }).where(inArray(profileAssessmentsTable.id, stale.map((s) => s.id)));
  return stale.length;
}

export function assessmentView(row: ProfileAssessment, reportUrl: string | null) {
  return {
    id: row.id,
    publicId: row.publicId,
    linkedinUrl: row.linkedinUrl,
    status: row.status,
    attempt: row.attempt,
    errorMessage: row.errorMessage,
    grade: row.grade,
    pctTotal: row.scores?.pctTotal ?? null,
    total: row.scores?.total ?? null,
    maxTotal: row.scores?.maxTotal ?? null,
    strongest: row.scores?.strongest?.name ?? null,
    biggestGap: row.scores?.biggestGap?.name ?? null,
    rubricVersion: row.rubricVersion,
    unlocked: row.unlocked,
    unlockedAt: row.unlockedAt?.toISOString() ?? null,
    source: (row.rawSnapshot as { _source?: string } | null)?._source ?? null,
    reportUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
