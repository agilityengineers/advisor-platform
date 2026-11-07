import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cents } from "@workspace/shared";
import { api, errorMessage } from "@/lib/api";
import { initials } from "@/lib/utils";
import { Button, Drawer, Input, Select, Spinner } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { fmtDay, fmtWhen } from "./types";
import { clientsKey } from "./ClientsPanel";

interface Stage {
  id: number;
  key: string;
  label: string;
  status: "pending" | "current" | "done" | "scheduled";
  meta: string;
  note: string;
}
interface Installment {
  id: number;
  seq: number;
  amountCents: number;
  dueAt: string | null;
  status: string;
  paidAt: string | null;
  attempts: number;
  lastError: string | null;
}
interface ClientDetail {
  client: { id: number; name: string; email: string; phone: string; linkedin: string; leadId: number | null; createdAt: string };
  stages: Stage[];
  progress: { done: number; total: number; pct: number };
  files: { id: number; name: string; url: string; stageKey: string; createdAt: string }[];
  orders: { id: number; publicId: string; offerName: string; status: string; plan: string; installmentsCount: number; amountCents: number; bumps: { label: string; amountCents: number }[]; paidAt: string | null; refundedAt: string | null; installments: Installment[] }[];
  bookings: { id: number; startAt: string | null; status: string; confirmed: boolean }[];
  intake: { completedAt: string | null; data: Record<string, unknown> } | null;
  login: { id: number; email: string; lastLoginAt: string | null } | null;
  links: { book: string; intake: string; portal: string; calendly: string | null } | null;
  checkoutMode: "live" | "demo" | "off";
}

const STATUS_LABEL = { pending: "Pending", current: "Current", scheduled: "Scheduled", done: "Done" } as const;

