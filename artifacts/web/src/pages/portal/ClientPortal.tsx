import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { cents } from "@workspace/shared";
import { api } from "@/lib/api";
import { initials } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentMeta } from "@/hooks/use-meta";
import { Spinner } from "@/components/ui";
import { fmtDate, fmtWhen } from "@/pages/public/buyingFlow";
import type { OrderStageView, PortalPayload } from "@/pages/public/types";

/** The client portal (Buying Flow.dc.html, screen 6): where the profile is, payments, files, the team. */
export function ClientPortal() {
  const { user, logout } = useAuth();
  const q = useQuery<PortalPayload>({ queryKey: ["portal"], queryFn: () => api("/portal"), refetchInterval: 60_000 });
  useDocumentMeta({ title: q.data?.company ? `Client portal — ${q.data.company.branding.companyName}` : "Client portal", robots: "noindex, nofollow" });

  if (!q.data) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "#F4F8FE" }}>
        {q.isError ? <div className="cs-display" style={{ fontSize: 18, fontWeight: 700, color: "#0A1626" }}>We couldn't load your portal. Please refresh.</div> : <Spinner />}
      </div>
    );
  }
  const d = q.data;
  const co = d.company;
  const owner = co.ownerFirst;

  if (!d.client) {
    return (
      <div className="cs-site" style={{ minHeight: "100vh", background: "#F4F8FE", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 22, padding: "40px 32px", maxWidth: 520, textAlign: "center" }}>
          <div className="cs-kicker" style={{ color: "var(--blue-deep)" }}>
            CLIENT PORTAL
          </div>
          <h1 className="cs-display" style={{ fontWeight: 700, fontSize: 24, margin: "10px 0 0", color: "var(--navy)" }}>
            Nothing here yet, {user?.name.split(" ")[0]}
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "#425973", margin: "10px 0 0" }}>Your portal fills in the moment an engagement begins. Until then, the pricing page lists every way to work together.</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22, flexWrap: "wrap" }}>
            <Link href="~/pricing" className="cs-btn cs-btn--primary" style={{ fontSize: 14.5, padding: "13px 22px", boxShadow: "none" }}>
              See engagements
            </Link>
            <button type="button" onClick={logout} className="cs-btn cs-btn--secondary" style={{ fontSize: 14.5, padding: "13px 22px" }}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const paidOrders = d.orders.filter((o) => o.status === "paid" || o.status === "refunded");
  const primary = paidOrders[0] ?? d.orders[0] ?? null;
  const actionHref = (s: OrderStageView) => (s.action === "intake" ? d.links?.intake : s.action ? d.links?.book : null);
  const actionLabel = (s: OrderStageView) => (s.action === "intake" ? "Complete intake" : s.action === "book" ? "Book" : s.action === "reschedule" ? "Reschedule" : "");
  const mark = (s: OrderStageView, i: number) => (s.status === "done" ? "✓" : s.status === "scheduled" ? "◷" : String(i + 1));
  const markStyle = (s: OrderStageView): React.CSSProperties =>
    s.status === "done" ? { background: "var(--blue)", color: "var(--on-primary)", borderColor: "var(--blue)" } : s.status === "scheduled" ? { background: "#FFF8F0", color: "#8A6320", borderColor: "#F6E4CC" } : { background: "#FFFFFF", color: "#9AAABF", borderColor: "#DDE8F7" };

  return (
    <div className="cs-site" style={{ minHeight: "100vh", background: "#F4F8FE" }}>
      <header style={{ background: "#FFFFFF", borderBottom: "1px solid #E4EDF9" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <Link href="~/" className="cs-logo" aria-label={co.branding.companyName}>
            {co.branding.logoUrl ? <img src={co.branding.logoUrl} alt={co.branding.companyName} className="cs-logo__img" style={{ height: 32, maxWidth: 160 }} /> : <span className="cs-logo__word" style={{ fontSize: 16 }}>{co.branding.companyName}</span>}
          </Link>
          <button type="button" onClick={logout} style={{ background: "none", border: 0, fontSize: 13, fontWeight: 700, color: "#6A809A", cursor: "pointer" }}>
            Sign out
          </button>
        </div>
      </header>
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 20px 80px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="cs-display" style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--pale)", color: "var(--blue-deep)", fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {initials(d.client.name)}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "#7C93AD" }}>CLIENT PORTAL</div>
              <h1 className="cs-display" style={{ fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em", margin: "4px 0 0", color: "var(--navy)" }}>
                {d.client.name}
              </h1>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {primary && <span style={{ background: primary.status === "refunded" ? "#FDECE9" : "#EDF7F1", color: primary.status === "refunded" ? "#C2361F" : "#1E7A4C", fontSize: 12, fontWeight: 700, padding: "7px 12px", borderRadius: 999 }}>{primary.offerName} · {primary.status === "refunded" ? "Refunded" : "Active"}</span>}
            {co.ownerEmail && (
              <a href={`mailto:${co.ownerEmail}`} style={{ fontSize: 13.5, fontWeight: 700, color: "var(--blue-deep)" }}>
                Message {owner} →
              </a>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 18, marginTop: 28, alignItems: "start" }}>
          <div style={{ gridColumn: "span 2", background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 18, padding: 26, minWidth: 0 }} className="portal-main">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div className="cs-display" style={{ fontWeight: 700, fontSize: 18 }}>
                Where your profile is
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--blue-deep)" }}>
                {d.progress.done} of {d.progress.total} stages
              </div>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "#EEF4FC", marginTop: 14, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${d.progress.pct}%`, background: "var(--blue)", borderRadius: 999, transition: "width .6s" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 20 }}>
              {d.stages.map((s, i) => {
                const href = actionHref(s);
                return (
                  <div key={s.id} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "12px 0", borderBottom: "1px solid #F1F5FB" }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, ...markStyle(s) }}>{mark(s, i)}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: s.status === "pending" ? "#6A809A" : "var(--navy)" }}>{s.label}</div>
                      <div style={{ fontSize: 13, color: "#6A809A", marginTop: 2 }}>{s.meta}</div>
                    </div>
                    {href && s.action && (
                      <a href={href} className="cs-btn cs-btn--primary" style={{ padding: "9px 14px", fontSize: 13, boxShadow: "none" }}>
                        {actionLabel(s)}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            <div style={{ background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 18, padding: 22 }}>
              <div className="cs-kicker">PAYMENTS · STRIPE</div>
              {primary ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 12 }}>
                    <div className="cs-display" style={{ fontWeight: 700, fontSize: 24 }}>
                      {cents(primary.amountCents)}
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: primary.status === "refunded" ? "#C2361F" : "#1E7A4C" }}>
                      {primary.status === "refunded" ? "Refunded" : `Paid · ${fmtDate(primary.paidAt ?? primary.createdAt)}`}
                    </div>
                  </div>
                  {primary.schedule.map((i) => (
                    <div key={i.seq} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 10, paddingTop: 10, borderTop: "1px solid #EEF4FC" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#3D556F" }}>
                        Payment {i.seq} of {primary.installments} · {cents(i.amountCents)}
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: i.status === "paid" ? "#1E7A4C" : i.status === "failed" ? "#C2361F" : "#8A6320" }}>
                        {i.status === "paid" ? `Paid · ${fmtDate(i.paidAt)}` : i.status === "failed" ? "Card declined · we'll be in touch" : i.status === "canceled" ? "Canceled" : i.status === "refunded" ? "Refunded" : i.status === "processing" ? "Processing…" : `Scheduled · ${fmtDate(i.dueAt)}`}
                      </div>
                    </div>
                  ))}
                  <div style={{ fontSize: 12.5, color: "#6A809A", fontWeight: 600, marginTop: 12 }}>Receipts arrive by email from {co.branding.companyName}. {co.ownerEmail ? <a href={`mailto:${co.ownerEmail}?subject=${encodeURIComponent("Update my card")}`} style={{ fontWeight: 700 }}>Update card</a> : null}</div>
                </>
              ) : (
                <div style={{ fontSize: 14, color: "#6A809A", marginTop: 10 }}>No payments yet.</div>
              )}
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 18, padding: 22 }}>
              <div className="cs-kicker">YOUR FILES</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                {d.files.length === 0 && <div style={{ fontSize: 13.5, color: "#9AAABF", fontWeight: 600 }}>Files appear here as each stage completes — your Blueprint after the interview, your draft after the Blueprint.</div>}
                {d.files.map((f) => (
                  <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", background: "#F7FBFF", border: "1px solid #E4EDF9", borderRadius: 10, fontSize: 13.5, fontWeight: 600, color: "#3D556F" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2FBF71", flexShrink: 0 }} />
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#9AAABF", whiteSpace: "nowrap" }}>{fmtDate(f.createdAt)}</span>
                  </a>
                ))}
              </div>
            </div>
            <div style={{ background: "var(--navy)", color: "#FFFFFF", borderRadius: 18, padding: 22 }}>
              <div className="cs-kicker" style={{ color: "var(--blue-light)" }}>
                YOUR TEAM
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                {co.ownerPhoto ? <img src={co.ownerPhoto} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} /> : <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--blue)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>{initials(co.ownerFullName || owner)}</div>}
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>{co.ownerFullName || owner}</div>
                  <div style={{ fontSize: 12.5, color: "#B9CBE0", fontWeight: 600 }}>{co.ownerTitle ? `${co.ownerTitle} · ` : "Your strategist · "}replies within 1 business day</div>
                </div>
              </div>
              {d.booking?.startAt && <div style={{ marginTop: 14, fontSize: 12.5, color: "#B9CBE0", fontWeight: 600 }}>Next: Brand Voice Interview · {fmtWhen(d.booking.startAt)}</div>}
            </div>
          </div>
        </div>
      </main>
      <style>{`@media (max-width: 679px) { .portal-main { grid-column: span 1 !important; } }`}</style>
    </div>
  );
}
