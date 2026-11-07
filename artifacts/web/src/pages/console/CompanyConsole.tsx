import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { FEATURE_REGISTRY } from "@workspace/shared";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { Alert, Button, KpiTile, Spinner } from "@/components/ui";
import { ConsoleLayout, type ConsoleNavItem } from "./ConsoleLayout";
import { LeadsPanel } from "./LeadsPanel";
import { LeadDrawer } from "./LeadDrawer";
import { CmsPanel } from "./CmsPanel";
import { ReviewsPanel } from "./ReviewsPanel";
import { RubricPanel } from "./RubricPanel";
import { SettingsPanel } from "./SettingsPanel";
import { SideCards } from "./SideCards";
import { useSummary, viewerCan } from "./useConsole";
import { fmtWhen, type LeadsResponse, type RubricResponse } from "./types";

/**
 * The company console (CRM Dashboard.dc.html): one long page with anchored
 * panels — KPIs, Leads (list / pipeline), Website (CMS), Reviews, the
 * "Not in your plan" lock banner, Profile Grader rubric, Company settings,
 * SendGrid templates and Integrations summary — plus the lead drawer.
 */
export function CompanyConsole() {
  const { user } = useAuth();
  const params = useParams<{ companyId?: string }>();
  const companyId = params.companyId ? Number(params.companyId) : (user?.companyId ?? 0);
  const summary = useSummary(companyId);
  const [, navigate] = useLocation();
  const search = new URLSearchParams(useSearch());
  const leadParam = search.get("lead");
  const selectedLead = leadParam ? Number(leadParam) : null;
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "board">("list");
  const [section, setSection] = useState("leads");

  const { can, isOwner, has, isSuper, role } = viewerCan(summary.data);
  const leads = useQuery<LeadsResponse>({ queryKey: ["company", companyId, "leads"], queryFn: () => api(`/companies/${companyId}/leads`), enabled: Boolean(summary.data) && can("clients", "read"), refetchInterval: 60_000 });
  const rubric = useQuery<RubricResponse>({ queryKey: ["company", companyId, "rubric"], queryFn: () => api(`/companies/${companyId}/rubric`), enabled: Boolean(summary.data) && isOwner });

  // `~` = absolute: this component renders inside the nested /app router, where relative paths would re-prefix the base.
  const openLead = (id: number) => navigate(`~${window.location.pathname}?lead=${id}`);
  const closeLead = () => navigate(`~${window.location.pathname}`, { replace: true });

  const scrollTo = (id: string) => {
    setSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const ids = ["leads", "website", "reviews", "grader", "settings", "outreach"];
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setSection(visible.target.id);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [summary.data, leads.data]);

  const lockedFeatures = useMemo(() => (summary.data ? FEATURE_REGISTRY.filter((f) => !summary.data!.features[f.key].enabled) : []), [summary.data]);

  if (!companyId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page px-6">
        <Alert tone="info">Pick a company from Platform Admin to open its dashboard.</Alert>
      </main>
    );
  }
  if (summary.isError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page px-6">
        <Alert tone="danger">You don't have access to this company.</Alert>
      </main>
    );
  }
  if (!summary.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <Spinner />
      </div>
    );
  }
  const s = summary.data;
  const canSeeSite = can("website", "read") && has("website_cms");
  const canEditSite = can("website", "write") && isOwner;
  const canReviews = can("reviews", "read") && has("reviews");
  const nav: ConsoleNavItem[] = [
    { id: "leads", label: "Leads", count: s.counts.leads, active: section === "leads" && view === "list", onClick: () => { setView("list"); scrollTo("leads"); } },
    ...(has("pipeline_board") && can("pipeline", "read") ? [{ id: "pipeline", label: "Pipeline", active: section === "leads" && view === "board", onClick: () => { setView("board"); scrollTo("leads"); } }] : []),
    { id: "outreach", label: "Outreach templates", active: section === "outreach", onClick: () => scrollTo("outreach") },
    ...(canSeeSite ? [{ id: "website", label: "Website (CMS)", badge: s.counts.hasDraft ? "DRAFT" : null, active: section === "website", onClick: () => scrollTo("website") }] : []),
    ...(canReviews ? [{ id: "reviews", label: "Reviews", count: s.counts.reviewsLive, active: section === "reviews", onClick: () => scrollTo("reviews") }] : []),
    ...(isOwner ? [{ id: "grader", label: "Profile Grader", active: section === "grader", onClick: () => scrollTo("grader") }] : []),
    ...(isOwner ? [{ id: "settings", label: "Company settings", active: section === "settings", onClick: () => scrollTo("settings") }] : []),
    { id: "landing", label: "Landing page ↗", href: s.publicUrl },
  ];
  const kpis = leads.data?.kpis;

  return (
    <ConsoleLayout summary={s} nav={nav}>
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-4 border-b border-line-soft bg-white px-7 py-[18px] max-md:px-4">
        <div className="min-w-0 flex-1 basis-[260px]">
          <h1 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-navy">Leads</h1>
          <div className="mt-[3px] text-[13.5px] font-semibold text-muted">Profile audit requests from the landing page form</div>
        </div>
        <div className="flex items-center gap-2.5">
          <label htmlFor="crm-search" className="sr-only">
            Search leads
          </label>
          <input id="crm-search" type="search" placeholder="Search name, email, phone…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-11 w-[270px] max-w-[46vw] rounded-[11px] border border-line bg-[#F7FBFF] px-3.5 text-[14.5px] text-navy outline-none focus:border-brand focus:bg-white" />
          {isSuper && <span className="whitespace-nowrap rounded-pill border border-[#F6E4CC] bg-[#FFF8F0] px-[11px] py-2 text-[11.5px] font-bold tracking-[0.06em] text-warn-deep">VIEWING COMPANY</span>}
        </div>
      </div>

      <div className="flex flex-col gap-[26px] px-7 pb-11 pt-[26px] max-md:px-4">
        {can("clients", "read") && (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
            <KpiTile label="NEW THIS WEEK" value={kpis?.newThisWeek ?? "—"} sub="Awaiting first contact" />
            <KpiTile label="IN CONVERSATION" value={kpis?.inConversation ?? "—"} sub="Open stages past New" />
            <KpiTile label="CLIENTS" value={kpis?.clients ?? "—"} sub="Engagement signed" />
            <KpiTile label="FORM → CRM" value="Live" dark sub={kpis?.lastReceivedAt ? `Direct API · last lead ${fmtWhen(kpis.lastReceivedAt)}` : "Direct API · no leads yet"} />
          </div>
        )}

        {can("clients", "read") ? (
          leads.data ? (
            leads.data.leads.length === 0 && !query ? (
              <EmptyLeads companyId={companyId} publicUrl={s.publicUrl} canWrite={can("clients", "write")} />
            ) : (
              <LeadsPanel companyId={companyId} data={leads.data} query={query} view={view} onView={setView} canBoard={has("pipeline_board") && can("pipeline", "read")} canMoveStages={can("pipeline", "write")} canManageColumns={(isOwner || role === "manager") && can("pipeline", "write") && has("pipeline_board")} onOpen={openLead} />
            )
          ) : (
            <div className="flex justify-center rounded-[18px] border border-line bg-white py-16">
              <Spinner />
            </div>
          )
        ) : (
          <Alert tone="info">You don't have access to leads. Ask your Admin for the Leads & clients permission.</Alert>
        )}

        {canSeeSite && <CmsPanel companyId={companyId} companyName={s.company.name} canEdit={canEditSite} hasVideoFeature={has("hero_video")} />}
        {canReviews && <ReviewsPanel companyId={companyId} canWrite={can("reviews", "write")} />}

        {isOwner && lockedFeatures.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-[18px] border border-dashed border-line bg-white px-[22px] py-[18px]">
            <span className="text-[16px]">🔒</span>
            <div className="min-w-0 flex-1 basis-[300px]">
              <div className="text-[13.5px] font-bold text-navy">Not in your plan: {lockedFeatures.map((f) => f.label).join(", ")}</div>
              <div className="mt-[2px] text-[12.5px] font-semibold text-muted">Your plan is {s.plan.name}. Ask the platform team to upgrade or enable a feature.</div>
            </div>
          </div>
        )}

        {isOwner && <RubricPanel companyId={companyId} />}
        {isOwner && <SettingsPanel companyId={companyId} summary={s} />}
        <SideCards summary={s} />
      </div>

      {selectedLead && leads.data && (
        <LeadDrawer companyId={companyId} leadId={selectedLead} stages={leads.data.stages} rubricVersion={rubric.data?.published.version ?? null} canMoveStages={can("pipeline", "write")} canEmail={can("clients", "write") && has("sendgrid")} sendgridConnected={s.integrations.sendgrid === "connected" || s.integrations.sendgrid === "pending"} onClose={closeLead} />
      )}
    </ConsoleLayout>
  );
}

