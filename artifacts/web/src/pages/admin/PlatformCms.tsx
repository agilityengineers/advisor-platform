import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { PLATFORM_SECTION_META, type PlatformContent, type PlatformContentSection, type PlatformField } from "@workspace/shared";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Alert, Button, Field, Input, PageTitle, Pill, Select, Spinner, Textarea } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import type { PlatformContentState } from "./types";

const KEY = ["admin", "platform-content"];

type Section = Record<string, unknown>;

/**
 * Platform landing CMS — same draft → publish model as the company CMS,
 * keyed to the platform. Edits are saved as a draft; visitors only ever see
 * the published version.
 */
export function PlatformCmsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useQuery<PlatformContentState>({ queryKey: KEY, queryFn: () => api("/admin/platform-content") });
  const [content, setContent] = useState<PlatformContent | null>(null);
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState<PlatformContentSection>("hero");

  useEffect(() => {
    if (q.data && !content) setContent(q.data.draft.content);
  }, [q.data, content]);

  const save = useMutation({
    mutationFn: (c: PlatformContent) => api("/admin/platform-content/draft", { method: "PUT", json: { content: c } }),
    onSuccess: () => {
      setDirty(false);
      void qc.invalidateQueries({ queryKey: KEY });
      toast("Draft saved");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const publish = useMutation({
    mutationFn: async () => {
      if (content) await api("/admin/platform-content/draft", { method: "PUT", json: { content } });
      return api<{ version: number }>("/admin/platform-content/publish", { method: "POST" });
    },
    onSuccess: (r) => {
      setDirty(false);
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ["platform-content"] });
      toast(`Published v${r.version} — live for visitors`);
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const discard = useMutation({
    mutationFn: () => api("/admin/platform-content/discard", { method: "POST" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEY });
      const fresh = await qc.fetchQuery<PlatformContentState>({ queryKey: KEY, queryFn: () => api("/admin/platform-content") });
      setContent(fresh.published.content);
      setDirty(false);
      toast("Draft discarded", "info");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });

  const meta = useMemo(() => PLATFORM_SECTION_META.find((m) => m.key === active)!, [active]);
  if (!q.data || !content) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  const section = content[active] as unknown as Section;
  const update = (patch: Section) => {
    setContent({ ...content, [active]: { ...section, ...patch } } as PlatformContent);
    setDirty(true);
  };
  const hasDraft = q.data.draft.exists || dirty;
  const published = q.data.published;

  return (
    <div>
      <PageTitle
        title="Platform landing"
        sub="Every text block on advisor-platform.com, including the AI now/roadmap tags, FAQ, testimonials and founder note. Draft → publish; visitors never see drafts."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {hasDraft ? <Pill tone="amber">Draft {dirty ? "· unsaved" : "· saved"}</Pill> : <Pill tone="green">In sync with live</Pill>}
            <a href="/?preview=1" target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm" className="h-10">
                Preview draft ↗
              </Button>
            </a>
            <a href="/" target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm" className="h-10">
                View live ↗
              </Button>
            </a>
            <Button variant="ghost" size="sm" className="h-10 border border-line" disabled={!hasDraft} loading={discard.isPending} onClick={() => discard.mutate()}>
              Discard
            </Button>
            <Button variant="secondary" size="sm" className="h-10" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(content)}>
              Save draft
            </Button>
            <Button size="sm" className="h-10" disabled={!hasDraft} loading={publish.isPending} onClick={() => publish.mutate()}>
              Publish
            </Button>
          </div>
        }
      />
      <div className="mt-2 text-[12.5px] font-semibold text-muted">
        Live: v{published.version}
        {published.publishedAt ? ` · published ${new Date(published.publishedAt).toLocaleString()}` : " · defaults (never published)"}
      </div>
      <div className="mt-[22px] grid grid-cols-[220px_minmax(0,1fr)] gap-4 max-md:grid-cols-1">
        <nav aria-label="Sections" className="flex h-fit flex-col gap-1 rounded-[18px] border border-line bg-white p-2 max-md:flex-row max-md:flex-wrap">
          {PLATFORM_SECTION_META.map((m) => (
            <button key={m.key} type="button" onClick={() => setActive(m.key)} className={cn("rounded-[10px] px-3 py-2.5 text-left text-[13.5px] font-bold transition-colors", active === m.key ? "bg-blue text-white" : "text-body hover:bg-pale")}>
              {m.label}
            </button>
          ))}
        </nav>
        <div className="flex flex-col gap-5 rounded-[18px] border border-line bg-white p-6">
          <div className="font-display text-[18px] font-bold text-navy">{meta.label}</div>
          {meta.fields.length > 0 && (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              {meta.fields.map((f) => (
                <div key={f.key} className={f.kind === "textarea" ? "md:col-span-2" : ""}>
                  <FieldInput field={f} value={String(section[f.key] ?? "")} onChange={(v) => update({ [f.key]: v })} />
                </div>
              ))}
            </div>
          )}
          {meta.lists.map((list) => (
            <ListEditor key={list.key} label={list.label} itemLabel={list.itemLabel} itemFields={list.itemFields} items={(section[list.key] as unknown[]) ?? []} onChange={(items) => update({ [list.key]: items })} />
          ))}
          {active === "ai" && <Alert tone="info">Keep the status tags honest: only mark an item “Available now” when the capability has shipped.</Alert>}
        </div>
      </div>
    </div>
  );
}

function FieldInput({ field, value, onChange, id }: { field: PlatformField; value: string; onChange: (v: string) => void; id?: string }) {
  const inputId = id ?? `pc-${field.key}`;
  if (field.kind === "textarea") {
    return (
      <Field label={field.label} htmlFor={inputId}>
        <Textarea id={inputId} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      </Field>
    );
  }
  if (field.kind === "select") {
    return (
      <Field label={field.label} htmlFor={inputId}>
        <Select id={inputId} value={value} onChange={(e) => onChange(e.target.value)}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  if (field.kind === "color") {
    return (
      <Field label={field.label} htmlFor={inputId}>
        <div className="flex items-center gap-2">
          <input type="color" aria-label={`${field.label} picker`} value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#1668F0"} onChange={(e) => onChange(e.target.value)} className="h-11 w-12 cursor-pointer rounded-input border border-line bg-white p-1" />
          <Input id={inputId} value={value} onChange={(e) => onChange(e.target.value)} />
        </div>
      </Field>
    );
  }
  return (
    <Field label={field.label} htmlFor={inputId}>
      <Input id={inputId} type={field.kind === "url" ? "url" : "text"} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function ListEditor({ label, itemLabel, itemFields, items, onChange }: { label: string; itemLabel: string; itemFields: PlatformField[]; items: unknown[]; onChange: (items: unknown[]) => void }) {
  const isStrings = itemFields.length === 0;
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => onChange([...items, isStrings ? "" : Object.fromEntries(itemFields.map((f) => [f.key, f.kind === "select" ? (f.options?.[0]?.value ?? "") : ""]))]);
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-[11.5px] font-bold tracking-[0.1em] text-muted-2">{label.toUpperCase()}</div>
        <Button type="button" variant="secondary" size="sm" onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Add {itemLabel.toLowerCase()}
        </Button>
      </div>
      <div className="mt-2.5 flex flex-col gap-2.5">
        {items.map((item, i) => (
          <div key={i} className="rounded-[12px] border border-line-soft bg-[#F7FBFF] p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[12px] font-bold text-muted">
                {itemLabel} {i + 1}
              </div>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Move up" onClick={() => move(i, -1)} className="rounded p-1 text-muted hover:bg-pale hover:text-navy disabled:opacity-30" disabled={i === 0}>
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Move down" onClick={() => move(i, 1)} className="rounded p-1 text-muted hover:bg-pale hover:text-navy disabled:opacity-30" disabled={i === items.length - 1}>
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Remove" onClick={() => onChange(items.filter((_, k) => k !== i))} className="rounded p-1 text-muted hover:bg-[#FDECE9] hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {isStrings ? (
              <Input aria-label={`${itemLabel} ${i + 1}`} value={String(item ?? "")} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {itemFields.map((f) => (
                  <div key={f.key} className={f.kind === "textarea" ? "md:col-span-2" : ""}>
                    <FieldInput id={`pc-${label}-${i}-${f.key}`} field={f} value={String((item as Record<string, unknown>)[f.key] ?? "")} onChange={(v) => onChange(items.map((x, k) => (k === i ? { ...(x as Record<string, unknown>), [f.key]: v } : x)))} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <div className="text-[13px] font-semibold text-muted">Nothing here yet.</div>}
      </div>
    </div>
  );
}