export function ClientDrawer({ companyId, clientId, canWrite, canBilling, onClose, onOpenLead }: { companyId: number; clientId: number; canWrite: boolean; canBilling: boolean; onClose: () => void; onOpenLead: (leadId: number) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = ["company", companyId, "client", clientId];
  const q = useQuery<ClientDetail>({ queryKey: key, queryFn: () => api(`/companies/${companyId}/clients/${clientId}`) });
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [file, setFile] = useState({ name: "", url: "", stageKey: "", notify: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: clientsKey(companyId) });
  };
  const setStage = useMutation({
    mutationFn: ({ stageId, status, note }: { stageId: number; status: Stage["status"]; note?: string }) => api<{ notified: boolean }>(`/companies/${companyId}/clients/${clientId}/stages/${stageId}`, { method: "PATCH", json: { status, note, notify: true } }),
    onSuccess: (r, v) => {
      refresh();
      toast(v.status === "done" ? (r.notified ? "Stage completed · client emailed" : "Stage completed") : "Stage updated");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const addFile = useMutation({
    mutationFn: () => api(`/companies/${companyId}/clients/${clientId}/files`, { method: "POST", json: file }),
    onSuccess: () => {
      setFile({ name: "", url: "", stageKey: "", notify: false });
      refresh();
      toast("File added");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const removeFile = useMutation({ mutationFn: (fileId: number) => api(`/companies/${companyId}/clients/${clientId}/files/${fileId}`, { method: "DELETE" }), onSuccess: refresh });
  const portalLink = useMutation({
    mutationFn: () => api<{ sent: boolean; devLink: string | null }>(`/companies/${companyId}/clients/${clientId}/portal-link`, { method: "POST" }),
    onSuccess: (r) => toast(r.sent ? "Portal link emailed" : r.devLink ? "Email isn't configured — link logged to the server console" : "Link created but email isn't configured", r.sent ? "success" : "info"),
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const settle = useMutation({
    mutationFn: ({ orderId, installmentId, action }: { orderId: number; installmentId: number; action: "charge" | "mark_paid" | "cancel" }) => api(`/companies/${companyId}/orders/${orderId}/installments/${installmentId}`, { method: "POST", json: { action } }),
    onSuccess: (_r, v) => {
      refresh();
      toast(v.action === "cancel" ? "Installment canceled" : "Installment settled");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });

  const d = q.data;
  return (
    <Drawer onClose={onClose} label="Client detail" width={520}>
      {!d ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-5 p-6">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pale font-display text-[15px] font-bold text-blue-hover">{initials(d.client.name)}</div>
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] font-bold tracking-[0.1em] text-muted-2">CLIENT · SINCE {fmtDay(d.client.createdAt).toUpperCase()}</div>
              <h2 className="mt-1 font-display text-[20px] font-bold tracking-[-0.02em] text-navy">{d.client.name}</h2>
              <div className="mt-1 break-all text-[13px] font-semibold text-body">
                <a href={`mailto:${d.client.email}`} className="text-blue-hover">
                  {d.client.email}
                </a>
                {d.client.phone && (
                  <>
                    {" · "}
                    <a href={`tel:${d.client.phone.replace(/[^0-9+]/g, "")}`} className="text-blue-hover">
                      {d.client.phone}
                    </a>
                  </>
                )}
              </div>
              {d.client.linkedin && (
                <a href={`https://${d.client.linkedin.replace(/^https?:\/\//, "")}`} target="_blank" rel="noopener noreferrer" className="mt-0.5 block break-all text-[12.5px] font-semibold text-muted hover:text-blue-hover">
                  {d.client.linkedin}
                </a>
              )}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-line bg-page text-[15px] font-bold text-body-2 hover:bg-pale">
              ×
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {d.client.leadId && (
              <Button size="sm" variant="secondary" onClick={() => onOpenLead(d.client.leadId!)}>
                Open lead
              </Button>
            )}
            {canWrite && (
              <Button size="sm" variant="secondary" loading={portalLink.isPending} onClick={() => portalLink.mutate()}>
                Send portal link
              </Button>
            )}
            {d.links?.intake && (
              <a href={d.links.intake} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-pill border border-line bg-white px-3.5 text-[13px] font-bold text-navy hover:border-blue hover:text-blue">
                Intake link ↗
              </a>
            )}
            {d.login?.lastLoginAt && <span className="self-center text-[12px] font-semibold text-muted">Last portal visit {fmtWhen(d.login.lastLoginAt)}</span>}
          </div>

          <section className="rounded-card border border-line-soft bg-[#F7FBFF] p-4">
            <div className="flex items-center justify-between">
              <div className="text-[11.5px] font-bold tracking-[0.1em] text-muted-2">TRACKER</div>
              <div className="text-[12px] font-bold text-blue-hover">
                {d.progress.done} of {d.progress.total}
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-[#E4EDF9]">
              <div className="h-full rounded-pill bg-blue" style={{ width: `${d.progress.pct}%` }} />
            </div>
            <div className="mt-3 flex flex-col divide-y divide-line-soft">
              {d.stages.map((s) => (
                <div key={s.id} className="flex flex-col gap-2 py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-navy">{s.label}</div>
                      <div className="text-[12.5px] font-semibold text-muted">{s.meta}</div>
                    </div>
                    {canWrite ? (
                      <Select className="h-9 w-[128px] text-[12.5px]" value={s.status} onChange={(e) => setStage.mutate({ stageId: s.id, status: e.target.value as Stage["status"], note: notes[s.id] })}>
                        {(Object.keys(STATUS_LABEL) as Stage["status"][]).map((k) => (
                          <option key={k} value={k}>
                            {STATUS_LABEL[k]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="rounded-pill bg-white px-2 py-1 text-[11.5px] font-bold text-body">{STATUS_LABEL[s.status]}</span>
                    )}
                  </div>
                  {canWrite && s.status !== "done" && (
                    <Input className="h-9 bg-white text-[12.5px]" placeholder="Note shown to the client with this stage (optional)" value={notes[s.id] ?? s.note} onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })} onBlur={() => (notes[s.id] ?? s.note) !== s.note && setStage.mutate({ stageId: s.id, status: s.status, note: notes[s.id] ?? "" })} />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11.5px] font-semibold text-muted">Marking a stage Done emails the client (and moves the next stage to Current).</div>
          </section>

          <section className="rounded-card border border-line-soft bg-white p-4">
            <div className="text-[11.5px] font-bold tracking-[0.1em] text-muted-2">PAYMENTS</div>
            {d.orders.length === 0 && <div className="mt-2 text-[13px] font-semibold text-muted">No orders.</div>}
            {d.orders.map((o) => (
              <div key={o.id} className="mt-3 rounded-[12px] border border-line-soft bg-[#F7FBFF] p-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-[14px] font-bold text-navy">
                    {o.offerName} <span className="text-[12px] font-semibold text-muted">· {o.publicId.toUpperCase()}</span>
                  </div>
                  <div className="font-display text-[15px] font-bold text-navy">{cents(o.amountCents)}</div>
                </div>
                <div className="mt-0.5 text-[12.5px] font-semibold text-muted">
                  {o.status === "paid" ? `Paid ${fmtDay(o.paidAt)}` : o.status === "refunded" ? `Refunded ${fmtDay(o.refundedAt)}` : o.status} · {o.plan === "split" ? `${o.installmentsCount} payments` : "paid in full"}
                  {o.bumps.length > 0 && ` · ${o.bumps.map((b) => b.label).join(", ")}`}
                </div>
                {o.installments.map((i) => (
                  <div key={i.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-2 text-[12.5px]">
                    <div className="font-bold text-body">
                      Payment {i.seq} of {o.installmentsCount} · {cents(i.amountCents)}
                      <span className={`ml-2 font-bold ${i.status === "paid" ? "text-success-deep" : i.status === "failed" ? "text-danger" : i.status === "canceled" ? "text-muted" : "text-warn-deep"}`}>{i.status === "paid" ? `paid ${fmtDay(i.paidAt)}` : i.status === "failed" ? `failed${i.lastError ? ` · ${i.lastError}` : ""}` : i.status === "canceled" ? "canceled" : `due ${fmtDay(i.dueAt)}`}</span>
                    </div>
                    {canBilling && i.status !== "paid" && i.status !== "canceled" && (
                      <div className="flex gap-1.5">
                        {d.checkoutMode === "live" && (
                          <Button size="sm" className="h-8 px-3 text-[12px]" loading={settle.isPending} onClick={() => settle.mutate({ orderId: o.id, installmentId: i.id, action: "charge" })}>
                            Charge card
                          </Button>
                        )}
                        <Button size="sm" variant="secondary" className="h-8 px-3 text-[12px]" loading={settle.isPending} onClick={() => window.confirm("Record this installment as paid outside Stripe?") && settle.mutate({ orderId: o.id, installmentId: i.id, action: "mark_paid" })}>
                          Mark paid
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 px-3 text-[12px] text-danger" onClick={() => window.confirm("Cancel this installment?") && settle.mutate({ orderId: o.id, installmentId: i.id, action: "cancel" })}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </section>

          <section className="rounded-card border border-line-soft bg-white p-4">
            <div className="text-[11.5px] font-bold tracking-[0.1em] text-muted-2">INTAKE{d.intake?.completedAt ? ` · ${fmtWhen(d.intake.completedAt).toUpperCase()}` : ""}</div>
            {d.intake?.completedAt ? (
              <dl className="mt-2 grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
                {(["linkedin", "knownFor", "audience", "access", "phone"] as const).map((k) => (
                  <div key={k} className="contents">
                    <dt className="font-semibold text-muted">{{ linkedin: "LinkedIn", knownFor: "Known for", audience: "Audience", access: "Publish", phone: "Phone" }[k]}</dt>
                    <dd className="break-words font-semibold text-navy">{k === "access" ? (d.intake!.data[k] === "self" ? "They paste it themselves" : "Screen-share upload") : String(d.intake!.data[k] ?? "—")}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="mt-2 text-[13px] font-semibold text-muted">Not completed yet. A reminder goes out 48 hours after purchase.</div>
            )}
            {d.bookings.length > 0 && (
              <div className="mt-3 border-t border-line-soft pt-3 text-[13px] font-semibold text-body">
                Interview: {d.bookings.map((b) => `${b.startAt ? fmtWhen(b.startAt) : "scheduled"} · ${b.status}${b.confirmed ? "" : " (awaiting Calendly confirmation)"}`).join("; ")}
              </div>
            )}
          </section>

          <section className="rounded-card border border-line-soft bg-white p-4">
            <div className="text-[11.5px] font-bold tracking-[0.1em] text-muted-2">FILES</div>
            <div className="mt-2 flex flex-col gap-2">
              {d.files.length === 0 && <div className="text-[13px] font-semibold text-muted">Nothing shared yet.</div>}
              {d.files.map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-[10px] border border-line-soft bg-[#F7FBFF] px-3 py-2 text-[13px]">
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-bold text-navy hover:text-blue-hover">
                    {f.name}
                  </a>
                  <span className="text-[11.5px] font-semibold text-muted">{f.stageKey || "general"}</span>
                  {canWrite && (
                    <button type="button" onClick={() => removeFile.mutate(f.id)} className="text-[12px] font-bold text-danger">
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            {canWrite && (
              <form
                className="mt-3 grid gap-2"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  addFile.mutate();
                }}
              >
                <Input className="h-9 text-[13px]" placeholder="File name (e.g. Brand Voice Blueprint.pdf)" value={file.name} onChange={(e) => setFile({ ...file, name: e.target.value })} required />
                <Input className="h-9 text-[13px]" type="url" placeholder="https://… link to the file (Drive, Dropbox, Loom)" value={file.url} onChange={(e) => setFile({ ...file, url: e.target.value })} required />
                <div className="flex flex-wrap items-center gap-2">
                  <Select className="h-9 w-[180px] text-[12.5px]" value={file.stageKey} onChange={(e) => setFile({ ...file, stageKey: e.target.value })}>
                    <option value="">General</option>
                    {d.stages.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                  <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-body">
                    <input type="checkbox" className="accent-blue" checked={file.notify} onChange={(e) => setFile({ ...file, notify: e.target.checked })} /> Email the client
                  </label>
                  <Button type="submit" size="sm" className="ml-auto" loading={addFile.isPending}>
                    Add file
                  </Button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
