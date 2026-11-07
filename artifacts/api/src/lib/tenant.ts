import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, companiesTable, customDomainsTable, type Company } from "@workspace/db";
import { env } from "../env";

export type TenantResolution =
  | { kind: "platform"; host: string }
  | { kind: "company"; host: string; company: Company; via: "custom_domain" | "subdomain" | "path" | "header" };

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantResolution;
    }
  }
}

const CACHE_TTL_MS = 60_000;
const MAX_CACHE = 500;
const byDomain = new Map<string, { company: Company | null; expires: number }>();
const bySlug = new Map<string, { company: Company | null; expires: number }>();

function boundedSet<V>(map: Map<string, V>, key: string, value: V): void {
  if (map.size >= MAX_CACHE && !map.has(key)) {
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }
  map.set(key, value);
}

export function invalidateTenantCache(opts: { domain?: string; slug?: string } = {}): void {
  if (opts.domain) byDomain.delete(opts.domain.toLowerCase());
  if (opts.slug) bySlug.delete(opts.slug.toLowerCase());
  if (!opts.domain && !opts.slug) {
    byDomain.clear();
    bySlug.clear();
  }
}

export async function resolveByDomain(hostname: string): Promise<Company | null> {
  const cached = byDomain.get(hostname);
  if (cached && cached.expires > Date.now()) return cached.company;
  const [row] = await db
    .select({ company: companiesTable })
    .from(customDomainsTable)
    .innerJoin(companiesTable, eq(companiesTable.id, customDomainsTable.companyId))
    .where(and(eq(customDomainsTable.domain, hostname), eq(customDomainsTable.active, true), eq(customDomainsTable.verified, true)))
    .limit(1);
  const company = row?.company ?? null;
  boundedSet(byDomain, hostname, { company, expires: Date.now() + CACHE_TTL_MS });
  return company;
}

export async function resolveBySlug(slug: string): Promise<Company | null> {
  const key = slug.toLowerCase();
  const cached = bySlug.get(key);
  if (cached && cached.expires > Date.now()) return cached.company;
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.slug, key)).limit(1);
  boundedSet(bySlug, key, { company: company ?? null, expires: Date.now() + CACHE_TTL_MS });
  return company ?? null;
}

const RESERVED_SUBDOMAINS = new Set(["www", "api", "app", "admin", "mail", "static"]);

/** `<slug>.<base>` → slug, for the configured subdomain base only. */
export function extractSubdomain(hostname: string, base: string = env.platformSubdomainBase): string | null {
  const h = hostname.toLowerCase();
  if (!h.endsWith(`.${base}`)) return null;
  const rest = h.slice(0, -(base.length + 1));
  if (!rest || rest.includes(".")) return null;
  if (RESERVED_SUBDOMAINS.has(rest)) return null;
  return rest;
}

/** `/t/:slug/...` or `/api/t/:slug/...` → slug. */
export function extractPathSlug(url: string): string | null {
  const match = url.match(/^\/(?:api\/)?t\/([a-z0-9][a-z0-9-]*)(?:[/?#]|$)/i);
  return match ? match[1].toLowerCase() : null;
}

export function isPlatformHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (env.platformHosts.includes(h)) return true;
  if (h === "localhost" || h === "127.0.0.1" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".replit.dev") || h.endsWith(".replit.app") || h.endsWith(".repl.co")) return true;
  return false;
}

export function hostnameOf(req: Request): string {
  const forwarded = req.headers["x-forwarded-host"];
  const raw = (typeof forwarded === "string" && forwarded.split(",")[0]) || req.headers.host || "";
  return raw.split(":")[0].trim().toLowerCase();
}

/**
 * Resolve the tenant for this request, in order:
 * exact verified+active custom domain → `<slug>.<subdomain base>` → `/t/:slug` path
 * → platform. Anything unknown is treated as the platform (so the Replit preview
 * URL works); a pending custom domain shows the platform until it is verified.
 */
export async function tenantResolver(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const host = hostnameOf(req);
  try {
    if (host && !isPlatformHost(host)) {
      const byCustom = await resolveByDomain(host);
      if (byCustom) {
        req.tenant = { kind: "company", host, company: byCustom, via: "custom_domain" };
        next();
        return;
      }
      const sub = extractSubdomain(host);
      if (sub) {
        const c = await resolveBySlug(sub);
        if (c) {
          req.tenant = { kind: "company", host, company: c, via: "subdomain" };
          next();
          return;
        }
      }
    }
    const pathSlug = extractPathSlug(req.originalUrl || req.url);
    if (pathSlug) {
      const c = await resolveBySlug(pathSlug);
      if (c) {
        req.tenant = { kind: "company", host, company: c, via: "path" };
        next();
        return;
      }
    }
    // Development convenience: force a tenant without DNS.
    const forced = req.headers["x-tenant-slug"];
    if (!env.isProduction && typeof forced === "string" && forced) {
      const c = await resolveBySlug(forced);
      if (c) {
        req.tenant = { kind: "company", host, company: c, via: "header" };
        next();
        return;
      }
    }
    req.tenant = { kind: "platform", host };
    next();
  } catch (err) {
    req.log?.error({ err, host }, "Tenant resolution failed; falling back to platform");
    req.tenant = { kind: "platform", host };
    next();
  }
}
