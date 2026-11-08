import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import type { CategoryStatus } from "@workspace/shared";
import { api, ApiError } from "@/lib/api";
import { useTenant } from "@/hooks/use-tenant";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentMeta } from "@/hooks/use-meta";
import { initials } from "@/lib/utils";
import { Spinner } from "@/components/ui";
import { SiteState } from "./SiteChrome";
import type { GradeResponse } from "./types";

const COLORS: Record<CategoryStatus, string> = { excellent: "#2FBF71", good: "var(--blue)", needs_work: "#E39A2B", critical: "#C2361F" };
const LEGEND: { status: CategoryStatus; label: string }[] = [
  { status: "excellent", label: "Excellent" },
  { status: "good", label: "Good" },
  { status: "needs_work", label: "Needs work" },
  { status: "critical", label: "Critical" },
];

/**
 * The Profile Grade report (design_handoff/Profile Grade.dc.html). A lead sees
 * the summary — scores, quick wins, locked findings; an unlocked report shows
 * every finding and the prioritised plan. `/grade/sample` previews the sample profile.
 */
export function ProfileGrade() {
  const tenant = useTenant();
  const { user } = useAuth();
  const params = useParams<{ publicId: string }>();
  const [, navigate] = useLocation();
  const view = new URLSearchParams(window.location.search).get("view");
  const q = useQuery<GradeResponse>({
    queryKey: ["public-grade", params.publicId, view, user?.id ?? 0],
    queryFn: () => api(`/public/grade/${encodeURIComponent(params.publicId)}${view ? `?view=${encodeURIComponent(view)}` : ""}`),
    enabled: tenant.kind === "company",
    retry: false,
    refetchInterval: (query) => (query.state.data && !query.state.data.result && query.state.data.status !== "failed" ? 3000 : false),
  });
  useDocumentMeta({ title: q.data ? `Profile Grade · ${q.data.profileName || "Report"} — ${q.data.company.branding.companyName}` : "Profile Grade", robots: "noindex, nofollow" });

  if (tenant.kind === "loading" || (tenant.kind === "company" && q.isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <Spinner />
      </div>
    );
  }
  if (tenant.kind === "company_suspended") return <SiteState title={`${tenant.company.name} is unavailable`} body="This site is temporarily suspended." />;
  if (tenant.kind !== "company") return <SiteState title="That page isn't here" body="Profile Grade reports belong to a company site." />;
  if (q.isError || !q.data) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return <SiteState title={notFound ? "We couldn't find that report" : "We couldn't load this report"} body={notFound ? "Check the link you were sent — reports are private to the person they were prepared for." : "Please refresh in a moment."} />;
  }

  const d = q.data;
  const co = d.company.branding.companyName;
  const ownerFirst = (d.brand.ownerName || d.brand.ownerFullName || "").split(/\s+/)[0] || "your advisor";
  const r = d.result;
  const isFull = d.unlocked;
  const calendly = d.calendlyUrl;
  const num = <T,>(list: T[]) => list.map((x, i) => ({ ...x, n: i + 1 }));

  return (
    <div className="cs-site cs-grade-page">
      <header style={{ background: "#FFFFFF", borderBottom: "1px solid #E4EDF9" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "14px 20px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="cs-display" style={{ width: 30, height: 30, borderRadius: 8, background: "var(--blue)", color: "var(--on-primary)", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {initials(co)}
            </div>
            <div>
              <div className="cs-display" style={{ fontWeight: 700, fontSize: 15 }}>
                {co}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", color: "#7C93AD" }}>PROFILE GRADE · PREPARED FOR {(d.profileName || "YOU").toUpperCase()}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {d.canToggle && (
              <>
                <label htmlFor="pg-view" style={{ fontSize: 12, fontWeight: 700, color: "#6A809A" }}>
                  View as
                </label>
                <select id="pg-view" className="cs-select" value={isFull ? "full" : "summary"} onChange={(e) => navigate(`/grade/${encodeURIComponent(params.publicId)}${d.sample ? (e.target.value === "full" ? "?view=full" : "") : e.target.value === "summary" ? "?view=summary" : ""}`, { replace: true })}>
                  <option value="summary">Lead · quick summary</option>
                  <option value="full">Unlocked · full report</option>
                </select>
                <Link href="~/app" style={{ fontSize: 13, fontWeight: 700, color: "var(--blue-deep)" }}>
                  Edit rubric in CRM →
                </Link>
              </>
            )}
            {d.sample && <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", color: "#8A6320", background: "#FFF8F0", border: "1px solid #F6E4CC", padding: "6px 10px", borderRadius: 999 }}>SAMPLE PROFILE</span>}
            {!d.sample && d.canToggle && <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", color: d.leadUnlocked ? "#1E7A4C" : "#8A6320", background: d.leadUnlocked ? "#EDF7F1" : "#FFF8F0", border: `1px solid ${d.leadUnlocked ? "#CDEBD9" : "#F6E4CC"}`, padding: "6px 10px", borderRadius: 999 }}>{d.leadUnlocked ? "UNLOCKED FOR LEAD" : "LEAD SEES SUMMARY"}</span>}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 20px 80px", display: "flex", flexDirection: "column", gap: 22 }}>
        {!r ? (
          <section style={{ background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 18, padding: "40px 24px", textAlign: "center" }}>
            <div className="cs-display" style={{ fontWeight: 700, fontSize: 22, color: "var(--navy)" }}>
              {d.status === "failed" ? "We couldn't read this profile" : "Your grade is being prepared"}
            </div>
            <p style={{ fontSize: 15.5, lineHeight: 1.6, color: "#425973", margin: "10px 0 0" }}>{d.status === "failed" ? `${ownerFirst} has been notified and will review it by hand.` : "This page updates when the score is ready — usually within a couple of minutes."}</p>
            {d.errorMessage && <p style={{ fontSize: 13, lineHeight: 1.5, color: "#8A6320", margin: "12px auto 0", maxWidth: 560 }}>Staff only · {d.errorMessage}</p>}
          </section>
        ) : (
          <>
            <section style={{ background: "var(--navy)", color: "#FFFFFF", borderRadius: 22, padding: "clamp(26px,4vw,40px)", position: "relative", overflow: "hidden", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", gap: 32, alignItems: "center" }}>
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(700px 320px at 90% 0%, rgba(var(--blue-rgb),0.35), rgba(var(--navy-rgb),0) 70%)" }} />
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
                <div style={{ width: 132, height: 132, borderRadius: "50%", background: `conic-gradient(var(--blue) ${Math.round(r.pctTotal * 3.6)}deg, rgba(255,255,255,0.12) 0)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <div style={{ width: 106, height: 106, borderRadius: "50%", background: "var(--navy)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <div className="cs-display" style={{ fontWeight: 700, fontSize: 44, lineHeight: 1, letterSpacing: "-0.03em" }}>
                      {r.grade}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--blue-light)", marginTop: 4 }}>
                      {r.total} / {r.maxTotal}
                    </div>
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "var(--blue-light)" }}>{r.gradeLabel.toUpperCase()}</div>
                  <h1 className="cs-display" style={{ fontWeight: 700, fontSize: "clamp(22px,2.8vw,30px)", lineHeight: 1.15, letterSpacing: "-0.02em", margin: "8px 0 0" }}>
                    {d.profileName ? `${d.profileName}, your` : "Your"} profile scores {r.pctTotal}%.
                  </h1>
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: "#B9CBE0", margin: "10px 0 0", maxWidth: "48ch" }}>{r.gradeMessage}</p>
                </div>
              </div>
              <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
                <Tile label="CORE SECTIONS" value={String(r.coreScore)} sub={`of ${r.coreMax} points`} />
                <Tile label="ADDITIONAL SECTIONS" value={String(r.additionalScore)} sub={`of ${r.additionalMax} points`} />
                <Tile label="STRONGEST" labelColor="#8FE3B4" text={r.strongest?.name ?? "—"} />
                <Tile label="BIGGEST GAP" labelColor="#F3B6A6" text={r.biggestGap?.name ?? "—"} />
              </div>
            </section>

            {r.quickWins.length > 0 && (
              <section style={{ background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 18, padding: "22px 24px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "var(--blue-deep)" }}>QUICK WINS · HIGH IMPACT, LOW EFFORT</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(240px,100%),1fr))", gap: 12, marginTop: 12 }}>
                  {num(r.quickWins).map((qw) => (
                    <div key={qw.n} style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "#F4F8FE", border: "1px solid #DDE8F7", borderRadius: 12, padding: 14 }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--blue)", color: "var(--on-primary)", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{qw.n}</div>
                      <div style={{ fontSize: 14, lineHeight: 1.55, color: "#16283D" }}>{qw.action}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section style={{ background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 18, overflow: "hidden" }}>
              <div style={{ padding: "18px 24px", borderBottom: "1px solid #E4EDF9", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div className="cs-display" style={{ fontWeight: 700, fontSize: 17 }}>
                  Category breakdown
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 11.5, fontWeight: 700, color: "#6A809A", flexWrap: "wrap" }}>
                  {LEGEND.map((l) => (
                    <span key={l.status} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS[l.status] }} />
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {r.categories.map((cat) => (
                  <div key={cat.key} className="cs-grade-row">
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: COLORS[cat.status], flexShrink: 0 }} />
                        <div style={{ fontSize: 14.5, fontWeight: 700 }}>{cat.name}</div>
                      </div>
                      <div style={{ fontSize: 12, color: "#7C93AD", fontWeight: 700, marginTop: 3, paddingLeft: 17 }}>
                        {cat.group} · {cat.score} / {cat.max}
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: "#EEF4FC", marginTop: 9, marginLeft: 17, overflow: "hidden" }}>
                        <div className="cs-grade-bar" style={{ width: `${Math.round(cat.pct * 100)}%`, background: COLORS[cat.status] }} />
                      </div>
                    </div>
                    {isFull ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                        {cat.findings.map((f) => (
                          <div key={f} style={{ fontSize: 13.5, color: "#3D556F", display: "flex", gap: 8 }}>
                            <span style={{ color: "#2FBF71", fontWeight: 700 }}>✓</span>
                            <span>{f}</span>
                          </div>
                        ))}
                        {cat.recs.map((rec) => (
                          <div key={rec.check + rec.text} style={{ fontSize: 13.5, color: "#16283D", display: "flex", gap: 8 }}>
                            <span style={{ color: "#E39A2B", fontWeight: 700 }}>→</span>
                            <span>{rec.text}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: "#9AAABF", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                        <span aria-hidden="true">🔒</span>Findings and fixes unlock with your full report
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {!isFull && (
              <section style={{ background: "var(--blue)", color: "var(--on-primary)", borderRadius: 18, padding: 28, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
                <div style={{ minWidth: 0, flex: "1 1 320px" }}>
                  <div className="cs-display" style={{ fontWeight: 700, fontSize: 21 }}>
                    Unlock the full report
                  </div>
                  <div style={{ fontSize: 14.5, lineHeight: 1.55, color: "#DCE7F4", marginTop: 6 }}>All findings, the prioritized action plan, and {ownerFirst}'s notes — then a 15-minute call to walk through it.</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <Link href="/pricing" style={{ background: "#FFFFFF", color: "var(--navy)", border: "none", borderRadius: 999, padding: "14px 22px", fontSize: 15, fontWeight: 700 }}>
                    Unlock my report
                  </Link>
                  {calendly && (
                    <a href={calendly} target="_blank" rel="noopener noreferrer" style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.3)", color: "#FFFFFF", borderRadius: 999, padding: "14px 22px", fontSize: 15, fontWeight: 700 }}>
                      Book the walkthrough
                    </a>
                  )}
                </div>
              </section>
            )}

            {isFull && (
              <>
                <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", gap: 16 }}>
                  <PlanCard label="DO THIS WEEK" color="#C2361F">
                    {num(r.immediate).map((x) => (
                      <div key={x.n} style={{ fontSize: 13.5, lineHeight: 1.55, color: "#16283D", display: "flex", gap: 10 }}>
                        <span style={{ fontWeight: 700, color: "#7C93AD", flexShrink: 0 }}>{x.n}</span>
                        <div>
                          <div>{x.action}</div>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#7C93AD", marginTop: 3 }}>
                            {x.category} · {x.impact} impact · {x.effort} effort
                          </div>
                        </div>
                      </div>
                    ))}
                    {r.immediate.length === 0 && <div style={{ fontSize: 13.5, color: "#9AAABF", fontWeight: 600 }}>Nothing urgent — the fundamentals are in place.</div>}
                  </PlanCard>
                  <PlanCard label="NEXT 30 DAYS" color="#E39A2B">
                    {num(r.shortTerm).map((x) => (
                      <div key={x.n} style={{ fontSize: 13.5, lineHeight: 1.55, color: "#16283D", display: "flex", gap: 10 }}>
                        <span style={{ fontWeight: 700, color: "#7C93AD", flexShrink: 0 }}>{x.n}</span>
                        <div>
                          <div>{x.action}</div>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#7C93AD", marginTop: 3 }}>{x.category}</div>
                        </div>
                      </div>
                    ))}
                    {r.shortTerm.length === 0 && <div style={{ fontSize: 13.5, color: "#9AAABF", fontWeight: 600 }}>Nothing queued — the week-one list covers it.</div>}
                  </PlanCard>
                  <PlanCard label="ONGOING · NOT SCORED" color="var(--blue-deep)">
                    {r.tips.map((t) => (
                      <div key={t.label} style={{ fontSize: 13.5, lineHeight: 1.55, color: "#16283D" }}>
                        <span style={{ fontWeight: 700 }}>{t.label}.</span> {t.text}
                      </div>
                    ))}
                    {r.ongoing.map((x) => (
                      <div key={x.action} style={{ fontSize: 13.5, lineHeight: 1.55, color: "#16283D" }}>
                        {x.action}
                      </div>
                    ))}
                  </PlanCard>
                </section>
                <section style={{ background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 18, padding: "22px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ minWidth: 0, flex: "1 1 320px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "var(--blue-deep)" }}>WHAT WE'D DO WITH THIS</div>
                    <div style={{ fontSize: 15, lineHeight: 1.6, color: "#3D556F", marginTop: 6 }}>
                      A {r.grade} usually means the fundamentals exist but the positioning doesn't. The Brand Voice Blueprint fixes the headline, About, and Featured section at the root — and re-grades you when it's live.
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    <Link href="/pricing" className="cs-btn cs-btn--primary" style={{ fontSize: 14.5, padding: "13px 20px", boxShadow: "none" }}>
                      See engagements
                    </Link>
                    {calendly && (
                      <a href={calendly} target="_blank" rel="noopener noreferrer" className="cs-btn cs-btn--secondary" style={{ fontSize: 14.5, padding: "13px 20px" }}>
                        Book the 15-min walkthrough
                      </a>
                    )}
                  </div>
                </section>
              </>
            )}
          </>
        )}

        <div style={{ fontSize: 12, color: "#7C93AD", fontWeight: 600, textAlign: "center", lineHeight: 1.6 }}>
          Rubric v{d.rubricVersion} · {co} · Scored against the {d.categoryCount}-category framework. Activity-based marketing, not paid advertising; grades are guidance, not guarantees.
        </div>
      </main>
    </div>
  );
}

function Tile({ label, value, sub, text, labelColor = "var(--blue-light)" }: { label: string; value?: string; sub?: string; text?: string; labelColor?: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: labelColor }}>{label}</div>
      {value !== undefined && (
        <div className="cs-display" style={{ fontWeight: 700, fontSize: 24, marginTop: 6 }}>
          {value}
        </div>
      )}
      {sub && <div style={{ fontSize: 12, color: "#B9CBE0", fontWeight: 600 }}>{sub}</div>}
      {text && <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>{text}</div>}
    </div>
  );
}

function PlanCard({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 18, padding: 22 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>{children}</div>
    </div>
  );
}
