import { useQuery, useQueryClient } from "@tanstack/react-query";
import { hasPermission, type PermissionArea, type PermissionLevel, type FeatureKey } from "@workspace/shared";
import { api } from "@/lib/api";
import type { Summary } from "./types";

export const summaryKey = (companyId: number) => ["company", companyId, "summary"];

export function useSummary(companyId: number) {
  return useQuery<Summary>({ queryKey: summaryKey(companyId), queryFn: () => api(`/companies/${companyId}/summary`), staleTime: 30_000 });
}

/** What the signed-in person may do in this console, from the summary's viewer block. */
export function viewerCan(summary: Summary | undefined) {
  const viewer = summary?.viewer;
  const can = (area: PermissionArea, level: Exclude<PermissionLevel, "none"> = "read") => (viewer ? hasPermission({ role: viewer.role, perms: viewer.perms }, area, level) : false);
  const isOwner = viewer ? viewer.role === "admin" || viewer.role === "super_admin" : false;
  const has = (key: FeatureKey) => Boolean(summary?.features[key]?.enabled);
  return { can, isOwner, has, isSuper: Boolean(viewer?.isSuperAdmin), role: viewer?.role ?? null };
}

export function useInvalidateCompany(companyId: number) {
  const qc = useQueryClient();
  return (...keys: string[]) => {
    void qc.invalidateQueries({ queryKey: summaryKey(companyId) });
    for (const k of keys) void qc.invalidateQueries({ queryKey: ["company", companyId, k] });
  };
}
