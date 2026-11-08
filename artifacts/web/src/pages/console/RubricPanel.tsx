import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { validateRubric, type Rubric } from "@workspace/shared";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Alert, Button, Select, Spinner, Textarea } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import type { RubricResponse } from "./types";

/**
 * Profile Grader rubric editor: category weights (must total 100), Core/Additional,
 * check shares, tier threshold / % earned / finding / recommendation, grade
 * thresholds, Reset to platform default, Publish as vN.
 */
export function RubricPanel({ companyId }: { companyId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = ["company", companyId, "rubric"];
  const q = useQuery<RubricResponse>({ queryKey: key, queryFn: () => api(`/companies/${companyId}/rubric`) });
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [ci, setCi] = useState(0);
  const [dirty, setDirty] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (q.data && rubric === null) setRubric(q.data.working);
  }, [q.data, rubric]);

  const save = useMutation({
    mutationFn: (r: Rubric) => api(`/companies/${companyId}/rubric/draft`, { method: "PUT", json: { rubric: r } }),
    onSuccess: () => {
      setDirty(false);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const publish = useMutation({
    mutationFn: async () => {
      if (rubric) await api(`/companies/${companyId}/rubric/draft`, { method: "PUT", json: { rubric } });
      return api<{ version: number }>(`/companies/${companyId}/rubric/publish`, { method: "POST" });
    },
    onSuccess: async (r) => {
      setDirty(false);
      const fresh = await qc.fetchQuery<RubricResponse>({ queryKey: key, queryFn: () => api(`/companies/${companyId}/rubric`) });
      setRubric(fresh.working);
      toast(`Rubric published as v${r.version}`);
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const reset = useMutation({
    mutationFn: () => api<{ working: Rubric }>(`/companies/${companyId}/rubric/reset`, { method: "POST" }),
    onSuccess: (r) => {
      setRubric(r.working);
      setDirty(false);
      void qc.invalidateQueries({ queryKey: key });
      toast("Reset to the platform default (unpublished)", "info");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });

  const patch = (fn: (r: Rubric) => void) => {
    if (!rubric) return;
    const next = structuredClone(rubric);
    fn(next);
    setRubric(next);
    setDirty(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => save.mutate(next), 900);
  };

  if (!q.data || !rubric) {
    return (
      <div className="flex justify-center rounded-[18px] border border-line bg-white py-16">
        <Spinner />
      </div>
    );
  }
  const cat = rubric.categories[Math.min(ci, rubric.categories.length - 1)];
  const catIndex = Math.min(ci, rubric.categories.length - 1);
  const weightTotal = rubric.categories.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const problems = validateRubric(rubric);
  const hasDraft = q.data.hasDraft || dirty;
  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  return (
    <div id="grader" className="overflow-hidden rounded-[18px] border border-line bg-white">
      <div className="flex flex-col gap-3.5 border-b border-line-soft px-6 py-5">
        <div>
          <div className="text-[12px] font-bold tracking-[0.1em] text-blue-hover">
            PROFILE GRADER · RUBRIC v{q.data.published.version}
            {q.data.published.source === "platform" ? " · PLATFORM DEFAULT" : ""}
          </div>
          <h2 className="mt-2 font-display text-[19px] font-bold text-navy">How this company grades a profile</h2>
          <div className="mt-1 text-[13px] font-semibold text-muted">
            {hasDraft ? "Unpublished edits — new reports keep using the published version until you publish." : "Published."} Weights total <strong style={{ color: weightTotal === 100 ? "#1E7A4C" : "#C2361F" }}>{weightTotal}</strong> / 100.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" className="h-10 text-[13px]" onClick={() => toast("The sample report preview lands with the Profile Grader in Phase 6.", "info")}>
            Preview sample report ↗
          </Button>
          <Button variant="ghost" size="sm" className="h-10 border border-line text-[13px]" loading={reset.isPending} onClick={() => window.confirm("Reset this company's rubric to the platform default?") && reset.mutate()}>
            Reset to platform default
          </Button>
          <Button size="sm" className="h-10 px-[18px] text-[13px] shadow-[0_8px_20px_rgba(22,104,240,0.28)]" disabled={!hasDraft || problems.length > 0} loading={publish.isPending} onClick={() => publish.mutate()}>
            Publish as v{q.data.nextVersion}
          </Button>
        </div>
        {problems.length > 0 && hasDraft && (
          <Alert tone="warn">
            Fix before publishing: {problems.slice(0, 3).map((p) => p.message).join(" ")}
            {problems.length > 3 ? ` (+${problems.length - 3} more)` : ""}
          </Alert>
        )}
      </div>
      <div className="grid grid-cols-[280px_minmax(0,1fr)] max-[1180px]:grid-cols-1">
        <div className="flex flex-col gap-1 border-r border-line-soft bg-[#F7FBFF] p-3 max-[1180px]:border-b max-[1180px]:border-r-0">
          {rubric.categories.map((c, i) => (
            <div key={c.key} className={cn("flex items-center gap-2 rounded-[10px] px-2.5 py-2", i === catIndex ? "bg-navy" : "")}>
              <button type="button" onClick={() => setCi(i)} className={cn("min-w-0 flex-1 truncate text-left text-[13.5px] font-bold", i === catIndex ? "text-white" : "text-body-2")}>
                {c.name}
              </button>
              <input type="number" min={0} max={100} aria-label="Weight" value={c.weight} onChange={(e) => patch((r) => { r.categories[i].weight = num(e.target.value); })} className="w-[54px] rounded-[7px] border border-line bg-white px-[7px] py-[5px] text-right text-[12.5px] font-bold text-navy" />
              <span className={cn("text-[10.5px] font-bold", i === catIndex ? "text-[#7FB6FF]" : "text-muted-2")}>pts</span>
            </div>
          ))}
          <div className="mt-2 border-t border-line-soft pt-2.5">
            <div className="px-2.5 text-[11px] font-bold tracking-[0.08em] text-muted-2">GRADE THRESHOLDS</div>
            {rubric.grades.map((g, i) => (
              <div key={g.grade} className="flex items-center gap-2 px-2.5 py-1.5">
                <div className="w-[22px] font-display text-[14px] font-bold text-navy">{g.grade}</div>
                <input aria-label="Grade label" value={g.label} onChange={(e) => patch((r) => { r.grades[i].label = e.target.value; })} className="min-w-0 flex-1 rounded-[7px] border border-line bg-white px-2 py-[5px] text-[12.5px] font-semibold" />
                <input type="number" min={0} max={100} aria-label="Minimum percent" value={g.min} onChange={(e) => patch((r) => { r.grades[i].min = num(e.target.value); })} className="w-[52px] rounded-[7px] border border-line bg-white px-[7px] py-[5px] text-right text-[12.5px] font-bold" />
                <span className="text-[10.5px] font-bold text-muted-2">%+</span>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 px-6 py-[22px]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <input aria-label="Category name" value={cat.name} onChange={(e) => patch((r) => { r.categories[catIndex].name = e.target.value; })} className="-ml-2 w-full rounded-[8px] border border-transparent bg-transparent px-2 py-1.5 font-display text-[17px] font-bold text-navy outline-none focus:border-brand focus:bg-[#F7FBFF]" />
              <div className="mt-[2px] text-[12.5px] font-semibold text-muted">
                {cat.group} section · {cat.weight} points · each check is a share of the weight; tiers read top-down and the first match wins.
              </div>
            </div>
            <Select aria-label="Section group" className="h-9 w-auto text-[12.5px] font-bold" value={cat.group} onChange={(e) => patch((r) => { r.categories[catIndex].group = e.target.value as Rubric["categories"][number]["group"]; })}>
              <option value="Core">Core</option>
              <option value="Additional">Additional</option>
            </Select>
          </div>
          <div className="mt-[18px] flex flex-col gap-3.5">
            {cat.checks.map((ch, k) => {
              const points = Math.round(cat.weight * ch.share * 10) / 10;
              return (
                <div key={ch.key} className="rounded-[14px] border border-line-soft bg-[#F7FBFF] px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <input aria-label="Check label" value={ch.label} onChange={(e) => patch((r) => { r.categories[catIndex].checks[k].label = e.target.value; })} className="-ml-2 min-w-[160px] flex-1 rounded-[7px] border border-transparent bg-transparent px-2 py-[5px] text-[14px] font-bold text-navy outline-none focus:border-brand focus:bg-white" />
                    <span className="rounded-[6px] bg-[#EEF4FC] px-[7px] py-[3px] font-mono text-[11.5px] text-muted-2">{ch.key}</span>
                    <div className="flex items-center gap-1.5 text-[12px] font-bold text-body-2">
                      share
                      <input type="number" min={0} max={1} step={0.05} aria-label="Share of weight" value={ch.share} onChange={(e) => patch((r) => { r.categories[catIndex].checks[k].share = num(e.target.value); })} className="w-[62px] rounded-[7px] border border-line bg-white px-[7px] py-[5px] text-right text-[12.5px] font-bold" />
                      <span className="text-muted-2">= {points} pts</span>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-col gap-2">
                    {ch.tiers.map((t, j) => (
                      <div key={j} className="flex flex-col gap-2 rounded-[10px] border border-line-soft bg-white px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 text-[12px] font-bold text-body-2">
                          <label className="flex items-center gap-1.5 whitespace-nowrap">
                            At least
                            <input type="number" aria-label="Minimum value" value={t.min} onChange={(e) => patch((r) => { r.categories[catIndex].checks[k].tiers[j].min = num(e.target.value); })} className="w-[76px] rounded-[7px] border border-line bg-[#F7FBFF] px-2 py-1.5 text-[12.5px] font-bold" />
                          </label>
                          <label className="flex items-center gap-1.5 whitespace-nowrap">
                            earns
                            <input type="number" min={0} max={100} aria-label="Percent earned" value={Math.round(t.pct * 100)} onChange={(e) => patch((r) => { r.categories[catIndex].checks[k].tiers[j].pct = Math.max(0, Math.min(100, num(e.target.value))) / 100; })} className="w-[62px] rounded-[7px] border border-line bg-[#F7FBFF] px-2 py-1.5 text-[12.5px] font-bold" />
                            <span className="text-muted-2">% of {points} pts</span>
                          </label>
                        </div>
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">
                          <label className="flex flex-col gap-1 text-[10.5px] font-bold tracking-[0.06em] text-muted-2">
                            FINDING SHOWN
                            <Textarea rows={2} className="bg-[#F7FBFF] px-2 py-[7px] text-[12.5px] leading-[1.45]" value={t.finding ?? ""} onChange={(e) => patch((r) => { r.categories[catIndex].checks[k].tiers[j].finding = e.target.value; })} />
                          </label>
                          <label className="flex flex-col gap-1 text-[10.5px] font-bold tracking-[0.06em] text-muted-2">
                            RECOMMENDATION · BLANK = NONE
                            <Textarea rows={2} className="bg-[#F7FBFF] px-2 py-[7px] text-[12.5px] leading-[1.45]" value={t.rec ?? ""} onChange={(e) => patch((r) => { const v = e.target.value; if (v.trim()) r.categories[catIndex].checks[k].tiers[j].rec = v; else delete r.categories[catIndex].checks[k].tiers[j].rec; })} />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-[11.5px] font-semibold text-muted-2">
                    Use <span className="font-mono">{"{v}"}</span> in text to insert the measured value.
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-[12px] border border-[#F6E4CC] bg-[#FFF8F0] px-3.5 py-3 text-[12.5px] leading-[1.55] text-warn-deep">
            <strong>Feedback loop:</strong> after each professional's walkthrough, adjust the tier text or weights here, then Publish a new version. Reports show which rubric version graded them, so you can compare before/after scores fairly.
          </div>
        </div>
      </div>
    </div>
  );
}
