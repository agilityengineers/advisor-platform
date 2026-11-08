import { Router, type IRouter } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, graderRubricsTable } from "@workspace/db";
import { GRADER_DEFAULT, validateRubric, type Rubric } from "@workspace/shared";
import { authMiddleware, requireCompany, requireRole } from "../lib/auth";
import { audit } from "../lib/audit";

const router: IRouter = Router();
const base = [authMiddleware, requireCompany, requireRole("admin", "super_admin")] as const;

export async function publishedRubric(companyId: number): Promise<{ rubric: Rubric; version: number; publishedAt: string | null; source: "company" | "platform" }> {
  const [company] = await db.select().from(graderRubricsTable).where(and(eq(graderRubricsTable.companyId, companyId), eq(graderRubricsTable.status, "published"))).orderBy(desc(graderRubricsTable.version)).limit(1);
  if (company) return { rubric: { ...company.rubric, version: company.version }, version: company.version, publishedAt: company.publishedAt?.toISOString() ?? null, source: "company" };
  const [platform] = await db.select().from(graderRubricsTable).where(and(isNull(graderRubricsTable.companyId), eq(graderRubricsTable.status, "published"))).orderBy(desc(graderRubricsTable.version)).limit(1);
  const rubric = platform?.rubric ?? GRADER_DEFAULT;
  return { rubric: { ...rubric, version: platform?.version ?? 1 }, version: platform?.version ?? 1, publishedAt: platform?.publishedAt?.toISOString() ?? null, source: "platform" };
}

function coerceRubric(input: unknown): Rubric | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Partial<Rubric>;
  if (!Array.isArray(r.categories) || !Array.isArray(r.grades)) return null;
  return { version: Number(r.version) || 1, grades: r.grades, categories: r.categories, tips: Array.isArray(r.tips) ? r.tips : [] };
}

router.get("/companies/:companyId/rubric", ...base, async (req, res) => {
  const companyId = req.company!.id;
  const [draft] = await db.select().from(graderRubricsTable).where(and(eq(graderRubricsTable.companyId, companyId), eq(graderRubricsTable.status, "draft"))).limit(1);
  const published = await publishedRubric(companyId);
  const working = draft ? { ...draft.rubric, version: published.version } : published.rubric;
  res.json({
    working,
    hasDraft: Boolean(draft),
    draftUpdatedAt: draft?.updatedAt.toISOString() ?? null,
    published: { version: published.version, publishedAt: published.publishedAt, source: published.source },
    nextVersion: published.version + 1,
    problems: validateRubric(working),
    platformDefault: GRADER_DEFAULT,
  });
});

/** Save edits as a draft. Structure is checked; weights may be out of balance while editing (publish enforces). */
router.put("/companies/:companyId/rubric/draft", ...base, async (req, res) => {
  const rubric = coerceRubric(req.body?.rubric ?? req.body);
  if (!rubric) {
    res.status(400).json({ error: "A rubric needs categories and grades" });
    return;
  }
  const companyId = req.company!.id;
  const published = await publishedRubric(companyId);
  const [draft] = await db.select().from(graderRubricsTable).where(and(eq(graderRubricsTable.companyId, companyId), eq(graderRubricsTable.status, "draft"))).limit(1);
  const value = { ...rubric, version: published.version + 1 };
  if (draft) await db.update(graderRubricsTable).set({ rubric: value, version: published.version + 1, updatedAt: new Date() }).where(eq(graderRubricsTable.id, draft.id));
  else await db.insert(graderRubricsTable).values({ companyId, version: published.version + 1, status: "draft", rubric: value, createdBy: req.user!.userId });
  res.json({ ok: true, problems: validateRubric(value) });
});

/** Publish as vN: the draft becomes the new immutable published version; older versions stay for report stamping. */
router.post("/companies/:companyId/rubric/publish", ...base, async (req, res) => {
  const companyId = req.company!.id;
  const [draft] = await db.select().from(graderRubricsTable).where(and(eq(graderRubricsTable.companyId, companyId), eq(graderRubricsTable.status, "draft"))).limit(1);
  if (!draft) {
    res.status(400).json({ error: "No unpublished edits to publish" });
    return;
  }
  const problems = validateRubric(draft.rubric);
  if (problems.length) {
    res.status(400).json({ error: problems[0].message, problems });
    return;
  }
  const published = await publishedRubric(companyId);
  const version = published.version + 1;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(graderRubricsTable).values({ companyId, version, status: "published", rubric: { ...draft.rubric, version }, publishedAt: now, createdBy: req.user!.userId });
    await tx.delete(graderRubricsTable).where(eq(graderRubricsTable.id, draft.id));
  });
  await audit(req, { action: "rubric_published", resourceType: "grader_rubric", details: { version } });
  res.json({ ok: true, version, publishedAt: now.toISOString() });
});

router.post("/companies/:companyId/rubric/reset", ...base, async (req, res) => {
  const companyId = req.company!.id;
  const published = await publishedRubric(companyId);
  const [draft] = await db.select().from(graderRubricsTable).where(and(eq(graderRubricsTable.companyId, companyId), eq(graderRubricsTable.status, "draft"))).limit(1);
  const value = { ...GRADER_DEFAULT, version: published.version + 1 };
  if (draft) await db.update(graderRubricsTable).set({ rubric: value, updatedAt: new Date() }).where(eq(graderRubricsTable.id, draft.id));
  else await db.insert(graderRubricsTable).values({ companyId, version: published.version + 1, status: "draft", rubric: value, createdBy: req.user!.userId });
  res.json({ ok: true, working: value });
});

router.post("/companies/:companyId/rubric/discard", ...base, async (req, res) => {
  await db.delete(graderRubricsTable).where(and(eq(graderRubricsTable.companyId, req.company!.id), eq(graderRubricsTable.status, "draft")));
  res.json({ ok: true });
});

export default router;
