import { randomUUID } from "node:crypto";
import express, { type Express } from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./env";
import { logger } from "./lib/logger";
import { tenantResolver } from "./lib/tenant";
import { authLimiter } from "./lib/rateLimit";
import router from "./routes";

export function createApp(): Express {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // Security headers for API responses. The SPA's CSP lives in its index.html
  // because the same process serves it; helmet's CSP here applies only to JSON
  // and is restrictive on purpose.
  app.use("/api", helmet({ contentSecurityPolicy: { useDefaults: false, directives: { "default-src": ["'none'"], "frame-ancestors": ["'none'"] } }, crossOriginResourcePolicy: { policy: "same-site" } }));

  const corsOptions: CorsOptions = {
    origin(origin, callback) {
      if (!origin || env.corsAllowedOrigins.length === 0 || env.corsAllowedOrigins.includes(origin.toLowerCase())) callback(null, true);
      else callback(new Error("Not allowed by CORS"));
    },
  };
  app.use("/api", cors(corsOptions));

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => !req.url?.startsWith("/api") || req.url === "/api/healthz" },
      genReqId(req, res) {
        const inbound = req.headers["x-request-id"];
        const supplied = typeof inbound === "string" ? inbound.replace(/[^\w.-]/g, "").slice(0, 64) : "";
        const id = supplied || randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
      },
      customLogLevel(_req, res, err) {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      serializers: {
        req(req) {
          return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    }),
  );

  // Webhooks verify signatures over the raw body; they are registered before json().
  app.use("/api/webhooks", express.raw({ type: () => true, limit: "2mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(tenantResolver);
  // A path-based tenant (`/t/:slug`) sends its API calls as `/api/t/:slug/...`.
  // The resolver has already read the slug from originalUrl; strip it so the
  // ordinary routes match.
  app.use((req, _res, next) => {
    const m = req.url.match(/^\/api\/t\/[a-z0-9][a-z0-9-]*(\/.*|$)/i);
    if (m) req.url = `/api${m[1] && m[1] !== "/" ? m[1] : ""}`;
    next();
  });

  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth/forgot", authLimiter);
  app.use("/api/auth/reset", authLimiter);
  app.use("/api/auth/magic-link", authLimiter);

  app.use("/api", router);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    req.log?.error({ err }, "Unhandled error");
    if (res.headersSent) return;
    const status = typeof (err as { status?: number })?.status === "number" ? (err as { status: number }).status : 500;
    res.status(status).json({ error: status === 500 ? "Internal server error" : (err as Error).message, requestId: req.id ?? null });
  });

  return app;
}
