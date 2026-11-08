import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FEATURE_REGISTRY } from "@workspace/shared";
import { api, errorMessage } from "@/lib/api";
import { PageTitle, Spinner } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { OVERVIEW_KEY } from "./AdminLayout";

interface PlansResponse {
  plans: { id: number; key: string; name: string; price: number | null; desc: string; featureKeys: string[]; sort: number; companies: number }[];
}

export const PLANS_KEY = ["admin", "plans"];
export const usePlans = () => useQuery<PlansResponse>({ queryKey: PLANS_KEY, queryFn: () => api("/admin/plans") });

export function useUpdatePlan() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: Record<string, unknown> }) => api(`/admin/plans/${key}`, { method: "PATCH", json: body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PLANS_KEY });
      void qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
}

export function RegistryPage() {
  const q = usePlans();
  const update = useUpdatePlan();
  if (!q.data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  const plans = q.data.plans;
  return (
    <div>
      <PageTitle title="Feature registry" sub="Every switch in the platform, and which plans include it. Tick a cell to change a plan's entitlements." />
      <div className="mt-[22px] overflow-hidden rounded-[18px] border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="bg-[#F7FBFF]">
                <th scope="col" className="border-b border-line-soft px-5 py-[13px] text-left text-[11.5px] font-bold tracking-[0.09em] text-muted-2">
                  FEATURE
                </th>
                {plans.map((p) => (
                  <th key={p.key} scope="col" className="whitespace-nowrap border-b border-line-soft px-3 py-[13px] text-center text-[11.5px] font-bold tracking-[0.09em] text-muted-2">
                    {p.name.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_REGISTRY.map((f) => (
                <tr key={f.key} className="border-b border-[#EEF4FC]">
                  <td className="px-5 py-[13px]">
                    <div className="flex items-center gap-2.5">
                      <span className="rounded-pill bg-[#F1F4F8] px-[7px] py-[3px] text-[10px] font-bold uppercase tracking-[0.08em] text-muted-2">{f.category}</span>
                      <div>
                        <div className="text-[14px] font-bold text-navy">{f.label}</div>
                        <div className="text-[12px] font-semibold text-muted">
                          {f.desc} · <span className="font-mono">{f.key}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  {plans.map((p) => {
                    const on = p.featureKeys.includes(f.key);
                    return (
                      <td key={p.key} className="px-3 py-[13px] text-center">
                        <button
                          type="button"
                          aria-label={`${on ? "Remove from" : "Add to"} ${p.name}`}
                          aria-pressed={on}
                          disabled={update.isPending}
                          onClick={() => update.mutate({ key: p.key, body: { featureKeys: on ? p.featureKeys.filter((k) => k !== f.key) : [...p.featureKeys, f.key] } })}
                          className="h-[26px] w-[26px] rounded-full border-[1.5px] text-[12px] font-bold text-white transition-colors"
                          style={{ borderColor: on ? "#1668F0" : "#D8E5F5", background: on ? "#1668F0" : "#FFFFFF" }}
                        >
                          {on ? "✓" : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
