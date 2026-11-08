import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { Button, PageTitle, Pill, Select, Spinner } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { OVERVIEW_KEY } from "./AdminLayout";
import type { TemplateRow } from "./types";

interface TemplatesResponse {
  templates: TemplateRow[];
  companies: { id: number; name: string; slug: string; status: string }[];
}

const PREVIEW_BLOCKS = ["journey", "cost", "guide", "plan", "testimonials"] as const;

export function TemplatesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useQuery<TemplatesResponse>({ queryKey: ["admin", "templates"], queryFn: () => api("/admin/templates") });
  const [targets, setTargets] = useState<Record<number, string>>({});
  const [applied, setApplied] = useState<Record<number, string>>({});
  const apply = useMutation({
    mutationFn: ({ templateId, companyId }: { templateId: number; companyId: number }) => api<{ companyName: string }>(`/admin/templates/${templateId}/apply`, { method: "POST", json: { companyId } }),
    onSuccess: (r, vars) => setApplied((a) => ({ ...a, [vars.templateId]: r.companyName })),
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const remove = useMutation({
    mutationFn: (templateId: number) => api(`/admin/templates/${templateId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "templates"] });
      void qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
      toast("Template removed");
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
  return (
    <div>
      <PageTitle
        title="Landing page templates"
        sub="Starting points for a company's website. Applying one seeds their CMS; they edit from there. Grows as you save real pages back."
        action={
          <a href="/" target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm" className="h-10 px-3.5 text-[13px]">
              Platform landing page ↗
            </Button>
          </a>
        }
      />
      <div className="mt-[22px] grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {q.data.templates.map((t) => {
          const vis = (t.content.visibility ?? {}) as Record<string, boolean>;
          const sectionCount = Object.keys(t.content).filter((k) => k !== "brand" && k !== "visibility").length;
          const target = targets[t.id] ?? "";
          return (
            <div key={t.id} className="flex flex-col overflow-hidden rounded-[18px] border border-line bg-white">
              <div className="flex flex-col gap-[7px] border-b border-line-soft bg-page p-4" aria-hidden>
                <div className="flex items-center justify-between">
                  <div className="h-2 w-[70px] rounded bg-navy" />
                  <div className="h-4 w-16 rounded-pill bg-blue" />
                </div>
                <div className="mt-2 h-3.5 w-[85%] rounded bg-navy" />
                <div className="h-3.5 w-[60%] rounded bg-navy" />
                <div className="mt-1.5 h-1.5 w-[90%] rounded-[3px] bg-line" />
                <div className="h-1.5 w-3/4 rounded-[3px] bg-line" />
                <div className="mt-2 flex gap-1.5">
                  {PREVIEW_BLOCKS.map((k) => (
                    <div key={k} className="h-7 flex-1 rounded-[6px]" style={{ background: vis[k] === false ? "#F1F4F8" : k === "cost" ? "#0A1626" : "#DDE8F7" }} />
                  ))}
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-[18px]">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-display text-[17px] font-bold text-navy">{t.name}</div>
                  <Pill className="text-[10.5px]">{sectionCount} SECTIONS</Pill>
                </div>
                <div className="text-[12.5px] font-semibold text-muted">
                  {t.source} · {t.audience}
                </div>
                <div className="flex-1 text-[13.5px] leading-[1.55] text-body-2">{t.summary}</div>
                <div className="mt-2 flex items-center gap-2">
                  <Select aria-label="Apply to company" className="h-10 min-w-0 flex-1 bg-[#F7FBFF] text-[13px] font-bold" value={target} onChange={(e) => { setTargets((s) => ({ ...s, [t.id]: e.target.value })); setApplied((a) => ({ ...a, [t.id]: "" })); }}>
                    <option value="">Apply to company…</option>
                    {q.data!.companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Button size="sm" className="h-10 rounded-[9px] px-3.5 text-[13px]" disabled={!target} loading={apply.isPending && apply.variables?.templateId === t.id} onClick={() => apply.mutate({ templateId: t.id, companyId: Number(target) })}>
                    Apply
                  </Button>
                </div>
                {applied[t.id] && <div className="text-[12.5px] font-bold text-success-deep">✓ Applied to {applied[t.id]} as a draft — the company Admin reviews and publishes it in their CMS.</div>}
                {!t.isDefault && (
                  <button type="button" onClick={() => remove.mutate(t.id)} className="self-start text-[12px] font-bold text-muted hover:text-danger">
                    Remove template
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