function EmptyLeads({ companyId, publicUrl, canWrite }: { companyId: number; publicUrl: string; canWrite: boolean }) {
  const [busy, setBusy] = useState(false);
  const { refetch } = useQuery<LeadsResponse>({ queryKey: ["company", companyId, "leads"], enabled: false });
  const createTest = async () => {
    setBusy(true);
    try {
      await api(`/companies/${companyId}/leads`, { method: "POST", json: { name: "Test Lead", email: `test-${Date.now()}@example.com`, phone: "(555) 010-0000", category: "Consultant", linkedin: "linkedin.com/in/test-lead", goal: "A test lead so you can see the drawer, stages and email composer.", source: "test" } });
      await refetch();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div id="leads" className="rounded-[18px] border border-line bg-white px-6 py-12 text-center">
      <div className="font-display text-[20px] font-bold text-navy">No leads yet</div>
      <div className="mx-auto mt-2 max-w-[520px] text-[14.5px] text-body">
        Your form is live at{" "}
        <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-hover">
          {publicUrl.replace(/^https?:\/\//, "")}
        </a>
        . Every submission lands here in the first open stage.
      </div>
      {canWrite && (
        <Button className="mt-5" variant="secondary" loading={busy} onClick={createTest}>
          Create a test lead
        </Button>
      )}
    </div>
  );
}
