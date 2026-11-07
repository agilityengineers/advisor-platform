import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, platformContentTable } from "@workspace/db";
import { PLATFORM_CONTENT_DEFAULTS, sanitizePlatformContent, type PlatformContent } from "@workspace/shared";
import { authMiddleware, optionalAuth, requireSuperAdmin } from "../lib/auth";
import { audit } from "../lib/audit";

const router: IRouter = Router();
const guard = [authMiddleware, requireSuperAdmin] as const;

async function readRow(status: "draft" | "published") {
  const [row] = await db.select().from(platformContentTable).where(eq(platformContentTable.status, status)).limit(1);
  return row ?? null;
}

export async function publishedPlatformContent(): Promise<{ content: PlatformContent; version: number; publishedAt: string | null }> {
  const row = await readRow("published");
  return { content: sanitizePlatformContent(row?.content ?? PLATFORM_CONTENT_DEFAULTS), version: row?.version ?? 0, publishedAt: row?.publishedAt?.toISOString() ?? null };
}

/** Public: the published Advisor Platform landing copy. `?preview=1` returns the draft to the super admin only. */
router.get("/platform-content", optionalAuth, async (req, res) => {
  if (req.query.preview === "1" && req.user?.role === "super_admin") {
    const draft = await readRow("draft");
    const published = await readRow("published");
    res.json({ content: sanitizePlatformContent(draft?.content ?? published?.content ?? PLATFORM_CONTENT_DEFAULTS), version: draft?.version ?? published?.version ?? 0, preview: true, publishedAt: null });
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json({ ...(await publishedPlatformContent()), preview: false });
});

router.get("/admin/platform-content", ...guard, async (_req, res) => {
  const draft = await readRow("draft");
  const published = await readRow("published");
  res.json({
    draft: { content: sanitizePlatformContent(draft?.content ?? published?.content ?? PLATFORM_CONTENT_DEFAULTS), updatedAt: draft?.updatedAt?.toISOString() ?? null, exists: Boolean(draft) },
    published: { content: sanitizePlatformContent(published?.content ?? PLATFORM_CONTENT_DEFAULTS), version: published?.version ?? 0, publishedAt: published?.publishedAt?.toISOString() ?? null, exists: Boolean(published) },
    defaults: PLATFORM_CONTENT_DEFAULTS,
  });
});

router.put("/admin/platform-content/draft", ...guard, async (req, res) => {
  const content = sanitizePlatformContent(req.body?.content ?? req.body);
  const existing = await readRow("draft");
  const published = await readRow("published");
  const version = (published?.version ?? 0) + 1;
  if (existing) await db.update(platformContentTable).set({ content, version, updatedBy: req.user!.userId, updatedAt: new Date() }).where(eq(platformContentTable.id, existing.id));
  else await db.insert(platformContentTable).values({ status: "draft", content, version, updatedBy: req.user!.userId });
  res.json({ ok: true, content, version });
});

router.post("/admin/platform-content/publish", ...guard, async (req, res) => {
  const draft = await readRow("draft");
  if (!draft) {
    res.status(400).json({ error: "There is no draft to publish" });
    return;
  }
  const content = sanitizePlatformContent(draft.content);
  const published = await readRow("published");
  const version = (published?.version ?? 0) + 1;
  const now = new Date();
  if (published) await db.update(platformContentTable).set({ content, version, publishedAt: now, updatedBy: req.user!.userId, updatedAt: now }).where(eq(platformContentTable.id, published.id));
  else await db.insert(platformContentTable).values({ status: "published", content, version, publishedAt: now, updatedBy: req.user!.userId });
  await db.delete(platformContentTable).where(eq(platformContentTable.id, draft.id));
  await audit(req, { action: "platform_content_published", resourceType: "platform_content", details: { version } });
  res.json({ ok: true, version, publishedAt: now.toISOString() });
});

router.post("/admin/platform-content/discard", ...guard, async (req, res) => {
  const draft = await readRow("draft");
  if (draft) await db.delete(platformContentTable).where(eq(platformContentTable.id, draft.id));
  await audit(req, { action: "platform_content_draft_discarded", resourceType: "platform_content" });
  res.json({ ok: true });
});

export default router;
