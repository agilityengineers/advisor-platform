import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { cn, initials } from "@/lib/utils";
import { Button, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import type { ReviewView } from "./types";

const CATEGORIES = ["Consultant", "Author", "Professional writer", "Executive", "Coach", "Speaker"];

interface Props {
  companyId: number;
  canWrite: boolean;
}

type Draft = Omit<ReviewView, "id" | "sort"> & { id?: number };

const blank = (): Draft => ({ name: "", role: "", category: "Consultant", linkedin: "", quote: "", visible: true, reviewedOn: new Date().toISOString().slice(0, 10) });

export function ReviewsPanel({ companyId, canWrite }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = ["company", companyId, "reviews"];
  const q = useQuery<ReviewView[]>({ queryKey: key, queryFn: () => api(`/companies/${companyId}/reviews`) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["company", companyId, "summary"] });
  };
  const save = useMutation({
    mutationFn: (d: Draft) => (d.id ? api(`/companies/${companyId}/reviews/${d.id}`, { method: "PATCH", json: d }) : api(`/companies/${companyId}/reviews`, { method: "POST", json: d })),
    onSuccess: () => {
      refresh();
      setDraft(null);
      toast("Review saved");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const toggle = useMutation({
    mutationFn: (r: ReviewView) => api(`/companies/${companyId}/reviews/${r.id}`, { method: "PATCH", json: { visible: !r.visible } }),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/companies/${companyId}/reviews/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const order = useMutation({
    mutationFn: (ids: number[]) => api(`/companies/${companyId}/reviews/order`, { method: "PUT", json: { ids } }),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), "error"),
  });

  const reviews = q.data ?? [];
  const live = reviews.filter((r) => r.visible).length;
  const moveReview = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= reviews.length) return;
    const ids = reviews.map((r) => r.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    order.mutate(ids);
  };

  return (
    <div id="reviews" className="overflow-hidden rounded-[18px] border border-line bg-white">
      <div className="flex flex-wrap items-center gap-3.5 border-b border-line-soft px-6 py-5">
        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="text-[12px] font-bold tracking-[0.1em] text-blue-hover">WHAT CLIENTS SAY</div>
          <h2 className="mt-2 font-display text-[19px] font-bold text-navy">Reviews on the landing page</h2>
          <div className="mt-1 text-[13px] font-semibold text-muted">
            {live} live · {reviews.length - live} hidden · list order = slider order
          </div>
        </div>
        {canWrite && (
          <Button onClick={() => setDraft(blank())} className="shadow-[0_8px_20px_rgba(22,104,240,0.28)]">
            + Add review
          </Button>
        )}
      </div>
      {!q.data ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : reviews.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <div className="text-[15px] font-bold text-navy">No reviews yet</div>
          <div className="mt-1 text-[13.5px] text-muted">Add your first LinkedIn recommendation and it appears in the “What clients say” slider.</div>
          {canWrite && (
            <Button className="mt-4" variant="secondary" onClick={() => setDraft(blank())}>
              Add the first review
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col">
          {reviews.map((r, i) => (
            <div key={r.id} className={cn("flex items-start gap-4 border-b border-[#EEF4FC] px-6 py-[18px] max-md:flex-wrap", !r.visible && "opacity-55")}>
              {canWrite && (
                <div className="flex shrink-0 flex-col gap-[2px] pt-1">
                  <button type="button" aria-label="Move up" onClick={() => moveReview(i, -1)} className="h-[22px] w-[26px] rounded-[6px] border border-line bg-page text-[11px] text-body-2 hover:bg-pale">
                    ▲
                  </button>
                  <button type="button" aria-label="Move down" onClick={() => moveReview(i, 1)} className="h-[22px] w-[26px] rounded-[6px] border border-line bg-page text-[11px] text-body-2 hover:bg-pale">
                    ▼
                  </button>
                </div>
              )}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pale text-[13px] font-bold text-blue-hover">{initials(r.name)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-[14.5px] font-bold text-navy">{r.name}</div>
                  {r.category && <span className="rounded-pill bg-[#F1F4F8] px-2 py-[3px] text-[11px] font-bold tracking-[0.04em] text-body-2">{r.category}</span>}
                  <span className={cn("rounded-pill px-2 py-[3px] text-[11px] font-bold tracking-[0.04em]", r.visible ? "bg-[#EDF7F1] text-success-deep" : "bg-[#F1F4F8] text-muted")}>{r.visible ? "Live" : "Hidden"}</span>
                </div>
                <div className="mt-[3px] text-[12.5px] font-semibold text-muted">
                  {r.role}
                  {r.linkedin && (
                    <>
                      {" "}
                      ·{" "}
                      <a href={`https://${r.linkedin.replace(/^https?:\/\//, "")}`} target="_blank" rel="noopener noreferrer" className="text-blue-hover">
                        {r.linkedin}
                      </a>
                    </>
                  )}
                </div>
                <div className="mt-2 text-[13.5px] leading-[1.55] text-body">“{r.quote.length > 150 ? `${r.quote.slice(0, 150).trim()}…` : r.quote}”</div>
              </div>
              {canWrite && (
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => toggle.mutate(r)} className="rounded-pill border border-line bg-white px-3 py-2 text-[12.5px] font-bold text-navy hover:border-brand hover:text-blue-hover">
                    {r.visible ? "Hide" : "Show"}
                  </button>
                  <button type="button" onClick={() => setDraft({ ...r })} className="rounded-pill border border-line bg-white px-3 py-2 text-[12.5px] font-bold text-navy hover:border-brand hover:text-blue-hover">
                    Edit
                  </button>
                  <button type="button" aria-label="Remove review" onClick={() => window.confirm(`Remove ${r.name}'s review from the landing page?`) && remove.mutate(r.id)} className="rounded-pill border border-[#F0D6D0] bg-white px-3 py-2 text-[12.5px] font-bold text-danger hover:bg-[#FFF3F0]">
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {draft && (
        <Modal title={draft.id ? "Edit review" : "Add a review"} onClose={() => setDraft(null)} width={560}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              save.mutate(draft);
            }}
          >
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
              <Field label="Client name" htmlFor="rv-name">
                <Input id="rv-name" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <Field label="Category" htmlFor="rv-cat">
                <Select id="rv-cat" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Title / role" htmlFor="rv-role">
              <Input id="rv-role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
            </Field>
            <Field label="LinkedIn profile link" htmlFor="rv-li">
              <Input id="rv-li" placeholder="linkedin.com/in/…" value={draft.linkedin} onChange={(e) => setDraft({ ...draft, linkedin: e.target.value })} />
            </Field>
            <Field label="Quote" hint={`${draft.quote.length} characters · ~40 words reads best in the slider`} htmlFor="rv-quote">
              <Textarea id="rv-quote" rows={5} required minLength={10} value={draft.quote} onChange={(e) => setDraft({ ...draft, quote: e.target.value })} />
            </Field>
            <label className="flex cursor-pointer items-center gap-2.5 text-[14px] font-semibold text-[#16283D]">
              <input type="checkbox" className="h-[18px] w-[18px] accent-blue" checked={draft.visible} onChange={(e) => setDraft({ ...draft, visible: e.target.checked })} />
              Show on landing page
            </label>
            <div className="mt-1 flex justify-end gap-2.5">
              <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending}>
                Save review
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
