import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { and, eq } from "drizzle-orm";
import { db, usersTable, companiesTable, type User, type Company } from "@workspace/db";
import { hasPermission, type PermissionArea, type PermissionLevel, type Role } from "@workspace/shared";
import { env } from "../env";
import { logger } from "./logger";

export interface AuthPayload {
  userId: number;
  email: string;
  role: Role;
  companyId: number | null;
}

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      /** The full user row, loaded by authMiddleware (carries perms). */
      currentUser?: User;
      /** The company a /api/companies/:companyId/* route is scoped to. */
      company?: Company;
    }
  }
}

export function signToken(payload: AuthPayload): { token: string; expiresIn: number } {
  return { token: jwt.sign(payload, env.sessionSecret, { expiresIn: TOKEN_TTL_SECONDS }), expiresIn: TOKEN_TTL_SECONDS };
}

export function verifyToken(token: string): AuthPayload {
  const decoded = jwt.verify(token, env.sessionSecret) as jwt.JwtPayload & Partial<AuthPayload>;
  if (typeof decoded.userId !== "number" || typeof decoded.role !== "string") throw new Error("Malformed token");
  return { userId: decoded.userId, email: String(decoded.email ?? ""), role: decoded.role as Role, companyId: decoded.companyId ?? null };
}

export const DEACTIVATED_USER_ERROR = "Your account has been deactivated. Please contact your administrator.";
export const SUSPENDED_COMPANY_ERROR = "This company's account is suspended. Please contact Advisor Platform support.";

export type Standing =
  | { ok: true; user: User; company: Company | null }
  | { ok: false; status: 401 | 403; error: string };

/** Re-checked on every protected request so a deactivation takes effect immediately, not when the JWT expires. */
export async function checkStanding(userId: number): Promise<Standing> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return { ok: false, status: 401, error: "Invalid or expired token" };
  if (user.deactivatedAt) return { ok: false, status: 403, error: DEACTIVATED_USER_ERROR };
  let company: Company | null = null;
  if (user.companyId) {
    const [c] = await db.select().from(companiesTable).where(eq(companiesTable.id, user.companyId)).limit(1);
    company = c ?? null;
    if (company?.status === "suspended" && user.role !== "super_admin") return { ok: false, status: 403, error: SUSPENDED_COMPANY_ERROR };
  }
  return { ok: true, user, company };
}

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = bearer(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  let payload: AuthPayload;
  try {
    payload = verifyToken(token);
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  let standing: Standing;
  try {
    standing = await checkStanding(payload.userId);
  } catch (err) {
    logger.error({ err, userId: payload.userId }, "Standing check failed");
    res.status(503).json({ error: "Authorization check unavailable. Please try again." });
    return;
  }
  if (!standing.ok) {
    res.status(standing.status).json({ error: standing.error });
    return;
  }
  // Keep the request identity in sync with the database (role/company changes apply now, not in 7 days).
  req.user = { userId: standing.user.id, email: standing.user.email, role: standing.user.role, companyId: standing.user.companyId };
  req.currentUser = standing.user;
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = bearer(req);
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      /* anonymous */
    }
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

export const requireSuperAdmin = requireRole("super_admin");

/**
 * Scope a route to /api/companies/:companyId. Super admins may enter any
 * company; everyone else only their own. Loads req.company.
 */
export async function requireCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const companyId = Number(req.params.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) {
    res.status(400).json({ error: "Invalid company id" });
    return;
  }
  if (user.role !== "super_admin" && user.companyId !== companyId) {
    res.status(403).json({ error: "Access denied to this company" });
    return;
  }
  if (user.role === "client") {
    res.status(403).json({ error: "Clients cannot access the company console" });
    return;
  }
  const [company] = await db.select().from(companiesTable).where(and(eq(companiesTable.id, companyId))).limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  req.company = company;
  next();
}

/** Granular team permission. Admins and super admins pass; managers/advisors need the grid. */
export function requirePermission(area: PermissionArea, level: Exclude<PermissionLevel, "none"> = "read") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.currentUser;
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!hasPermission({ role: user.role, perms: user.perms }, area, level)) {
      res.status(403).json({ error: `You need ${level} access to ${area}`, area, level });
      return;
    }
    next();
  };
}

export function clientIp(req: Request): string | null {
  return req.ip ?? null;
}
