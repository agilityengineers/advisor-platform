import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, PageTitle, Pill, Select, Spinner } from "@/components/ui";
import { cn, initials } from "@/lib/utils";
import { useOverview } from "./AdminLayout";

interface AuditEntry {
  id: number;
  action: string;
  resourceType: string;
  resourceId: number | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: number; name: string; email: string } | null;
  company: { id: number; name: string } | null;
}
interface AuditResponse {
  entries: AuditEntry[];
  hasMore: boolean;
  nextBefore: string | null;
  actions: string[];
}

const TONE = (action: string): "red" | "amber" | "navy" | "green" | "blue" | "grey" => (/suspend|delete|revoke|cancel|refund/.test(action) ? "red" : /override|impersonation|unlock/.test(action) ? "amber" : /created|published|connected|paid|registered/.test(action) ? "green" : /updated|changed|applied|rescored|run|sent/.test(action) ? "blue" : "grey");
const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
const label = (action: string) => action.replace(/_/g, " ");
/** Changes made while impersonating carry who the super admin was signed in as. */
const actingAs = (e: AuditEntry): string | null => {
  const a = e.details.actingAs as { email?: string; role?: string } | undefined;
  return a?.email ? `${a.email}${a.role ? ` (${a.role})` : ""}` : null;
};

/** Who did what, where, when — every super-admin and staff action that changes a company. */
export function AuditPage() {
  const overview = useOverview();
  const [companyId, setCompanyId] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [before, setBefore] = useState<string | null>(null);
  const [pages, setPages] = useState<AuditEntry[][]>([]);
  const params = new URLSearchParams({ limit: "50" });
  if (companyId) params.set("companyId", companyId);
  if (action) params.set("action", action);
  if (before) params.set("before", before);
  const q = useQuery<AuditResponse>({ queryKey: ["admin", "audit", companyId, action, before], queryFn: () => api(`/admin/audit?${params.toString()}`), staleTime: 15_000 });
  const entries = [...pages.flat(), ...(q.data?.entries ?? [])];
  const reset = () => {
    setPages([]);
    setBefore(null);
  };
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div>
      <PageTitle title="Audit log" sub="Every action that changes a company — plan and status changes, feature overrides, the super admin stepping into a console or impersonating a user (and everything done while impersonating), template and rubric changes, payments, grades. Append-only; rows outlive the people and companies they describe." />
      <div className="mt-[22px] flex flex-wrap items-center gap-2.5">
        <Select className="h-10 w-[240px] text-[13px]" value={companyId} onChange={(e) => { setCompanyId(e.target.value); reset(); }} aria-label="Company">
          <option value="">All companies</option>
          {(overview.data?.companies ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select className="h-10 w-[260px] text-[13px]" value={action} onChange={(e) => { setAction(e.target.value); reset(); }} aria-label="Action">
          <option value="">All actions</option>
          {(q.data?.actions ?? []).map((a) => (
            <option key={a} value={a}>
              {label(a)}
            </option>
          ))}
        </Select>
        {(companyId || action) && (
          <Button size="sm" variant="ghost" onClick={() => { setCompanyId(""); setAction(""); reset(); }}>
            Clear filters
          </Button>
        )}
      </div>
      <div className="mt-4 overflow-hidden rounded-card border border-line bg-white">
        {!q.data && entries.length === 0 ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : entries.length === 0 ? (
          <div className="px-6 py-14 text-center text-[14.5px] font-semibold text-muted">Nothing recorded yet for this filter.</div>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="border-b border-line-soft last:border-b-0">
              <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="grid w-full grid-cols-[150px_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-4 px-5 py-3 text-left hover:bg-page max-md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="text-[12.5px] font-semibold text-muted">{fmt(e.createdAt)}</div>
                <div>
                  <Pill tone={TONE(e.action)}>{label(e.action)}</Pill>
                </div>
                <div className="min-w-0 max-md:hidden">
                  <div className="truncate text-[13.5px] font-bold text-navy">{e.company?.name ?? "Platform"}</div>
                  <div className="truncate text-[12px] font-semibold text-muted">
                    {e.resourceType}
                    {e.resourceId ? ` #${e.resourceId}` : ""}
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-2 max-md:hidden">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pale text-[11px] font-bold text-blue-hover">{initials(e.actor?.name ?? "—")}</div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-bold text-navy">{e.actor?.name ?? "System"}</div>
                    {actingAs(e) ? (
                      <div className="truncate text-[11.5px] font-bold text-warn-deep">acting as {actingAs(e)}</div>
                    ) : (
                      <div className="truncate text-[11.5px] font-semibold text-muted">{e.actor?.email ?? e.ipAddress ?? ""}</div>
                    )}
                  </div>
                </div>
              </button>
              {open === e.id && (
                <pre className={cn("overflow-x-auto border-t border-line-soft bg-page px-5 py-3 text-[12px] leading-relaxed text-body")}>{JSON.stringify({ ...e.details, ip: e.ipAddress }, null, 2)}</pre>
              )}
            </div>
          ))
        )}
      </div>
      {q.data?.hasMore && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            onClick={() => {
              setPages((p) => [...p, q.data!.entries]);
              setBefore(q.data!.nextBefore);
            }}
          >
            Load older entries
          </Button>
        </div>
      )}
    </div>
  );
}
