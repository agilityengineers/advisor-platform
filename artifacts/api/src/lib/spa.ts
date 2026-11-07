import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { env } from "../env";
import { logger } from "./logger";

/**
 * One deployment serves API + client. In production the built SPA is served
 * from artifacts/web/dist with an index.html fallback; in development Vite
 * runs in middleware mode on the same port so host-based tenant resolution
 * works in the Replit preview without a second server.
 */

function repoRoot(): string {
  // Works both from src (tsx) and from dist (bundled): walk up until artifacts/web exists.
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "artifacts", "web"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export const WEB_ROOT = path.join(repoRoot(), "artifacts", "web");
export const WEB_DIST = path.join(WEB_ROOT, "dist");

function isApiOrAsset(req: Request): boolean {
  return req.path.startsWith("/api/") || req.path === "/api";
}

export async function mountSpa(app: Express): Promise<void> {
  if (env.isProduction || env.isTest) {
    if (!existsSync(path.join(WEB_DIST, "index.html"))) {
      logger.warn({ WEB_DIST }, "Client build not found — API only. Run `pnpm --filter @workspace/web run build`.");
      return;
    }
    app.use(express.static(WEB_DIST, { index: false, maxAge: "1h", setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } }));
    const indexHtml = readFileSync(path.join(WEB_DIST, "index.html"), "utf8");
    app.get(/.*/, (req: Request, res: Response, next: NextFunction) => {
      if (isApiOrAsset(req)) return next();
      res.setHeader("Cache-Control", "no-cache");
      res.type("html").send(indexHtml);
    });
    return;
  }

  const { createServer } = await import("vite");
  const vite = await createServer({
    root: WEB_ROOT,
    configFile: path.join(WEB_ROOT, "vite.config.ts"),
    server: { middlewareMode: true, hmr: { port: env.port + 1 }, allowedHosts: true },
    appType: "custom",
  });
  app.use(vite.middlewares);
  app.get(/.*/, async (req: Request, res: Response, next: NextFunction) => {
    if (isApiOrAsset(req)) return next();
    try {
      const template = readFileSync(path.join(WEB_ROOT, "index.html"), "utf8");
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html", "Cache-Control": "no-cache" }).end(html);
    } catch (err) {
      vite.ssrFixStacktrace(err as Error);
      next(err);
    }
  });
  logger.info("Vite dev middleware mounted");
}
