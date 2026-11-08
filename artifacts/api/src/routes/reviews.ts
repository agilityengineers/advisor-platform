import { Router, type IRouter } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, reviewsTable, type Review } from "@workspace/db";
import { ReviewBody, ReviewOrderBody } from "@workspace/shared";
import { authMiddleware, requireCompany, requirePermission } from "../lib/auth";
import { requireFeature } from "../lib/features";

const router: IRouter = Router();
const base = [authMiddleware, requireCompany, requireFeature("reviews")] as const;

export const reviewView = (r: Review) => ({ id: r.id, name: r.name, role: r.role, category: r.category, linkedin: r.linkedin, quote: r.quote, reviewedOn: r.reviewedOn, visible: r.visible, sort: r.sort, createdAt: r.createdAt.toISOString() });

export async function reviewsFor(companyId: number, onlyVisible = false): Promise<Review[]> {
  return db
    .select()
    .from(reviewsTable)
    .where(onlyVisible ? and(eq(reviewsTable.companyId, companyId), eq(reviewsTable.visible, true)) : eq(reviewsTable.companyId, companyId))
    .orderBy(asc(reviewsTable.sort), asc(reviewsTable.id));
}

router.get("/companies/:companyId/reviews", ...base, requirePermission("reviews", "read"), async (req, res) => {
  res.json((await reviewsFor(req.company!.id)).map(reviewView));
});

router.post("/companies/:companyId/reviews", ...base, requirePermission("reviews", "write"), async (req, res) => {
  const parsed = ReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid review" });
    return;
  }
  const existing = await reviewsFor(req.company!.id);
  const [row] = await db.insert(reviewsTable).values({ companyId: req.company!.id, ...parsed.data, sort: existing.length }).returning();
  res.status(201).json(reviewView(row));
});

router.patch("/companies/:companyId/reviews/:reviewId", ...base, requirePermission("reviews", "write"), async (req, res) => {
  const parsed = ReviewBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid review" });
    return;
  }
  const [row] = await db
    .update(reviewsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(reviewsTable.companyId, req.company!.id), eq(reviewsTable.id, Number(req.params.reviewId))))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Review not found" });
    return;
  }
  res.json(reviewView(row));
});

router.delete("/companies/:companyId/reviews/:reviewId", ...base, requirePermission("reviews", "write"), async (req, res) => {
  const deleted = await db.delete(reviewsTable).where(and(eq(reviewsTable.companyId, req.company!.id), eq(reviewsTable.id, Number(req.params.reviewId)))).returning({ id: reviewsTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Review not found" });
    return;
  }
  res.json({ ok: true });
});

/** Slider order = list order. */
router.put("/companies/:companyId/reviews/order", ...base, requirePermission("reviews", "write"), async (req, res) => {
  const parsed = ReviewOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ids are required" });
    return;
  }
  const rows = await db.select({ id: reviewsTable.id }).from(reviewsTable).where(and(eq(reviewsTable.companyId, req.company!.id), inArray(reviewsTable.id, parsed.data.ids)));
  const known = new Set(rows.map((r) => r.id));
  await db.transaction(async (tx) => {
    let i = 0;
    for (const id of parsed.data.ids) if (known.has(id)) await tx.update(reviewsTable).set({ sort: i++ }).where(eq(reviewsTable.id, id));
  });
  res.json((await reviewsFor(req.company!.id)).map(reviewView));
});

export default router;
