import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FEATURE_REGISTRY, INTEGRATION_PROVIDERS, type FeatureKey } from "@workspace/shared";
import { api, errorMessage } from "@/lib/api";
import { cn, initials } from "@/lib/utils";
import { Alert, Button, Drawer, Field, Input, KpiTile, Modal, PageTitle, Pill, SectionLabel, Segmented, Select, Spinner, Textarea } from "@/components/ui";
import { enterImpersonation, type StartImpersonationResponse } from "@/lib/impersonation";
import { useToast } from "@/hooks/use-toast";
import { OVERVIEW_KEY, useOverview } from "./AdminLayout";
import { INTEGRATION_ABBR, INTEGRATION_NAME, INTEGRATION_STYLE, STATUS_TONE, money, type CompanyDetail, type CompanyRow, type Overview } from "./types";

function domainDot(row: CompanyRow): string {
  if (!row.domain.custom) return "#9AAABF";
  return row.domain.verified ? "#2FBF71" : "#E39A2B";
}

export function CompaniesPage() {
  const overview = useOverview();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(useSearch());
  const selectedId = params.get("company") ? Number(params.get("company")) : null;
  const [createOpen, setCreateOpen] = useState(false);
  const [impersonate, setImpersonate] = useState<{ companyId: number; userId?: number } | null>(null);

  if (overview.isLoading || !overview.data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  const o = overview.data;
  return (
    <div>
      <PageTitle
        title="Companies"
        sub="Every Admin is a company. Plan sets the baseline; overrides win."
        action={
          <Button onClick={() => setCreateOpen(true)} className="shadow-[0_8px_20px_rgba(22,104,240,0.28)]">
            + New company
          </Button>
        }
      />
      <div className="mt-[22px] grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
        <KpiTile label="COMPANIES" value={o.kpis.total} />
        <KpiTile label="ACTIVE" value={o.kpis.active} />
        <KpiTile label="ON TRIAL" value={o.kpis.trial} />
        <KpiTile label="MRR" value={money(o.kpis.mrr)} dark sub={o.kpis.comp ? `${o.kpis.comp} complimentary` : undefined} />
      </div>
      <div className="mt-[22px] overflow-hidden rounded-[18px] border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="bg-[#F7FBFF]">
                {["COMPANY", "ADMIN", "PLAN", "DOMAIN", "INTEGRATIONS", "FEATURES", "STATUS"].map((h, i) => (
                  <th key={h} scope="col" className={cn("border-b border-line-soft text-left text-[11.5px] font-bold tracking-[0.09em] text-muted-2", i === 0 || i === 6 ? "px-5 py-[13px]" : "px-4 py-[13px]")}>
                    {h}
                  </th>
                ))}
                <th scope="col" className="border-b border-line-soft px-5 py-[13px]">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {o.companies.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-[14px] font-semibold text-muted">
                    No companies yet. Create the first one.
                  </td>
                </tr>
              )}
              {o.companies.map((c) => (
                <tr key={c.id} onClick={() => navigate(`/?company=${c.id}`)} className="cursor-pointer border-b border-[#EEF4FC] hover:bg-[#F7FBFF]">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-pale text-[12.5px] font-bold text-blue-hover">{initials(c.name)}</div>
                      <div>
                        <div className="text-[14.5px] font-bold text-navy">{c.name}</div>
                        <div className="text-[12px] font-semibold text-muted">{c.subdomain}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-[13.5px] font-semibold text-body">{c.ownerName}</td>
                  <td className="px-4 py-3.5">
                    <Pill>{c.planName}</Pill>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] font-semibold text-body">
                    <div className="flex items-center gap-[7px]">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: domainDot(c) }} />
                      {c.domain.label}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-[5px]">
                      {INTEGRATION_PROVIDERS.map((p) => {
                        const s = INTEGRATION_STYLE[c.integrations[p]];
                        return (
                          <span key={p} title={`${INTEGRATION_NAME[p]} · ${s.label}`} className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[10px] font-bold" style={{ background: s.bg, color: s.fg }}>
                            {INTEGRATION_ABBR[p]}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-[13px] font-bold text-body">
                    {c.featureCount} / {c.featureTotal}
                  </td>
                  <td className="px-5 py-3.5">
                    <Pill tone={STATUS_TONE[c.status] ?? "grey"} className="capitalize">
                      {c.status}
                    </Pill>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-[32px] whitespace-nowrap px-3 text-[12.5px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImpersonate({ companyId: c.id });
                      }}
                    >
                      Impersonate
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selectedId && <CompanyDrawer companyId={selectedId} overview={o} onClose={() => navigate("/")} onImpersonate={(userId) => setImpersonate({ companyId: selectedId, userId })} />}
      {impersonate && <ImpersonateModal companyId={impersonate.companyId} presetUserId={impersonate.userId} onClose={() => setImpersonate(null)} />}
      {createOpen && <CreateCompanyModal overview={o} onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); navigate(`/?company=${id}`); }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------

function CompanyDrawer({ companyId, overview, onClose, onImpersonate }: { companyId: number; overview: Overview; onClose: () => void; onImpersonate: (userId?: number) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const detail = useQuery<CompanyDetail>({ queryKey: ["admin", "company", companyId], queryFn: () => api(`/admin/companies/${companyId}`) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "company", companyId] });
    void qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
  };
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<CompanyDetail>(`/admin/companies/${companyId}`, { method: "PATCH", json: body }),
    onSuccess: () => refresh(),
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const override = useMutation({
    mutationFn: ({ feature, mode }: { feature: FeatureKey; mode: "plan" | "on" | "off" }) => api<CompanyDetail>(`/admin/companies/${companyId}/overrides/${feature}`, { method: "PUT", json: { mode } }),
    onSuccess: () => refresh(),
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const saveTemplate = useMutation({
    mutationFn: () => api(`/admin/companies/${companyId}/save-template`, { method: "POST" }),
    onSuccess: () => {
      toast("Saved to Templates");
      void qc.invalidateQueries({ queryKey: ["admin", "templates"] });
      void qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const resend = useMutation({
    mutationFn: () => api<{ emailed: boolean; devLink?: string }>(`/admin/companies/${companyId}/resend-invite`, { method: "POST" }),
    onSuccess: (r) => toast(r.emailed ? "Invitation sent" : r.devLink ? `Email not configured — link: ${r.devLink}` : "Invitation recorded (email not configured)", r.emailed ? "success" : "info"),
    onError: (e) => toast(errorMessage(e), "error"),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const d = detail.data;
  const suspended = d?.company.status === "suspended";
  const adminNeedsInvite = d ? !d.team.some((m) => m.role === "admin" && m.hasPassword) : false;

  return (
    <Drawer onClose={onClose} label="Company detail">
      {!d ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-[1] flex items-start gap-3.5 border-b border-line-soft bg-white px-6 py-[22px]">
            <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[12px] bg-pale text-[15px] font-bold text-blue-hover">{initials(d.company.name)}</div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[19px] font-bold text-navy">{d.company.name}</div>
              <div className="text-[13px] font-semibold text-muted">
                Admin: {d.company.ownerName} · {d.company.ownerEmail}
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-line bg-page text-[15px] font-bold text-body-2 hover:bg-pale">
              ×
            </button>
          </div>
          <div className="flex flex-col gap-5 px-6 py-[22px]">
            {suspended && <Alert tone="warn">This company is suspended. Its site and sign-in are unavailable until you reactivate it.</Alert>}
            <div className="flex flex-wrap gap-2.5">
              <Link href={`~/admin/companies/${d.company.id}/console`}>
                <Button size="sm" className="h-[38px] px-4 text-[13.5px]">
                  Open company dashboard →
                </Button>
              </Link>
              <Button size="sm" variant="secondary" className="h-[38px] px-4 text-[13.5px]" onClick={() => onImpersonate()}>
                Impersonate a user…
              </Button>
              <a href={d.publicUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="secondary" className="h-[38px] px-4 text-[13.5px]">
                  View website ↗
                </Button>
              </a>
              <Button size="sm" variant="secondary" className="h-[38px] px-3.5 text-[13px]" loading={saveTemplate.isPending} onClick={() => saveTemplate.mutate()}>
                {saveTemplate.isSuccess ? "✓ Saved to Templates" : "Save page as template"}
              </Button>
              <Button size="sm" variant="ghost" className="ml-auto h-[38px] border border-line px-3.5 text-[13px] text-body-2" loading={patch.isPending} onClick={() => patch.mutate({ status: suspended ? "active" : "suspended" })}>
                {suspended ? "Reactivate company" : "Suspend company"}
              </Button>
            </div>
            {adminNeedsInvite && (
              <Alert tone="info" className="flex items-center justify-between gap-3">
                <span>The Admin hasn't accepted their invitation yet.</span>
                <Button size="sm" variant="secondary" loading={resend.isPending} onClick={() => resend.mutate()}>
                  Resend invite
                </Button>
              </Alert>
            )}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
              <div className="rounded-[12px] border border-line-soft bg-[#F7FBFF] px-3.5 py-[13px]">
                <div className="text-[11px] font-bold tracking-[0.08em] text-muted-2">PLAN</div>
                <Select aria-label="Plan" className="mt-1.5 h-10 font-bold" value={d.company.plan} onChange={(e) => patch.mutate({ plan: e.target.value })}>
                  {overview.plans.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <div className="mt-1.5 text-[12px] font-semibold text-muted">
                  Status: <span className="capitalize">{d.company.status}</span>
                  {d.company.trialEndsAt && d.company.status === "trial" ? ` · ends ${new Date(d.company.trialEndsAt).toLocaleDateString()}` : ""}
                </div>
              </div>
              <div className="rounded-[12px] border border-line-soft bg-[#F7FBFF] px-3.5 py-[13px]">
                <div className="text-[11px] font-bold tracking-[0.08em] text-muted-2">DOMAIN</div>
                <div className="mt-2 break-all text-[14px] font-bold text-navy">{d.domain?.domain ?? d.company.subdomain}</div>
                <div className="mt-[2px] text-[12px] font-semibold text-muted">
                  {d.domain ? (d.domain.verified ? `Verified · SSL ${d.domain.sslStatus} · ${d.domain.provider}` : "Awaiting DNS verification") : "Platform subdomain · no custom domain yet"}
                </div>
              </div>
            </div>
            <div>
              <SectionLabel right={<div className="text-[12px] font-bold text-blue-hover">{Object.values(d.features).filter((f) => f.enabled).length} enabled</div>}>FEATURES · PLAN DEFAULT → OVERRIDE</SectionLabel>
              <div className="mt-2.5 flex flex-col gap-1.5">
                {FEATURE_REGISTRY.map((f) => {
                  const state = d.features[f.key];
                  const mode: "plan" | "on" | "off" = state.source === "override_on" ? "on" : state.source === "override_off" ? "off" : "plan";
                  const source = mode === "plan" ? (state.inPlan ? `Included in ${d.company.planName}` : `Not in ${d.company.planName}`) : mode === "on" ? "Forced on by super admin" : "Forced off by super admin";
                  return (
                    <div key={f.key} className="flex items-center gap-3 rounded-[11px] border border-line-soft bg-white px-3 py-2.5">
                      <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: state.enabled ? "#2FBF71" : "#D8E5F5" }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-bold text-navy">{f.label}</div>
                        <div className="text-[11.5px] font-semibold text-muted">{source}</div>
                      </div>
                      <Segmented
                        ariaLabel={`${f.label} override`}
                        value={mode}
                        onChange={(m) => override.mutate({ feature: f.key, mode: m })}
                        options={[
                          { value: "plan", label: "Plan", activeClass: "bg-navy text-white" },
                          { value: "on", label: "On", activeClass: "bg-success-deep text-white" },
                          { value: "off", label: "Off", activeClass: "bg-danger text-white" },
                        ]}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <SectionLabel>INTEGRATIONS · OWNED BY THE COMPANY ADMIN</SectionLabel>
              <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2">
                {INTEGRATION_PROVIDERS.map((p) => {
                  const st = d.integrations[p]?.status ?? "not_connected";
                  const s = INTEGRATION_STYLE[st];
                  return (
                    <div key={p} className="flex items-center gap-2.5 rounded-[11px] border border-line-soft bg-[#F7FBFF] px-3 py-[11px]">
                      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] text-[10px] font-bold" style={{ background: s.bg, color: s.fg }}>
                        {INTEGRATION_ABBR[p]}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-navy">{INTEGRATION_NAME[p]}</div>
                        <div className="text-[11.5px] font-semibold text-muted">{s.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <SectionLabel>TEAM</SectionLabel>
              <div className="mt-2.5 flex flex-col gap-1.5">
                {d.team.map((m) => (
                  <div key={m.id} className={cn("flex items-center justify-between gap-2.5 rounded-[10px] border border-line-soft bg-[#F7FBFF] px-3 py-[9px] text-[13.5px]", !m.active && "opacity-60")}>
                    <div className="min-w-0 truncate">
                      <span className="font-bold text-navy">{m.name}</span> <span className="font-semibold text-muted">· {m.email}</span>
                      {!m.hasPassword && <span className="ml-2 text-[11px] font-bold text-warn-deep">invite pending</span>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {m.active && (
                        <button type="button" onClick={() => onImpersonate(m.id)} className="rounded-pill border border-line bg-white px-2.5 py-[3px] text-[11.5px] font-bold text-blue-hover hover:bg-pale">
                          Sign in as
                        </button>
                      )}
                      <Pill className="capitalize">{m.role}</Pill>
                    </div>
                  </div>
                ))}
                {d.team.length === 0 && <div className="text-[13px] font-semibold text-muted">No team members yet.</div>}
              </div>
            </div>
            <SupportSessions companyId={companyId} />
          </div>
        </>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Impersonation
// ---------------------------------------------------------------------------

interface PeopleResponse {
  company: { id: number; name: string; slug: string; status: string };
  people: { id: number; name: string; email: string; role: string; roleLabel: string; active: boolean; hasPassword: boolean; lastLoginAt: string | null }[];
  defaultMinutes: number;
  maxMinutes: number;
}

interface SessionsResponse {
  sessions: { id: number; target: { id: number; name: string; email: string; role: string }; reason: string; startedAt: string; expiresAt: string; endedAt: string | null; endedReason: string | null; active: boolean }[];
}

const DURATIONS = [15, 30, 60, 120];

/** Pick a person, say why, choose how long. The company Admin is emailed and every step is audited. */
function ImpersonateModal({ companyId, presetUserId, onClose }: { companyId: number; presetUserId?: number; onClose: () => void }) {
  const people = useQuery<PeopleResponse>({ queryKey: ["admin", "company", companyId, "people"], queryFn: () => api(`/admin/companies/${companyId}/people`) });
  const [userId, setUserId] = useState<number | null>(presetUserId ?? null);
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const data = people.data;
  const active = useMemo(() => (data?.people ?? []).filter((p) => p.active), [data]);
  useEffect(() => {
    if (userId == null && active.length) setUserId(active[0].id);
  }, [active, userId]);
  const target = active.find((p) => p.id === userId) ?? null;
  const admins = active.filter((p) => p.role === "admin");
  const start = useMutation({
    mutationFn: () => api<StartImpersonationResponse>("/admin/impersonation", { method: "POST", json: { userId, reason: reason.trim(), minutes } }),
    onSuccess: (r) => enterImpersonation(r, { companySuspended: data?.company.status === "suspended" }),
    onError: (e) => setError(errorMessage(e)),
  });
  const staff = active.filter((p) => p.role !== "client");
  const clients = active.filter((p) => p.role === "client");

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!userId) return setError("Choose who to sign in as.");
    if (reason.trim().length < 10) return setError("Give a reason of at least 10 characters (e.g. the support ticket or issue).");
    start.mutate();
  }

  return (
    <Modal title={data ? `Impersonate a user · ${data.company.name}` : "Impersonate a user"} onClose={onClose}>
      {!data ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : active.length === 0 ? (
        <Alert tone="info">This company has no active users to sign in as yet.</Alert>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3.5">
          <div className="text-[13px] font-semibold text-muted">You'll see the platform exactly as this person does, with their permissions, and can act on their behalf. Changes are recorded in the audit log under your name.</div>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Sign in as" htmlFor="imp-user">
            <Select id="imp-user" value={userId ?? ""} onChange={(e) => setUserId(Number(e.target.value))}>
              {staff.length > 0 && (
                <optgroup label="Team">
                  {staff.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.roleLabel} · {p.email}
                    </option>
                  ))}
                </optgroup>
              )}
              {clients.length > 0 && (
                <optgroup label="Clients (client portal)">
                  {clients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.email}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </Field>
          <Field label="Reason" htmlFor="imp-reason" hint="Required. Stored in the audit log and included in the email to the company Admin.">
            <Textarea id="imp-reason" required rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Support ticket #4821: Brian can't publish his website changes" />
          </Field>
          <Field label="Session length" htmlFor="imp-minutes" hint="The session ends on its own after this, or when you click End session.">
            <Select id="imp-minutes" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {DURATIONS.filter((m) => m <= data.maxMinutes).map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} minutes` : m === 60 ? "1 hour" : `${m / 60} hours`}
                </option>
              ))}
            </Select>
          </Field>
          <Alert tone="warn">
            {admins.length ? `${admins.map((a) => a.name).join(", ")} (Admin) will be emailed` : "The company owner will be emailed"} that Advisor Platform support signed in{target ? ` as ${target.name}` : ""}, with your reason.
          </Alert>
          <div className="mt-1.5 flex justify-end gap-2.5">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={start.isPending}>
              Start session
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** The last few support sessions in this company: who, why, and whether they are still open. */
function SupportSessions({ companyId }: { companyId: number }) {
  const q = useQuery<SessionsResponse>({ queryKey: ["admin", "company", companyId, "impersonation"], queryFn: () => api(`/admin/impersonation?companyId=${companyId}`) });
  const sessions = (q.data?.sessions ?? []).slice(0, 5);
  if (!sessions.length) return null;
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <div>
      <SectionLabel>RECENT SUPPORT SESSIONS</SectionLabel>
      <div className="mt-2.5 flex flex-col gap-1.5">
        {sessions.map((s) => (
          <div key={s.id} className="rounded-[10px] border border-line-soft bg-[#F7FBFF] px-3 py-[9px] text-[13px]">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 truncate">
                <span className="font-bold text-navy">{s.target.name}</span> <span className="font-semibold capitalize text-muted">· {s.target.role}</span>
              </div>
              <Pill tone={s.active ? "amber" : "grey"}>{s.active ? "Active" : s.endedReason === "expired" ? "Expired" : "Ended"}</Pill>
            </div>
            <div className="mt-[3px] truncate text-[12px] font-semibold text-muted" title={s.reason}>
              {when(s.startedAt)} · {s.reason}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New company modal
// ---------------------------------------------------------------------------

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24);

function CreateCompanyModal({ overview, onClose, onCreated }: { overview: Overview; onClose: () => void; onCreated: (id: number) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState({ name: "", slug: "", slugTouched: false, ownerName: "", ownerEmail: "", plan: overview.plans.find((p) => p.key === "professional")?.key ?? overview.plans[0]?.key ?? "starter", status: "trial" as "trial" | "active" | "comp" });
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ company: CompanyDetail; invite: { emailed: boolean; devLink?: string } }>("/admin/companies", { method: "POST", json: body }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
      toast(r.invite.emailed ? `Invitation sent to ${r.company.company.ownerEmail}` : r.invite.devLink ? `Company created. Email isn't configured — invite link: ${r.invite.devLink}` : "Company created (email not configured)", r.invite.emailed ? "success" : "info");
      onCreated(r.company.company.id);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const slugPreview = useMemo(() => draft.slug || slugify(draft.name), [draft.slug, draft.name]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate({ name: draft.name.trim(), slug: slugPreview, ownerName: draft.ownerName.trim(), ownerEmail: draft.ownerEmail.trim(), plan: draft.plan, status: draft.status });
  }

  return (
    <Modal title="New company" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <div className="text-[13px] font-semibold text-muted">Creates the company and its first Admin. They receive an invite email and finish branding, domain, and integrations in their own dashboard.</div>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <Field label="Company name" htmlFor="nc-name">
            <Input id="nc-name" required value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value, slug: d.slugTouched ? d.slug : slugify(e.target.value) }))} />
          </Field>
          <Field label="Subdomain" htmlFor="nc-slug">
            <div className="flex items-center overflow-hidden rounded-input border border-line bg-white focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
              <input id="nc-slug" className="h-11 min-w-0 flex-1 bg-transparent px-3.5 text-[14.5px] outline-none" value={draft.slug} onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""), slugTouched: true }))} placeholder={slugify(draft.name) || "yourname"} />
              <span className="whitespace-nowrap px-2.5 text-[11.5px] font-semibold text-muted-2">.{overview.platform.subdomainBase}</span>
            </div>
          </Field>
          <Field label="Admin name" htmlFor="nc-owner">
            <Input id="nc-owner" required value={draft.ownerName} onChange={(e) => setDraft((d) => ({ ...d, ownerName: e.target.value }))} />
          </Field>
          <Field label="Admin email" htmlFor="nc-email">
            <Input id="nc-email" type="email" required value={draft.ownerEmail} onChange={(e) => setDraft((d) => ({ ...d, ownerEmail: e.target.value }))} />
          </Field>
          <Field label="Plan" htmlFor="nc-plan">
            <Select id="nc-plan" value={draft.plan} onChange={(e) => setDraft((d) => ({ ...d, plan: e.target.value }))}>
              {overview.plans.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Start as" htmlFor="nc-status">
            <Select id="nc-status" value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as typeof d.status }))}>
              <option value="trial">14-day trial</option>
              <option value="active">Active (paid)</option>
              <option value="comp">Complimentary</option>
            </Select>
          </Field>
        </div>
        <div className="mt-1.5 flex justify-end gap-2.5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Create &amp; send invite
          </Button>
        </div>
      </form>
    </Modal>
  );
}
