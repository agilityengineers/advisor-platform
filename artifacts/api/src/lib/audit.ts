import type { Request } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { logger } from "./logger";

export async function audit(req: Request, data: { action: string; resourceType: string; resourceId?: number | null; companyId?: number | null; details?: Record<string, unknown> }): Promise<void> {
  try {
    // While impersonating, the actor is the super admin at the keyboard; who they were acting as rides in details.
    const imp = req.impersonator;
    const details = imp && req.user
      ? { ...(data.details ?? {}), actingAs: { userId: req.user.userId, email: req.user.email, role: req.user.role }, impersonationSessionId: imp.sessionId }
      : (data.details ?? {});
    await db.insert(auditLogsTable).values({
      userId: imp?.userId ?? req.user?.userId ?? null,
      companyId: data.companyId ?? req.company?.id ?? req.user?.companyId ?? null,
      action: data.action,
      resourceType: data.resourceType,
      resourceId: data.resourceId ?? null,
      details,
      ipAddress: req.ip ?? null,
    });
  } catch (err) {
    logger.error({ err, action: data.action }, "Failed to write audit log");
  }
}
