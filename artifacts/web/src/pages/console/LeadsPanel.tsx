import { useMemo, useState, type DragEvent, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { STAGE_PALETTE, stageColor } from "@workspace/shared";
import { api, errorMessage } from "@/lib/api";
import { cn, initials } from "@/lib/utils";
import { Button, Input, Select } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { fmtDay, fmtWhen, type LeadView, type LeadsResponse, type StageView } from "./types";

type View = "list" | "board";

interface Props {
  companyId: number;
  data: LeadsResponse;
  query: string;
  view: View;
  onView: (v: View) => void;
  canBoard: boolean;
  canMoveStages: boolean;
  canManageColumns: boolean;
  onOpen: (leadId: number) => void;
}

const matches = (l: LeadView, q: string) => !q || `${l.name} ${l.email} ${l.phone} ${l.category}`.toLowerCase().includes(q);

export function LeadsPanel({ companyId, data, query, view, onView, canBoard, canMoveStages, canManageColumns, onOpen }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<number | "all">("all");
  const [manageOpen, setManageOpen] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<number | null>(null);
  const q = query.trim().toLowerCase();
  const leadsKey = ["company", companyId, "leads"];

  const move = useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: number; stageId: number }) => api(`/companies/${companyId}/leads/${leadId}`, { method: "PATCH", json: { stageId } }),
    onMutate: async ({ leadId, stageId }) => {
      await qc.cancelQueries({ queryKey: leadsKey });
      const prev = qc.getQueryData<LeadsResponse>(leadsKey);
      if (prev) {
        const stage = prev.stages.find((s) => s.id === stageId) ?? null;
        qc.setQueryData<LeadsResponse>(leadsKey, { ...prev, leads: prev.leads.map((l) => (l.id === leadId ? { ...l, stageId, stage: stage ? { id: stage.id, name: stage.name, kind: stage.kind, color: stage.color, dot: stage.dot, bg: stage.bg, fg: stage.fg } : l.stage } : l)) });
      }
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(leadsKey, ctx.prev);
      toast(errorMessage(e), "error");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: leadsKey });
      void qc.invalidateQueries({ queryKey: ["company", companyId, "summary"] });
    },
  });

  const rows = useMemo(() => data.leads.filter((l) => filter === "all" || l.stageId === filter).filter((l) => matches(l, q)), [data.leads, filter, q]);

  return (
    <div id="leads" className="overflow-hidden rounded-[18px] border border-line bg-white">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-5 py-4">
        <div className="inline-flex rounded-pill border border-line bg-page p-[3px]">
          <button type="button" onClick={() => { onView("list"); setManageOpen(false); }} className={cn("rounded-pill px-3.5 py-[7px] text-[13px] font-bold", view === "list" ? "bg-navy text-white" : "text-body-2")}>
            List
          </button>
          {canBoard && (
            <button type="button" onClick={() => onView("board")} className={cn("rounded-pill px-3.5 py-[7px] text-[13px] font-bold", view === "board" ? "bg-navy text-white" : "text-body-2")}>
              Pipeline
            </button>
          )}
        </div>
        {view === "list" && (
          <div className="flex flex-wrap gap-2">
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>
              All
            </Chip>
            {data.stages.map((s) => (
              <Chip key={s.id} active={filter === s.id} onClick={() => setFilter(s.id)}>
                {s.name}
              </Chip>
            ))}
          </div>
        )}
        {view === "board" && canManageColumns && (
          <button type="button" onClick={() => setManageOpen((m) => !m)} className={cn("rounded-pill border border-line px-3.5 py-2 text-[13px] font-bold", manageOpen ? "bg-navy text-white" : "bg-white text-body-2")}>
            {manageOpen ? "Done" : "Manage columns"}
          </button>
        )}
        <div className="ml-auto text-[13px] font-bold text-muted">
          {view === "list" ? `${rows.length} of ${data.leads.length} leads` : `${data.leads.filter((l) => matches(l, q)).length} leads`}
        </div>
      </div>

      {manageOpen && view === "board" && <ManageColumns companyId={companyId} stages={data.stages} onDone={() => setManageOpen(false)} />}

      {view === "board" ? (
        <div className="overflow-x-auto bg-[#F7FBFF] px-5 pb-[22px] pt-[18px]">
          <div className="flex min-w-max items-start gap-3.5">
            {data.stages.map((col) => {
              const cards = data.leads.filter((l) => l.stageId === col.id && matches(l, q));
              const over = overStage === col.id;
              const onDragOver = (e: DragEvent) => {
                if (!canMoveStages) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overStage !== col.id) setOverStage(col.id);
              };
              const onDrop = (e: DragEvent) => {
                e.preventDefault();
                const id = Number(e.dataTransfer.getData("text/plain")) || dragId;
                setDragId(null);
                setOverStage(null);
                if (id && canMoveStages) {
                  const lead = data.leads.find((l) => l.id === id);
                  if (lead && lead.stageId !== col.id) move.mutate({ leadId: id, stageId: col.id });
                }
              };
              return (
                <div key={col.id} onDragOver={onDragOver} onDragLeave={() => overStage === col.id && setOverStage(null)} onDrop={onDrop} className="flex min-h-[240px] w-[264px] shrink-0 flex-col rounded-card border transition-colors" style={{ background: over ? "#EAF2FD" : "#FFFFFF", borderColor: over ? "#1668F0" : "#DDE8F7" }}>
                  <div className="flex items-center gap-2 border-b border-line-soft px-3.5 pb-2.5 pt-3.5">
                    <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: col.dot }} />
                    <div className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-navy">{col.name}</div>
                    <span className="rounded-pill bg-[#F1F4F8] px-2 py-[3px] text-[11.5px] font-bold text-body-2">{cards.length}</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-2.5">
                    {cards.map((k) => (
                      <div
                        key={k.id}
                        draggable={canMoveStages}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", String(k.id));
                          setDragId(k.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverStage(null);
                        }}
                        onClick={() => dragId == null && onOpen(k.id)}
                        className={cn("rounded-[12px] border border-line bg-white p-3 shadow-[0_4px_12px_rgba(10,22,38,0.04)] transition-colors hover:border-brand", canMoveStages ? "cursor-grab" : "cursor-pointer")}
                        style={{ opacity: dragId === k.id ? 0.4 : 1 }}
                      >
                        <div className="flex items-center gap-[9px]">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pale text-[11px] font-bold text-blue-hover">{initials(k.name)}</div>
                          <div className="min-w-0">
                            <div className="truncate text-[13.5px] font-bold text-navy">{k.name}</div>
                            <div className="text-[11.5px] font-semibold text-muted">
                              {k.category || "—"} · {fmtDay(k.createdAt)}
                            </div>
                          </div>
                        </div>
                        {k.goal && <div className="mt-2 line-clamp-2 text-[12.5px] leading-[1.5] text-[#5A718C]">{k.goal}</div>}
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <span className="text-[11.5px] font-bold text-blue-hover">{k.phone}</span>
                          {k.bookedAt && <span className="rounded-pill bg-[#FFF8F0] px-[7px] py-[3px] text-[10.5px] font-bold text-warn-deep">CALL BOOKED</span>}
                        </div>
                      </div>
                    ))}
                    {cards.length === 0 && <div className="rounded-[12px] border border-dashed border-line p-[18px] text-center text-[12.5px] font-semibold text-[#9AAABF]">Drop a lead here</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse">
              <thead>
                <tr className="bg-[#F7FBFF]">
                  {["LEAD", "CATEGORY", "PHONE", "GOAL", "STATUS", "RECEIVED"].map((h, i) => (
                    <th key={h} scope="col" className={cn("border-b border-line-soft text-left text-[11.5px] font-bold tracking-[0.09em] text-muted-2", i === 0 || i === 5 ? "px-5 py-[13px]" : "px-4 py-[13px]")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} onClick={() => onOpen(l.id)} className="cursor-pointer border-b border-[#EEF4FC] hover:bg-[#F7FBFF]">
                    <td className="px-5 py-[15px]">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pale text-[12.5px] font-bold text-blue-hover">{initials(l.name)}</div>
                        <div className="min-w-0">
                          <div className="text-[14.5px] font-bold text-navy">{l.name}</div>
                          <div className="text-[12.5px] font-semibold text-muted">{l.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-[15px] text-[13.5px] font-semibold text-body">{l.category || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-[15px] text-[13.5px] font-semibold text-body">{l.phone || "—"}</td>
                    <td className="max-w-[280px] px-4 py-[15px] text-[13.5px] text-[#5A718C]">{l.goal.length > 96 ? `${l.goal.slice(0, 96).trim()}…` : l.goal}</td>
                    <td className="px-4 py-[15px]">
                      {l.stage ? (
                        <span className="inline-block whitespace-nowrap rounded-pill px-[11px] py-1.5 text-[12px] font-bold" style={{ background: l.stage.bg, color: l.stage.fg }}>
                          {l.stage.name}
                        </span>
                      ) : (
                        <span className="text-[12px] text-muted">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-[15px] text-[13px] font-semibold text-muted">{fmtWhen(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <div className="px-5 py-11 text-center text-[14.5px] font-semibold text-muted">{data.leads.length === 0 ? "No leads yet." : "No leads match that filter."}</div>}
        </>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-pill border border-line px-3.5 py-2 text-[13px] font-bold", active ? "bg-navy text-white" : "bg-white text-body-2")}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Manage columns
// ---------------------------------------------------------------------------

interface EditableStage {
  id?: number;
  name: string;
  kind: "open" | "won" | "lost";
  color: string;
  count: number;
}

function ManageColumns({ companyId, stages, onDone }: { companyId: number; stages: StageView[]; onDone: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [rows, setRows] = useState<EditableStage[]>(stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, color: s.color, count: s.count })));
  const [newName, setNewName] = useState("");
  const dirty = JSON.stringify(rows.map(({ count: _c, ...r }) => r)) !== JSON.stringify(stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, color: s.color })));
  const save = useMutation({
    mutationFn: () => api(`/companies/${companyId}/stages`, { method: "PUT", json: { stages: rows.map(({ count: _c, ...r }) => r) } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["company", companyId, "leads"] });
      toast("Pipeline columns saved");
      onDone();
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const update = (i: number, patch: Partial<EditableStage>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const moveRow = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    setRows((rs) => {
      const a = [...rs];
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || rows.some((r) => r.name.toLowerCase() === name.toLowerCase())) return;
    const insertAt = rows.findIndex((r) => r.kind !== "open");
    const next: EditableStage = { name, kind: "open", color: STAGE_PALETTE[rows.length % STAGE_PALETTE.length], count: 0 };
    setRows((rs) => {
      const a = [...rs];
      a.splice(insertAt < 0 ? a.length : insertAt, 0, next);
      return a;
    });
    setNewName("");
  };
  const locked = rows.length <= 2;
  return (
    <div className="border-b border-line-soft bg-[#F7FBFF] px-5 py-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <div className="text-[12px] font-bold tracking-[0.1em] text-blue-hover">PIPELINE COLUMNS</div>
          <div className="mt-[3px] text-[13px] font-semibold text-muted">Rename, reorder, add or remove stages. Mark one Won and one Lost so the funnel knows where deals end.</div>
        </div>
        <form onSubmit={add} className="flex gap-2">
          <Input className="h-10 w-[190px] bg-white text-[13.5px]" placeholder="New column name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button type="submit" size="sm" className="h-10 rounded-[9px]">
            + Add
          </Button>
        </form>
      </div>
      <div className="mt-3.5 flex flex-col gap-1.5">
        {rows.map((st, i) => (
          <div key={st.id ?? `new-${i}`} className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-line-soft bg-white px-2.5 py-2">
            <div className="flex gap-1">
              <button type="button" onClick={() => moveRow(i, -1)} aria-label="Move left" className="h-[26px] w-[26px] rounded-[6px] border border-line bg-page text-[11px] text-body-2">
                ◀
              </button>
              <button type="button" onClick={() => moveRow(i, 1)} aria-label="Move right" className="h-[26px] w-[26px] rounded-[6px] border border-line bg-page text-[11px] text-body-2">
                ▶
              </button>
            </div>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: stageColor(st.color).dot }} />
            <input aria-label="Column name" value={st.name} onChange={(e) => update(i, { name: e.target.value })} className="min-w-0 flex-1 basis-[160px] rounded-[7px] border border-transparent bg-transparent px-2.5 py-[7px] text-[13.5px] font-bold text-navy outline-none focus:border-brand focus:bg-[#F7FBFF]" />
            <Select aria-label="Column type" className="h-9 w-auto text-[12.5px] font-semibold" value={st.kind} onChange={(e) => { const kind = e.target.value as EditableStage["kind"]; update(i, { kind, color: kind === "won" ? "navy" : kind === "lost" ? "grey" : (STAGE_PALETTE as readonly string[]).includes(st.color) ? st.color : "blue" }); }}>
              <option value="open">Open stage</option>
              <option value="won">Won · closed deal</option>
              <option value="lost">Lost · not a fit</option>
            </Select>
            <span className="whitespace-nowrap text-[12px] font-bold text-muted-2">{st.count} leads</span>
            <button
              type="button"
              disabled={locked}
              onClick={() => {
                if (st.count && !window.confirm(`Remove “${st.name}”? ${st.count} lead${st.count > 1 ? "s" : ""} will move to the first open column.`)) return;
                setRows((rs) => rs.filter((_, k) => k !== i));
              }}
              className="rounded-pill border border-[#F0D6D0] bg-white px-2.5 py-1.5 text-[12px] font-bold text-danger disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3.5 flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
          Save columns
        </Button>
      </div>
    </div>
  );
}
