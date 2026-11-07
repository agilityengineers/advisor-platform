import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SITE_CONTENT_DEFAULTS, HERO_VIDEO_DEFAULTS, type CmsSectionKey, type HeroMedia, type SiteContent, type SiteContentOverrides } from "@workspace/shared";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button, Input, Spinner, Textarea } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import type { SiteContentResponse } from "./types";

interface Props {
  companyId: number;
  companyName: string;
  canEdit: boolean;
  hasVideoFeature: boolean;
}

type Working = SiteContentOverrides;

function sectionOf(content: SiteContent, key: CmsSectionKey): Record<string, string | boolean> {
  if (key === "process") return {};
  return content[key as keyof SiteContent] as unknown as Record<string, string | boolean>;
}

/**
 * Website (CMS): section rail → fields, Show-on-site toggles, hero card/video,
 * Preview draft / View live / Discard / Publish. Edits autosave to the draft.
 */
export function CmsPanel({ companyId, companyName, canEdit, hasVideoFeature }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = ["company", companyId, "site-content"];
  const q = useQuery<SiteContentResponse>({ queryKey: key, queryFn: () => api(`/companies/${companyId}/site-content`) });
  const [section, setSection] = useState<CmsSectionKey>("hero");
  const [working, setWorking] = useState<Working | null>(null);
  const [dirty, setDirty] = useState(false);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (q.data && working === null) setWorking(q.data.draft?.content ?? q.data.published?.content ?? {});
  }, [q.data, working]);

  const save = useMutation({
    mutationFn: (content: Working) => api(`/companies/${companyId}/site-content/draft`, { method: "PUT", json: { content } }),
    onSuccess: () => {
      setDirty(false);
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["company", companyId, "summary"] });
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const publish = useMutation({
    mutationFn: async () => {
      if (working && dirty) await api(`/companies/${companyId}/site-content/draft`, { method: "PUT", json: { content: working } });
      return api<{ version: number }>(`/companies/${companyId}/site-content/publish`, { method: "POST" });
    },
    onSuccess: (r) => {
      setDirty(false);
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["company", companyId, "summary"] });
      toast(`Published v${r.version} — visitors see it now`);
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const discard = useMutation({
    mutationFn: () => api(`/companies/${companyId}/site-content/discard`, { method: "POST" }),
    onSuccess: async () => {
      const fresh = await qc.fetchQuery<SiteContentResponse>({ queryKey: key, queryFn: () => api(`/companies/${companyId}/site-content`) });
      setWorking(fresh.published?.content ?? {});
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ["company", companyId, "summary"] });
      toast("Draft discarded", "info");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });

  const queueSave = (next: Working) => {
    setWorking(next);
    setDirty(true);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => save.mutate(next), 900);
  };

  const data = q.data;
  const merged = useMemo(() => {
    if (!data || !working) return null;
    // Merge client-side the same way the server does: defaults → overrides.
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(data.defaults) as (keyof SiteContent)[]) {
      const base = data.defaults[k];
      const over = working[k];
      out[k] = k === "heroMedia" ? (over && typeof over === "object" && "kind" in over ? over : base) : { ...(base as object), ...((over as object) ?? {}) };
    }
    return out as unknown as SiteContent;
  }, [data, working]);

  if (!data || !working || !merged) {
    return (
      <div className="flex justify-center rounded-[18px] border border-line bg-white py-16">
        <Spinner />
      </div>
    );
  }

  const meta = data.meta.find((m) => m.key === section) ?? data.meta[0];
  const hasDraft = Boolean(data.draft) || dirty;
  const status = dirty ? "Unpublished changes — saving draft…" : data.status === "draft" ? "Unpublished changes — visitors still see the live version." : data.status === "published" ? `Published · live content for this company (v${data.published?.version}).` : "Using template defaults — nothing customized yet.";
  const setField = (sec: CmsSectionKey, field: string, value: string | boolean) => {
    if (!canEdit || sec === "process") return;
    const s = sec as keyof SiteContentOverrides;
    queueSave({ ...working, [s]: { ...((working[s] as Record<string, unknown>) ?? {}), [field]: value } } as Working);
  };
  const setVisibility = (sec: CmsSectionKey, visible: boolean) => {
    if (!canEdit) return;
    queueSave({ ...working, visibility: { ...(working.visibility ?? {}), [sec]: visible } });
  };
  const resetSection = () => {
    if (!canEdit) return;
    const next: Working = { ...working };
    if (section !== "process") delete next[section as keyof SiteContentOverrides];
    if (next.visibility) {
      const v = { ...next.visibility } as Record<string, boolean>;
      delete v[section];
      next.visibility = v;
    }
    if (section === "hero") delete next.heroMedia;
    queueSave(next);
  };
  const changed = (sec: CmsSectionKey) => {
    const live = sectionOf(data.live, sec);
    const now = sectionOf(merged, sec);
    const vis = (data.live.visibility as Record<string, boolean>)[sec] !== (merged.visibility as Record<string, boolean>)[sec];
    return JSON.stringify(live) !== JSON.stringify(now) || (sec !== "brand" && vis) || (sec === "hero" && JSON.stringify(data.live.heroMedia) !== JSON.stringify(merged.heroMedia));
  };
  const heroMedia: HeroMedia = merged.heroMedia;
  const isVideo = heroMedia.kind === "video";
  const setHero = (patch: Partial<Extract<HeroMedia, { kind: "video" }>> | { kind: "audit_card" }) => {
    if (!canEdit) return;
    if ("kind" in patch && patch.kind === "audit_card") {
      queueSave({ ...working, heroMedia: { kind: "audit_card" } });
      return;
    }
    const current = isVideo ? heroMedia : { kind: "video" as const, url: "", title: HERO_VIDEO_DEFAULTS.title, caption: HERO_VIDEO_DEFAULTS.caption };
    queueSave({ ...working, heroMedia: { ...current, ...patch, kind: "video" } });
  };

  return (
    <div id="website" className="overflow-hidden rounded-[18px] border border-line bg-white">
      <div className="flex flex-wrap items-center gap-3.5 border-b border-line-soft px-6 py-5">
        <div className="min-w-0 flex-1 basis-[260px]">
          <div className="text-[12px] font-bold tracking-[0.1em] text-blue-hover">WEBSITE · {companyName.toUpperCase()}</div>
          <h2 className="mt-2 font-display text-[19px] font-bold text-navy">Landing page content</h2>
          <div className="mt-1 text-[13px] font-semibold text-muted">{status}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={data.urls.preview} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm" className="h-10 text-[13px]">
              Preview draft ↗
            </Button>
          </a>
          <a href={data.urls.live} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm" className="h-10 text-[13px]">
              View live ↗
            </Button>
          </a>
          {canEdit && (
            <>
              <Button variant="ghost" size="sm" className="h-10 border border-line text-[13px]" disabled={!hasDraft} loading={discard.isPending} onClick={() => window.confirm("Discard all unpublished changes?") && discard.mutate()}>
                Discard
              </Button>
              <Button size="sm" className="h-10 px-[18px] text-[13px] shadow-[0_8px_20px_rgba(22,104,240,0.28)]" disabled={!hasDraft} loading={publish.isPending} onClick={() => publish.mutate()}>
                Publish
              </Button>
            </>
          )}
        </div>
      </div>
      {!canEdit && (
        <div className="flex items-center gap-2.5 border-b border-[#F6E4CC] bg-[#FFF8F0] px-6 py-3 text-[13px] font-bold text-warn-deep">
          <span className="text-[15px]">🔒</span>Read-only — only the company Admin or a Super admin can change website content.
        </div>
      )}
      <div className="grid grid-cols-[220px_minmax(0,1fr)] max-[1180px]:grid-cols-1">
        <div className="flex flex-col gap-1 border-r border-line-soft bg-[#F7FBFF] p-3 max-[1180px]:flex-row max-[1180px]:flex-wrap max-[1180px]:border-b max-[1180px]:border-r-0">
          {data.meta.map((m) => {
            const hidden = m.toggle && (merged.visibility as Record<string, boolean>)[m.key] === false;
            return (
              <button key={m.key} type="button" onClick={() => setSection(m.key)} className={cn("flex items-center justify-between gap-2 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] font-bold", section === m.key ? "bg-navy text-white" : "text-body-2 hover:bg-pale")}>
                <span className="truncate">{m.label}</span>
                <span className="flex items-center gap-1.5">
                  {hidden && <span className="text-[10px] font-bold tracking-[0.06em] text-[#9AAABF]">HIDDEN</span>}
                  {hasDraft && changed(m.key) && <span className="h-[7px] w-[7px] rounded-full bg-warn" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="min-w-0 px-6 py-[22px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-display text-[17px] font-bold text-navy">{meta.label}</div>
              <div className="mt-[2px] text-[12.5px] font-semibold text-muted">{meta.toggle ? "Copy for this section. Untick “Show on site” to hide the whole block." : "Copy for this section."}</div>
            </div>
            <div className="flex items-center gap-2.5">
              {meta.toggle && (
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-bold text-[#16283D]">
                  <input type="checkbox" className="h-[17px] w-[17px] accent-blue" checked={(merged.visibility as Record<string, boolean>)[meta.key] !== false} disabled={!canEdit} onChange={(e) => setVisibility(meta.key, e.target.checked)} />
                  Show on site
                </label>
              )}
              {canEdit && (
                <button type="button" onClick={resetSection} className="rounded-pill border border-line bg-white px-3 py-2 text-[12.5px] font-bold text-body-2 hover:border-brand">
                  Reset to default
                </button>
              )}
            </div>
          </div>

          {meta.key === "hero" && (
            <div className="mt-[18px] rounded-[14px] border border-line-soft bg-[#F7FBFF] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div>
                  <div className="text-[11.5px] font-bold tracking-[0.1em] text-muted-2">BESIDE THE HEADLINE</div>
                  <div className="mt-1 text-[13px] font-bold" style={{ color: !isVideo ? "#6A809A" : heroMedia.url ? "#1E7A4C" : "#8A6320" }}>
                    {!isVideo ? "Showing the audit card (default)." : heroMedia.url ? "Showing video on the landing page." : "Video selected — add a URL or the card stays live."}
                  </div>
                </div>
                <div className="inline-flex rounded-pill border border-line bg-white p-[3px]">
                  <button type="button" disabled={!canEdit} onClick={() => setHero({ kind: "audit_card" })} className={cn("whitespace-nowrap rounded-pill px-[13px] py-[7px] text-[12.5px] font-bold", !isVideo ? "bg-navy text-white" : "text-body-2")}>
                    Audit card
                  </button>
                  <button type="button" disabled={!canEdit || !hasVideoFeature} title={hasVideoFeature ? undefined : "Not in your plan"} onClick={() => setHero({})} className={cn("whitespace-nowrap rounded-pill px-[13px] py-[7px] text-[12.5px] font-bold disabled:opacity-50", isVideo ? "bg-navy text-white" : "text-body-2")}>
                    {hasVideoFeature ? "Video" : "🔒 Video"}
                  </button>
                </div>
              </div>
              {!hasVideoFeature && <div className="mt-2 text-[12.5px] font-bold text-warn-deep">🔒 Hero video isn't in your plan (Professional and above).</div>}
              <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                <label className="col-span-full flex flex-col gap-[5px] text-[12px] font-bold text-[#16283D]">
                  Video URL <span className="font-semibold text-muted-2">(YouTube, Vimeo, Loom, or .mp4)</span>
                  <Input type="url" className="h-10 text-[14px]" disabled={!isVideo || !canEdit} value={isVideo ? heroMedia.url : ""} onChange={(e) => setHero({ url: e.target.value })} />
                </label>
                <label className="flex flex-col gap-[5px] text-[12px] font-bold text-[#16283D]">
                  Title under video
                  <Input className="h-10 text-[14px]" disabled={!isVideo || !canEdit} value={isVideo ? (heroMedia.title ?? "") : ""} onChange={(e) => setHero({ title: e.target.value })} />
                </label>
                <label className="flex flex-col gap-[5px] text-[12px] font-bold text-[#16283D]">
                  Caption
                  <Input className="h-10 text-[14px]" disabled={!isVideo || !canEdit} value={isVideo ? (heroMedia.caption ?? "") : ""} onChange={(e) => setHero({ caption: e.target.value })} />
                </label>
              </div>
            </div>
          )}

          {meta.fields.length > 0 ? (
            <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3.5">
              {meta.fields.map((f) => {
                const value = String((sectionOf(merged, meta.key) as Record<string, unknown>)[f.key] ?? "");
                const liveValue = String((sectionOf(data.live, meta.key) as Record<string, unknown>)[f.key] ?? "");
                const id = `cms-${meta.key}-${f.key}`;
                return (
                  <div key={f.key} className={cn("flex flex-col gap-1.5", f.kind === "textarea" && "col-span-full")}>
                    <label htmlFor={id} className="flex justify-between gap-2 text-[12.5px] font-bold text-[#16283D]">
                      <span>{f.label}</span>
                      {hasDraft && value !== liveValue && <span className="text-[10.5px] tracking-[0.06em] text-warn-deep">EDITED</span>}
                    </label>
                    {f.kind === "textarea" ? (
                      <Textarea id={id} rows={3} className="bg-[#F7FBFF] leading-[1.55]" value={value} disabled={!canEdit} onChange={(e) => setField(meta.key, f.key, e.target.value)} />
                    ) : (
                      <Input id={id} className="bg-[#F7FBFF]" value={value} disabled={!canEdit} onChange={(e) => setField(meta.key, f.key, e.target.value)} placeholder={f.kind === "image" ? "https://… or /uploads/…" : undefined} />
                    )}
                    {f.kind === "image" && value && <img src={value} alt="" className="mt-1 h-12 w-auto max-w-[200px] rounded-[8px] border border-line object-contain" />}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-[18px] rounded-[14px] border border-dashed border-line p-[22px] text-[13.5px] font-semibold text-muted">This section is fixed layout — only visibility is controlled here. Reviews are managed in the Reviews panel below.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export { SITE_CONTENT_DEFAULTS };
