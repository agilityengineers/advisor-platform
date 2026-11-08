import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DNS_PROVIDER_LABELS, DNS_PROVIDERS, PERMISSIONS, type IntegrationDef, type PermissionArea, type Perms } from "@workspace/shared";
import { api, errorMessage } from "@/lib/api";
import { cn, initials } from "@/lib/utils";
import { Alert, Button, Field, Input, Select, Spinner } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { INT_STATUS, type IntegrationView, type SettingsResponse, type Summary } from "./types";

type Tab = "branding" | "domain" | "integrations" | "team";

export function SettingsPanel({ companyId, summary }: { companyId: number; summary: Summary }) {
  const [tab, setTab] = useState<Tab>("branding");
  const key = ["company", companyId, "settings"];
  const q = useQuery<SettingsResponse>({ queryKey: key, queryFn: () => api(`/companies/${companyId}/settings`) });

  return (
    <div id="settings" className="overflow-hidden rounded-[18px] border border-line bg-white">
      <div className="flex flex-wrap items-center gap-3.5 border-b border-line-soft px-6 py-5">
        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="text-[12px] font-bold tracking-[0.1em] text-blue-hover">COMPANY SETTINGS</div>
          <h2 className="mt-2 font-display text-[19px] font-bold text-navy">{summary.company.name}</h2>
          <div className="mt-1 text-[13px] font-semibold text-muted">
            Plan: {summary.plan.name} · Admin: {summary.company.ownerName}
          </div>
        </div>
        <div className="inline-flex flex-wrap rounded-pill border border-line bg-page p-[3px]">
          {(["branding", "domain", "integrations", "team"] as Tab[]).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={cn("whitespace-nowrap rounded-pill px-3.5 py-2 text-[13px] font-bold capitalize", tab === t ? "bg-navy text-white" : "text-body-2")}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {!q.data ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <>
          {tab === "branding" && <BrandingTab companyId={companyId} data={q.data} />}
          {tab === "domain" && <DomainTab companyId={companyId} data={q.data} />}
          {tab === "integrations" && <IntegrationsTab companyId={companyId} data={q.data} />}
          {tab === "team" && <TeamTab companyId={companyId} summary={summary} hasFeature={q.data.features.team_management} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

function BrandingTab({ companyId, data }: { companyId: number; data: SettingsResponse }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [b, setB] = useState(data.branding);
  useEffect(() => setB(data.branding), [data.branding]);
  const save = useMutation({
    mutationFn: () => api(`/companies/${companyId}/settings/branding`, { method: "PUT", json: b }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["company", companyId] });
      void qc.invalidateQueries({ queryKey: ["tenant"] });
      toast("Branding saved");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const dirty = JSON.stringify(b) !== JSON.stringify(data.branding);
  const whiteLabel = data.features.white_label;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] items-start gap-[22px] px-6 py-[22px]">
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {!whiteLabel && <Alert tone="warn">🔒 White label isn't in your plan — logo and colors fall back to the platform defaults on your site.</Alert>}
        <Field label="Company name" htmlFor="br-name">
          <Input id="br-name" className="bg-[#F7FBFF]" value={b.companyName} onChange={(e) => setB({ ...b, companyName: e.target.value })} required />
        </Field>
        <Field label="Tagline" htmlFor="br-tag">
          <Input id="br-tag" className="bg-[#F7FBFF]" value={b.tagline} onChange={(e) => setB({ ...b, tagline: e.target.value })} />
        </Field>
        <Field label="Logo URL" hint="SVG or PNG with a transparent background. Paste a hosted URL." htmlFor="br-logo">
          <Input id="br-logo" className="bg-[#F7FBFF]" value={b.logoUrl} onChange={(e) => setB({ ...b, logoUrl: e.target.value })} placeholder="https://…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <ColorField id="br-primary" label="Primary color" value={b.primaryColor} onChange={(v) => setB({ ...b, primaryColor: v })} />
          <ColorField id="br-accent" label="Accent / dark" value={b.accentColor} onChange={(v) => setB({ ...b, accentColor: v })} />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={!dirty} loading={save.isPending}>
            Save branding
          </Button>
        </div>
      </form>
      <div className="rounded-[14px] border border-line bg-page p-4">
        <div className="text-[11.5px] font-bold tracking-[0.08em] text-muted-2">PREVIEW</div>
        <div className="mt-3 overflow-hidden rounded-[12px] border border-line bg-white">
          <div className="flex items-center justify-between border-b border-[#EEF4FC] px-3.5 py-2.5">
            {b.logoUrl ? <div role="img" aria-label="Logo preview" className="h-[22px] w-[110px] bg-contain bg-left bg-no-repeat" style={{ backgroundImage: `url(${b.logoUrl})` }} /> : <div className="font-display text-[14px] font-bold text-navy">{b.companyName}</div>}
            <div className="rounded-pill px-2.5 py-1.5 text-[11px] font-bold text-white" style={{ background: b.primaryColor }}>
              Get my audit
            </div>
          </div>
          <div className="p-3.5">
            <div className="h-2.5 w-[70%] rounded-[5px]" style={{ background: b.accentColor }} />
            <div className="mt-2 h-1.5 w-[90%] rounded-[3px] bg-line-soft" />
            <div className="mt-1.5 h-1.5 w-[60%] rounded-[3px] bg-line-soft" />
          </div>
        </div>
        <div className="mt-2.5 text-[12px] font-semibold text-muted">Colors are injected as CSS variables on your site; your white-label branding wins over platform defaults.</div>
      </div>
    </div>
  );
}

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input id={id} type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#1668F0"} onChange={(e) => onChange(e.target.value)} className="h-10 w-[42px] cursor-pointer rounded-[8px] border border-line bg-white p-[2px]" />
        <span className="font-mono text-[13px] text-body-2">{value}</span>
      </div>
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

function DomainTab({ companyId, data }: { companyId: number; data: SettingsResponse }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const custom = data.domain.custom;
  const [domain, setDomain] = useState(custom?.domain ?? "");
  const [provider, setProvider] = useState(custom?.provider ?? "");
  const whiteLabel = data.features.white_label;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["company", companyId] });
  };
  const add = useMutation({
    mutationFn: () => api(`/companies/${companyId}/settings/domain`, { method: "POST", json: { domain, provider: provider || "other" } }),
    onSuccess: () => {
      refresh();
      toast("Domain saved — add the DNS records, then verify");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const verify = useMutation({
    mutationFn: () => api<{ verified: boolean }>(`/companies/${companyId}/settings/domain/verify`, { method: "POST" }),
    onSuccess: () => {
      refresh();
      toast("Domain verified · SSL provisioning");
    },
    onError: (e) => {
      refresh();
      toast(errorMessage(e), "error");
    },
  });
  const setProviderMut = useMutation({
    mutationFn: (p: string) => api(`/companies/${companyId}/settings/domain`, { method: "PATCH", json: { provider: p } }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api(`/companies/${companyId}/settings/domain`, { method: "DELETE" }),
    onSuccess: () => {
      setDomain("");
      refresh();
      toast("Custom domain removed", "info");
    },
  });
  const statusColor = !custom ? "#6A809A" : custom.verified ? "#1E7A4C" : "#8A6320";
  const statusText = !custom ? "No custom domain — your subdomain is live." : custom.verified ? `Verified · SSL ${custom.sslStatus} · serving ${custom.domain}` : `Waiting for DNS records · we re-check every 10 minutes for 48 hours${custom.lastError ? ` · ${custom.lastError}` : ""}`;
  const records = custom
    ? [
        { type: "CNAME", host: custom.records.cname.host, value: custom.records.cname.value },
        { type: "TXT", host: custom.records.txt.host, value: custom.records.txt.value },
        { type: "A", host: `${custom.records.apex.host} (apex, optional)`, value: custom.records.apex.note },
      ]
    : [{ type: "—", host: "Enter a custom domain to generate records", value: "" }];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] items-start gap-[22px] px-6 py-[22px]">
      <div className="flex flex-col gap-3.5">
        <div className="rounded-[12px] border border-line-soft bg-[#F7FBFF] p-3.5">
          <div className="text-[11.5px] font-bold tracking-[0.08em] text-muted-2">PLATFORM SUBDOMAIN · ALWAYS ON</div>
          <div className="mt-1.5 break-all text-[14.5px] font-bold text-navy">{data.domain.subdomain}</div>
          <div className="mt-1 text-[12.5px] font-bold text-success-deep">● Live · SSL active</div>
        </div>
        {!whiteLabel && <Alert tone="warn">🔒 Custom domains require the White Label feature.</Alert>}
        <Field label="Custom domain" htmlFor="dm-custom">
          <div className="flex gap-2">
            <Input id="dm-custom" className="bg-[#F7FBFF]" placeholder="www.yourcompany.com" value={domain} disabled={!whiteLabel} onChange={(e) => setDomain(e.target.value)} />
            {custom && custom.domain === domain.trim().toLowerCase() ? (
              <Button className="rounded-input" disabled={!whiteLabel || custom.verified} loading={verify.isPending} onClick={() => verify.mutate()}>
                {custom.verified ? "Verified" : "Verify"}
              </Button>
            ) : (
              <Button className="rounded-input" disabled={!whiteLabel || !domain.trim()} loading={add.isPending} onClick={() => add.mutate()}>
                Save
              </Button>
            )}
          </div>
        </Field>
        <Field label="Where is your DNS?" htmlFor="dm-provider">
          <Select id="dm-provider" className="bg-[#F7FBFF]" value={provider} disabled={!whiteLabel} onChange={(e) => { setProvider(e.target.value); if (custom) setProviderMut.mutate(e.target.value); }}>
            <option value="">Choose a provider for step-by-step help</option>
            {DNS_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {DNS_PROVIDER_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center gap-2.5 text-[13.5px] font-bold" style={{ color: statusColor }}>
          <span className="h-[9px] w-[9px] rounded-full" style={{ background: statusColor }} />
          {statusText}
        </div>
        {custom && (
          <button type="button" onClick={() => window.confirm(`Remove ${custom.domain}? Your subdomain keeps working.`) && remove.mutate()} className="self-start text-[12.5px] font-bold text-muted hover:text-danger">
            Remove custom domain
          </button>
        )}
      </div>
      <div className="rounded-[14px] border border-line bg-page p-4">
        <div className="text-[11.5px] font-bold tracking-[0.08em] text-muted-2">DNS RECORDS TO ADD {provider ? `· ${DNS_PROVIDER_LABELS[provider as keyof typeof DNS_PROVIDER_LABELS]?.toUpperCase() ?? ""}` : ""}</div>
        <div className="mt-3 flex flex-col gap-2">
          {records.map((r, i) => (
            <div key={i} className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-[10px] border border-line-soft bg-white px-3 py-[11px] text-[12.5px]">
              <div className="font-bold text-blue-hover">{r.type}</div>
              <div className="break-all font-mono text-navy">{r.host}</div>
              {r.value && (
                <>
                  <div className="font-bold text-muted-2">value</div>
                  <div className="break-all font-mono text-body-2">{r.value}</div>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2.5 text-[12px] font-semibold leading-[1.55] text-muted">{data.dnsProviderSteps[provider] ?? "Pick your DNS provider for exact steps. GoDaddy and Cloudflare are the most common."}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

const FEATURE_FOR = { sendgrid: "sendgrid", twilio: "twilio_sms", stripe: "stripe_checkout", calendly: "calendly" } as const;

function IntegrationsTab({ companyId, data }: { companyId: number; data: SettingsResponse }) {
  const { toast } = useToast();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("stripe");
    if (!result) return;
    const msg: Record<string, [string, "success" | "error" | "info"]> = { connected: ["Stripe connected — checkout is live on your pricing page", "success"], denied: ["Stripe connection was cancelled", "info"], failed: ["Stripe couldn't complete the connection. Try again or paste your account id.", "error"], invalid_state: ["That Stripe link expired. Start again from Integrations.", "error"] };
    const m = msg[result];
    if (m) toast(m[0], m[1]);
    params.delete("stripe");
    window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`);
  }, [toast]);
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-4 px-6 py-[22px]">
      {data.integrationDefs.map((def) => (
        <IntegrationCard key={def.provider} companyId={companyId} def={def} view={data.integrations.find((v) => v.provider === def.provider)!} locked={!data.features[FEATURE_FOR[def.provider]]} />
      ))}
    </div>
  );
}

function IntegrationCard({ companyId, def, view, locked }: { companyId: number; def: IntegrationDef; view: IntegrationView; locked: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [config, setConfig] = useState<Record<string, string | boolean>>(view.config);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  useEffect(() => setConfig(view.config), [view.config]);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["company", companyId] });
  const save = useMutation({
    mutationFn: () => api<IntegrationView>(`/companies/${companyId}/settings/integrations/${def.provider}`, { method: "PUT", json: { config, secrets } }),
    onSuccess: (v) => {
      setSecrets({});
      refresh();
      toast(v.status === "connected" ? `${def.name} connected` : v.status === "pending" ? `${def.name} saved · ${v.lastError ?? "pending verification"}` : (v.lastError ?? `${def.name} saved`), v.status === "error" ? "error" : v.status === "connected" ? "success" : "info");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const verify = useMutation({
    mutationFn: () => api<IntegrationView>(`/companies/${companyId}/settings/integrations/${def.provider}/verify`, { method: "POST" }),
    onSuccess: (v) => {
      refresh();
      toast(v.status === "connected" ? `${def.name} verified` : (v.lastError ?? "Still pending"), v.status === "connected" ? "success" : "info");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const disconnect = useMutation({
    mutationFn: () => api(`/companies/${companyId}/settings/integrations/${def.provider}/disconnect`, { method: "POST" }),
    onSuccess: () => {
      refresh();
      toast(`${def.name} disconnected`, "info");
    },
  });
  const connectStripe = useMutation({
    mutationFn: () => api<{ url: string | null; available: boolean }>(`/companies/${companyId}/settings/integrations/stripe/connect-url`),
    onSuccess: (r) => {
      if (r.url) window.location.assign(r.url);
      else toast("Stripe Connect isn't configured on the platform yet — paste your account id (acct_…) instead.", "info");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const registerWebhook = useMutation({
    mutationFn: () => api<{ ok: boolean }>(`/companies/${companyId}/settings/integrations/calendly/webhook`, { method: "POST" }),
    onSuccess: () => {
      refresh();
      toast("Calendly webhook registered — bookings now post back to the pipeline and portal");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const st = INT_STATUS[view.status];
  const connected = view.status === "connected";
  const webhookOn = Boolean(view.config.webhooks) && Boolean(view.config.webhookSubscriptionUri);
  return (
    <div className={cn("flex flex-col gap-3 rounded-card border border-line-soft bg-[#F7FBFF] p-[18px]", locked && "opacity-60")}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[12px] font-bold" style={{ background: st.bg, color: st.fg }}>
          {def.abbr}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-navy">{def.name}</div>
          <div className="text-[12.5px] font-semibold text-muted">{def.purpose}</div>
        </div>
        <span className="whitespace-nowrap rounded-pill px-[9px] py-1 text-[11px] font-bold" style={{ background: st.bg, color: st.fg }}>
          {st.label}
        </span>
      </div>
      {locked ? (
        <div className="text-[12.5px] font-bold text-warn-deep">🔒 Not included in your plan.</div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="flex flex-col gap-2">
            {def.fields.map((f) => {
              const id = `int-${def.provider}-${f.key}`;
              if (f.secret) {
                const s = view.secrets[f.key];
                return (
                  <Field key={f.key} label={f.label} hint={s?.set ? `Saved · ends in ${s.last4}. Enter a new value to replace it.` : undefined} htmlFor={id}>
                    <Input id={id} type="password" autoComplete="off" className="h-10 bg-white text-[13.5px]" placeholder={s?.set ? "••••••••" : f.placeholder} value={secrets[f.key] ?? ""} onChange={(e) => setSecrets({ ...secrets, [f.key]: e.target.value })} />
                  </Field>
                );
              }
              return (
                <Field key={f.key} label={f.label} htmlFor={id}>
                  <Input id={id} type={f.type} className="h-10 bg-white text-[13.5px]" placeholder={f.placeholder} value={String(config[f.key] ?? "")} onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })} />
                </Field>
              );
            })}
            {def.toggles.map((t) => (
              <label key={t.key} className="flex cursor-pointer items-center gap-[9px] text-[13px] font-semibold text-[#16283D]">
                <input type="checkbox" className="h-4 w-4 accent-blue" checked={Boolean(config[t.key])} onChange={(e) => setConfig({ ...config, [t.key]: e.target.checked })} />
                {t.label}
              </label>
            ))}
          </div>
          {view.lastError && view.status !== "connected" && <div className="text-[12.5px] font-bold text-warn-deep">{view.lastError}</div>}
          {def.provider === "stripe" && !connected && (
            <Button type="button" size="sm" className="self-start bg-[#635BFF] hover:bg-[#4f46e5] shadow-none" loading={connectStripe.isPending} onClick={() => connectStripe.mutate()}>
              Connect with Stripe
            </Button>
          )}
          {def.provider === "calendly" && view.secrets.token?.set && (
            <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line-soft bg-white px-3 py-2 text-[12.5px] font-semibold text-body">
              <span className={cn("h-2 w-2 rounded-full", webhookOn ? "bg-success" : "bg-warn")} />
              {webhookOn ? "Webhook active · invitee.created updates the pipeline and portal" : "Webhook not registered — bookings won't post back yet"}
              {!webhookOn && connected && (
                <Button type="button" size="sm" variant="secondary" className="ml-auto h-8 px-3 text-[12px]" loading={registerWebhook.isPending} onClick={() => registerWebhook.mutate()}>
                  Register webhook
                </Button>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" loading={save.isPending}>
              {connected ? "Save changes" : def.connectLabel}
            </Button>
            {view.status === "pending" && (
              <Button type="button" size="sm" variant="secondary" loading={verify.isPending} onClick={() => verify.mutate()}>
                Verify now
              </Button>
            )}
            {view.status !== "not_connected" && (
              <Button type="button" size="sm" variant="ghost" className="border border-[#F0D6D0] text-danger" loading={disconnect.isPending} onClick={() => window.confirm(`Disconnect ${def.name}? Saved keys are deleted.`) && disconnect.mutate()}>
                Disconnect
              </Button>
            )}
            <div className="text-[12px] font-semibold text-muted">{def.note}</div>
          </div>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

interface TeamResponse {
  members: { id: number; name: string; email: string; role: string; perms: Perms; hasPassword: boolean; deactivatedAt: string | null }[];
  invites: { id: number; email: string; name: string; role: string; expired: boolean }[];
}

function TeamTab({ companyId, summary, hasFeature }: { companyId: number; summary: Summary; hasFeature: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = ["company", companyId, "team"];
  const q = useQuery<TeamResponse>({ queryKey: key, queryFn: () => api(`/companies/${companyId}/team`), enabled: hasFeature });
  const [invite, setInvite] = useState({ name: "", email: "", role: "advisor" as "manager" | "advisor" });
  const refresh = () => void qc.invalidateQueries({ queryKey: key });
  const send = useMutation({
    mutationFn: () => api<{ emailed: boolean; devLink?: string }>(`/companies/${companyId}/team/invites`, { method: "POST", json: invite }),
    onSuccess: (r) => {
      refresh();
      setInvite({ name: "", email: "", role: "advisor" });
      toast(r.emailed ? `Invitation sent to ${invite.email}` : r.devLink ? `Email isn't configured — invite link: ${r.devLink}` : "Invitation recorded", r.emailed ? "success" : "info");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const setPerm = useMutation({
    mutationFn: ({ userId, perms }: { userId: number; perms: Perms }) => api(`/companies/${companyId}/team/${userId}`, { method: "PATCH", json: { perms } }),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const remove = useMutation({
    mutationFn: (userId: number) => api(`/companies/${companyId}/team/${userId}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const revoke = useMutation({
    mutationFn: (inviteId: number) => api(`/companies/${companyId}/team/invites/${inviteId}`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  return (
    <div className="px-6 py-[22px]">
      {!hasFeature && <Alert tone="warn" className="mb-3.5">🔒 Team management isn't in your plan ({summary.plan.name}). You can still see your own seat.</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] font-semibold text-muted">Managers and client advisors get read / write per area. Admins have everything.</div>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <Input className="h-10 w-[150px] bg-[#F7FBFF] text-[13.5px]" placeholder="Name" value={invite.name} disabled={!hasFeature} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
          <Input className="h-10 w-[200px] bg-[#F7FBFF] text-[13.5px]" type="email" placeholder="Email" required value={invite.email} disabled={!hasFeature} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          <Select className="h-10 w-auto bg-[#F7FBFF] text-[13.5px]" value={invite.role} disabled={!hasFeature} onChange={(e) => setInvite({ ...invite, role: e.target.value as typeof invite.role })}>
            <option value="manager">Manager</option>
            <option value="advisor">Client advisor</option>
          </Select>
          <Button type="submit" size="sm" className="h-10 rounded-[9px]" disabled={!hasFeature} loading={send.isPending}>
            Invite
          </Button>
        </form>
      </div>
      {hasFeature && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="bg-[#F7FBFF]">
                <th scope="col" className="border-b border-line-soft px-3.5 py-[11px] text-left text-[11.5px] font-bold tracking-[0.09em] text-muted-2">
                  MEMBER
                </th>
                {PERMISSIONS.map((p) => (
                  <th key={p.key} scope="col" className="whitespace-nowrap border-b border-line-soft px-2 py-[11px] text-center text-[11.5px] font-bold tracking-[0.09em] text-muted-2">
                    {p.label.toUpperCase()}
                  </th>
                ))}
                <th scope="col" className="border-b border-line-soft" />
              </tr>
            </thead>
            <tbody>
              {(q.data?.members ?? []).map((m) => (
                <tr key={m.id} className={cn("border-b border-[#EEF4FC]", m.deactivatedAt && "opacity-50")}>
                  <td className="px-3.5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pale text-[11.5px] font-bold text-blue-hover">{initials(m.name)}</div>
                      <div>
                        <div className="text-[14px] font-bold text-navy">{m.name}</div>
                        <div className="text-[12px] font-semibold text-muted">
                          {m.email} · <span className="capitalize">{m.role === "advisor" ? "Client advisor" : m.role}</span>
                          {!m.hasPassword && " · invited"}
                        </div>
                      </div>
                    </div>
                  </td>
                  {PERMISSIONS.map((p) => {
                    const v = m.perms[p.key as PermissionArea] ?? "none";
                    return (
                      <td key={p.key} className="px-2 py-3 text-center">
                        {m.role === "admin" ? (
                          <span className="text-[11.5px] font-bold text-success-deep">All</span>
                        ) : (
                          <select aria-label={`${p.label} access for ${m.name}`} value={v} onChange={(e) => setPerm.mutate({ userId: m.id, perms: { ...m.perms, [p.key]: e.target.value as Perms[PermissionArea] } })} className="rounded-[7px] border border-line px-2 py-1.5 text-[12px] font-bold" style={{ background: v === "write" ? "#EDF7F1" : v === "read" ? "#EAF2FD" : "#FFFFFF", color: v === "write" ? "#1E7A4C" : v === "read" ? "#0B4FD0" : "#6A809A" }}>
                            <option value="none">None</option>
                            <option value="read">Read</option>
                            <option value="write">Write</option>
                          </select>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3.5 py-3 text-right">
                    {m.role !== "admin" && !m.deactivatedAt && (
                      <button type="button" onClick={() => window.confirm(`Remove ${m.name} from the team?`) && remove.mutate(m.id)} className="rounded-pill border border-[#F0D6D0] bg-white px-2.5 py-1.5 text-[12px] font-bold text-danger">
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {(q.data?.invites ?? []).map((i) => (
                <tr key={`inv-${i.id}`} className="border-b border-[#EEF4FC] bg-[#FFFCF7]">
                  <td className="px-3.5 py-3" colSpan={PERMISSIONS.length + 1}>
                    <span className="text-[13.5px] font-bold text-navy">{i.name || i.email}</span> <span className="text-[12px] font-semibold text-muted">· {i.email} · invited as {i.role}</span>{" "}
                    <span className={cn("rounded-pill px-2 py-[3px] text-[11px] font-bold", i.expired ? "bg-[#FDECE9] text-danger" : "bg-[#FFF8F0] text-warn-deep")}>{i.expired ? "EXPIRED" : "PENDING"}</span>
                  </td>
                  <td className="px-3.5 py-3 text-right">
                    <button type="button" onClick={() => revoke.mutate(i.id)} className="text-[12px] font-bold text-muted hover:text-danger">
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
