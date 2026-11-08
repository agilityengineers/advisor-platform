import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

function userOrIp(req: Request): string {
  if (req.user?.userId) return `u:${req.user.userId}`;
  return ipKeyGenerator(req.ip ?? "");
}

/** Credential endpoints: blunt brute-force and credential stuffing. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later." },
});

/** Public forms (landing form, grader, demo request): one person, not a script. */
export const publicFormLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIp,
  message: { error: "Too many submissions from this connection. Please try again in a few minutes." },
});

/** Signed-in write endpoints that email people (invites, test sends). */
export const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIp,
  message: { error: "Too many invitations in one hour." },
});
