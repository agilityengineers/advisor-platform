import { useState } from "react";
import { featureLabel } from "@workspace/shared";
import { Button, Field, Input, Modal, PageTitle, Spinner, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { usePlans, useUpdatePlan } from "./Registry";
import { money } from "./types";

export function PlansPage() {
  const q = usePlans();
  const update = useUpdatePlan();
  const [editing, setEditing] = useState<{ key: string; name: string; price: string; desc: string } | null>(null);
  if (!q.data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  return (
    <div>
      <PageTitle title="Plans" sub="What a company gets by default. Super admin can still override any feature per company." />
      <div className="mt-[22px] grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
        {q.data.plans.map((p) => {
          const dark = p.key === "white_label";
          return (
            <div key={p.key} className={cn("flex flex-col rounded-[18px] border p-[22px]", dark ? "border-navy bg-navy text-white" : "border-line bg-white text-navy")}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-display text-[19px] font-bold">{p.name}</div>
                <button type="button" onClick={() => setEditing({ key: p.key, name: p.name, price: p.price == null ? "" : String(p.price), desc: p.desc })} className={cn("text-[12px] font-bold", dark ? "text-[#7FB6FF]" : "text-blue")}>
                  Edit
                </button>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <div className="font-display text-[30px] font-bold tracking-[-0.02em]">{p.price == null ? "Custom" : money(p.price)}</div>
                {p.price != null && <div className="text-[12.5px] font-semibold opacity-70">/ month</div>}
              </div>
              <div className="mt-1.5 text-[13.5px] opacity-80">{p.desc}</div>
              <div className="mt-4 flex flex-1 flex-col gap-1.5">
                {p.featureKeys.map((k) => (
                  <div key={k} className="flex gap-2 text-[13px] font-semibold">
                    <span className="text-blue">✓</span>
                    {featureLabel(k)}
                  </div>
                ))}
                {p.featureKeys.length === 0 && <div className="text-[13px] font-semibold opacity-60">No features yet — tick them in the registry.</div>}
              </div>
              <div className="mt-4 text-[12px] font-bold opacity-70">
                {p.companies} compan{p.companies === 1 ? "y" : "ies"} on this plan
              </div>
            </div>
          );
        })}
      </div>
      {editing && (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)} width={460}>
          <form
            className="flex flex-col gap-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate({ key: editing.key, body: { name: editing.name.trim(), desc: editing.desc.trim(), price: editing.price.trim() === "" ? null : Number(editing.price) } }, { onSuccess: () => setEditing(null) });
            }}
          >
            <Field label="Name" htmlFor="pl-name">
              <Input id="pl-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
            </Field>
            <Field label="Monthly price (USD)" hint="Leave blank for a custom / contact-us plan." htmlFor="pl-price">
              <Input id="pl-price" type="number" min={0} step={1} value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
            </Field>
            <Field label="Description" htmlFor="pl-desc">
              <Textarea id="pl-desc" rows={2} value={editing.desc} onChange={(e) => setEditing({ ...editing, desc: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2.5">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={update.isPending}>
                Save plan
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
