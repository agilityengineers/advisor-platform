import type { Request } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { logger } from "./logger";

export async function audit(req: Request, data: { action: string; resourceType: string; resourceId?: number | null; companyId?: number | null; details?: Record<string, unknown> }): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      userId: req.user?.userId ?? null,
      companyId: data.companyId ?? req.company?.id ?? req.user?.companyId ?? null,
      action: data.action,
      resourceType: data.resourceType,
      resourceId: data.resourceId ?? null,
      details: data.details ?? {},
      ipAddress: req.ip ?? null,
    });
  } catch (err) {
    logger.error({ err, action: data.action }, "Failed to write audit log");
  }
}
