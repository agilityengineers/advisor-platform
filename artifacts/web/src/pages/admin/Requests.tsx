import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { Button, PageTitle, Pill, Select, Spinner, Textarea } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { cn, initials } from "@/lib/utils";
import { OVERVIEW_KEY, useOverview } from "./AdminLayout";

type RequestStatus = "new" | "contacted" | "demo_booked" | "trial_started" | "converted" | "closed";

interface PlatformRequest {
  id: number;
  publicId: string;
  name: string;
  company: string;
  email: string;
  linkedin: string;
  intent: "demo" | "trial";
  status: RequestStatus;
  notes: string;
  convertedCompanyId: number | null;
  convertedCompany: { id: number; name: string; slug: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface RequestsResponse {
  requests: PlatformRequest[];
  counts: Record<RequestStatus, number>;
  statuses: RequestStatus[];
}

const STATUS_LABEL: Record<RequestStatus, string> = { new: "New", contacted: "Contacted", demo_booked: "Demo booked", trial_started: "Trial started", converted: "Converted", closed: "Closed" };
const STATUS_TONE: Record<RequestStatus, "blue" | "amber" | "green" | "grey" | "navy"> = { new: "blue", contacted: "amber", demo_booked: "amber", trial_started: "green", converted: "navy", closed: "grey" };
const KEY = ["admin", "platform-leads"];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** The platform's own pipeline: demo and trial requests from the Advisor Platform landing page. */
export function RequestsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const overview = useOverview();
  const q = useQuery<RequestsResponse>({ queryKey: KEY, queryFn: () => api("/admin/platform-leads") });
  const [filter, setFilter] = useState<RequestStatus | "all">("all");
  const [open, setOpen] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { status?: RequestStatus; notes?: string; convertedCompanyId?: number | null } }) => api<{ request: PlatformRequest }>(`/admin/platform-leads/${id}`, { method: "PATCH", json: patch }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
      toast("Request updated");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });

  if (!q.data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  const { requests, counts, statuses } = q.data;
  const list = filter === "all" ? requests : requests.filter((r) => r.status === filter);
  const companies = overview.data?.companies ?? [];

  return (
    <div>
      <PageTitle
        title="Requests"
        sub="Demo and trial requests from the Advisor Platform landing page. This is the platform's own pipeline — a company's leads live in that company's console."
        action={
          <a href="/#demo" target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm" className="h-10 px-3.5 text-[13px]">
              Landing form ↗
            </Button>
          </a>
        }
      />
      <div className="mt-[22px] flex flex-wrap gap-2">
        {(["all", ...statuses] as const).map((s) => {
          const n = s === "all" ? requests.length : counts[s];
          return (
            <button key={s} type="button" onClick={() => setFilter(s)} className={cn("rounded-pill border px-3.5 py-2 text-[13px] font-bold transition-colors", filter === s ? "border-blue bg-blue text-white" : "border-line bg-white text-body hover:border-blue")}>
              {s === "all" ? "All" : STATUS_LABEL[s]} <span className={cn("ml-1", filter === s ? "text-white/80" : "text-muted")}>{n}</span>
            </button>
          );
        })}
      </div>

      {list.length === 0 ? (
        <div className="mt-5 rounded-card border border-dashed border-line bg-white px-6 py-14 text-center">
          <div className="font-display text-[18px] font-bold text-navy">{requests.length === 0 ? "No requests yet" : "Nothing in this state"}</div>
          <p className="mx-auto mt-2 max-w-[460px] text-[14.5px] text-body">{requests.length === 0 ? "When someone books a demo or starts a trial from the landing page, it lands here with their name, practice, email and LinkedIn." : "Pick another filter to see the rest."}</p>
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-card border border-line bg-white">
          {list.map((r) => {
            const expanded = open === r.id;
            return (
              <div key={r.id} className="border-b border-line-soft last:border-b-0">
                <button type="button" onClick={() => setOpen(expanded ? null : r.id)} className="grid w-full grid-cols-[40px_minmax(0,1.4fr)_minmax(0,1fr)_120px_130px_110px] items-center gap-4 px-5 py-4 text-left hover:bg-page max-md:grid-cols-[40px_minmax(0,1fr)_110px]" aria-expanded={expanded}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pale text-[13px] font-bold text-blue-hover">{initials(r.name)}</div>
                  <div className="min-w-0">
                    <div className="truncate text-[14.5px] font-bold text-navy">{r.name}</div>
                    <div className="truncate text-[12.5px] font-semibold text-muted">{r.company}</div>
                  </div>
                  <div className="min-w-0 max-md:hidden">
                    <div className="truncate text-[13.5px] font-semibold text-body">{r.email}</div>
                    {r.linkedin && <div className="truncate text-[12px] font-semibold text-muted">{r.linkedin}</div>}
                  </div>
                  <div className="max-md:hidden">
                    <Pill tone={r.intent === "trial" ? "green" : "navy"}>{r.intent === "trial" ? "14-day trial" : "Demo"}</Pill>
                  </div>
                  <div>
                    <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill>
                  </div>
                  <div className="text-right text-[12.5px] font-semibold text-muted max-md:hidden">{fmtDate(r.createdAt)}</div>
                </button>
                {expanded && (
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 border-t border-line-soft bg-page px-5 py-5 max-md:grid-cols-1">
                    <div className="flex flex-col gap-3">
                      <div className="text-[11.5px] font-bold tracking-[0.1em] text-muted">DETAILS</div>
                      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13.5px]">
                        <dt className="font-semibold text-muted">Email</dt>
                        <dd className="break-all font-semibold text-navy">
                          <a href={`mailto:${r.email}`} className="text-blue-hover">
                            {r.email}
                          </a>
                        </dd>
                        <dt className="font-semibold text-muted">LinkedIn</dt>
                        <dd className="break-all font-semibold text-navy">
                          {r.linkedin ? (
                            <a href={`https://${r.linkedin}`} target="_blank" rel="noopener noreferrer" className="text-blue-hover">
                              {r.linkedin}
                            </a>
                          ) : (
                            "—"
                          )}
                        </dd>
                        <dt className="font-semibold text-muted">Requested</dt>
                        <dd className="font-semibold text-navy">
                          {r.intent === "trial" ? "Start a 14-day trial" : "Book a demo"} · {fmtDate(r.createdAt)}
                        </dd>
                        <dt className="font-semibold text-muted">Reference</dt>
                        <dd className="font-mono text-[12.5px] text-body">{r.publicId}</dd>
                      </dl>
                      <div className="mt-2 flex flex-col gap-1.5">
                        <label htmlFor={`status-${r.id}`} className="text-[12.5px] font-bold text-navy">
                          Status
                        </label>
                        <Select id={`status-${r.id}`} value={r.status} onChange={(e) => update.mutate({ id: r.id, patch: { status: e.target.value as RequestStatus } })}>
                          {statuses.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor={`company-${r.id}`} className="text-[12.5px] font-bold text-navy">
                          Became company
                        </label>
                        <Select id={`company-${r.id}`} value={r.convertedCompanyId ?? ""} onChange={(e) => update.mutate({ id: r.id, patch: { convertedCompanyId: e.target.value ? Number(e.target.value) : null } })}>
                          <option value="">Not yet</option>
                          {companies.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} · {c.slug}
                            </option>
                          ))}
                        </Select>
                        <div className="text-[12px] font-semibold text-muted">Create the company under Companies first; linking it here marks the request converted.</div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="text-[11.5px] font-bold tracking-[0.1em] text-muted">NOTES</div>
                      <Textarea rows={7} value={notes[r.id] ?? r.notes} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} placeholder="What was discussed, what they need, when to follow up…" />
                      <div className="flex justify-end">
                        <Button size="sm" disabled={(notes[r.id] ?? r.notes) === r.notes || update.isPending} onClick={() => update.mutate({ id: r.id, patch: { notes: notes[r.id] ?? r.notes } })}>
                          Save notes
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
