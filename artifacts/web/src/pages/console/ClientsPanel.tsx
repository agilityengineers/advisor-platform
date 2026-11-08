import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cents } from "@workspace/shared";
import { api } from "@/lib/api";
import { cn, initials } from "@/lib/utils";
import { Spinner } from "@/components/ui";
import { fmtDay } from "./types";

export interface ClientRow {
  id: number;
  publicId: string;
  name: string;
  email: string;
  phone: string;
  linkedin: string;
  leadId: number | null;
  createdAt: string;
  offerName: string | null;
  orderStatus: string | null;
  paidCents: number;
  outstandingCents: number;
  failedInstallments: number;
  progress: { done: number; total: number; pct: number };
  currentStage: { key: string; label: string } | null;
  intakeDone: boolean;
  bookedAt: string | null;
  lastLoginAt: string | null;
  hasPortalLogin: boolean;
}

export interface ClientsResponse {
  clients: ClientRow[];
  checkoutMode: "live" | "demo" | "off";
}

export const clientsKey = (companyId: number) => ["company", companyId, "clients"];

/** Paying clients and where each one is in the seven-stage tracker (Buying Flow → portal, seen from the firm's side). */
export function ClientsPanel({ companyId, query, publicUrl, onOpen }: { companyId: number; query: string; publicUrl: string; onOpen: (id: number) => void }) {
  const q = useQuery<ClientsResponse>({ queryKey: clientsKey(companyId), queryFn: () => api(`/companies/${companyId}/clients`), refetchInterval: 60_000 });
  const [filter, setFilter] = useState<"all" | "attention" | "active" | "done">("all");
  const rows = useMemo(() => {
    const list = q.data?.clients ?? [];
    const needle = query.trim().toLowerCase();
    return list
      .filter((c) => !needle || `${c.name} ${c.email} ${c.offerName ?? ""}`.toLowerCase().includes(needle))
      .filter((c) => (filter === "all" ? true : filter === "attention" ? c.failedInstallments > 0 || !c.intakeDone || !c.bookedAt : filter === "done" ? c.progress.done === c.progress.total : c.progress.done < c.progress.total));
  }, [q.data, query, filter]);

  return (
    <div id="clients" className="overflow-hidden rounded-[18px] border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-[22px] py-4">
        <div>
          <div className="text-[12px] font-bold tracking-[0.1em] text-blue-hover">CLIENTS</div>
          <h2 className="mt-1 font-display text-[19px] font-bold text-navy">Engagements in progress</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "attention", "active", "done"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={cn("rounded-pill border px-3 py-1.5 text-[12.5px] font-bold", filter === f ? "border-blue bg-blue text-white" : "border-line bg-white text-body")}>
              {f === "all" ? "All" : f === "attention" ? "Needs attention" : f === "active" ? "In progress" : "Complete"}
            </button>
          ))}
          {q.data?.checkoutMode === "demo" && <span className="rounded-pill border border-[#F6E4CC] bg-[#FFF8F0] px-[9px] py-1 text-[11px] font-bold text-warn-deep">DEMO CHECKOUT</span>}
        </div>
      </div>
      {!q.data ? (
        <div className="flex justify-center py-14">
          <Spinner />
        </div>
      ) : q.data.clients.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <div className="font-display text-[18px] font-bold text-navy">No clients yet</div>
          <div className="mx-auto mt-2 max-w-[520px] text-[14px] text-body">
            A client appears here the moment an order is paid on your pricing page at{" "}
            <a href={`${publicUrl}/pricing`} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-hover">
              {publicUrl.replace(/^https?:\/\//, "")}/pricing
            </a>
            — with their portal, tracker and intake ready to go.
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="px-6 py-10 text-center text-[14px] font-semibold text-muted">Nothing matches this filter.</div>
      ) : (
        <div>
          {rows.map((c) => (
            <button key={c.id} type="button" onClick={() => onOpen(c.id)} className="grid w-full grid-cols-[40px_minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_120px] items-center gap-4 border-b border-line-soft px-[22px] py-3.5 text-left last:border-b-0 hover:bg-page max-md:grid-cols-[40px_minmax(0,1fr)_120px]">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pale text-[13px] font-bold text-blue-hover">{initials(c.name)}</div>
              <div className="min-w-0">
                <div className="truncate text-[14.5px] font-bold text-navy">{c.name}</div>
                <div className="truncate text-[12.5px] font-semibold text-muted">
                  {c.offerName ?? "—"} · since {fmtDay(c.createdAt)}
                </div>
              </div>
              <div className="min-w-0 max-md:hidden">
                <div className="flex items-center gap-2 text-[12.5px] font-bold text-navy">
                  <span className="truncate">{c.currentStage?.label ?? "Complete"}</span>
                  <span className="text-muted">
                    {c.progress.done}/{c.progress.total}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-[#EEF4FC]">
                  <div className="h-full rounded-pill bg-blue" style={{ width: `${c.progress.pct}%` }} />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 max-md:hidden">
                <span className={cn("rounded-pill px-2 py-[3px] text-[11px] font-bold", c.intakeDone ? "bg-[#EDF7F1] text-success-deep" : "bg-[#FFF8F0] text-warn-deep")}>{c.intakeDone ? "Intake ✓" : "Intake due"}</span>
                <span className={cn("rounded-pill px-2 py-[3px] text-[11px] font-bold", c.bookedAt ? "bg-[#EDF7F1] text-success-deep" : "bg-[#F1F4F8] text-muted")}>{c.bookedAt ? "Booked" : "Not booked"}</span>
                {c.failedInstallments > 0 && <span className="rounded-pill bg-[#FDECE9] px-2 py-[3px] text-[11px] font-bold text-danger">Payment failed</span>}
              </div>
              <div className="text-right">
                <div className="font-display text-[14.5px] font-bold text-navy">{cents(c.paidCents)}</div>
                {c.outstandingCents > 0 && <div className="text-[11.5px] font-bold text-warn-deep">{cents(c.outstandingCents)} due</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
