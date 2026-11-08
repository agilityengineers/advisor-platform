import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useDocumentMeta } from "@/hooks/use-meta";
import { Spinner } from "@/components/ui";
import { PublicShell } from "./PublicShell";
import { FlowPage, SecureBadge } from "./FlowChrome";
import { SiteState } from "./SiteChrome";
import { orderParam, useOrder, loadCalendly, fmtWhen } from "./buyingFlow";
import type { OrderPayload, PublicSiteResponse } from "./types";

/** `/book?order=` — Calendly inline booking, prefilled (Buying Flow screen 3). */
export function BookInterview() {
  return <PublicShell>{(site) => <BookBody site={site} />}</PublicShell>;
}

function BookBody({ site }: { site: PublicSiteResponse }) {
  const publicId = orderParam();
  const q = useOrder(publicId);
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const brand = site.site.content.brand;
  const [calState, setCalState] = useState<"loading" | "live" | "blocked">("loading");
  const [justBooked, setJustBooked] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  useDocumentMeta({ title: `Book your interview — ${brand.companyName}`, robots: "noindex, nofollow" });
  const d = q.data;
  const calendly = d?.links.calendly ?? null;
  const booked = Boolean(d?.booking) || justBooked;

  // Mount the inline widget once the order is known and nothing is booked yet.
  useEffect(() => {
    if (!d || booked || !calendly || mounted.current || !mountRef.current) return;
    mounted.current = true;
    const el = mountRef.current;
    let timer: number | undefined;
    void loadCalendly().then((Calendly) => {
      if (!Calendly) {
        setCalState("blocked");
        return;
      }
      el.innerHTML = "";
      Calendly.initInlineWidget({ url: `${calendly}${calendly.includes("?") ? "&" : "?"}hide_gdpr_banner=1`, parentElement: el, prefill: { name: d.order.customerName, email: d.order.customerEmail, customAnswers: d.linkedin ? { a1: d.linkedin } : undefined } });
      timer = window.setTimeout(() => setCalState((s) => (s === "loading" ? "blocked" : s)), 8000);
    });
    return () => window.clearTimeout(timer);
  }, [d, booked, calendly]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { event?: string; payload?: { event?: { uri?: string }; invitee?: { uri?: string } } } | undefined;
      if (!data || typeof data !== "object" || !/^calendly\./.test(data.event ?? "")) return;
      if (data.event === "calendly.event_type_viewed") setCalState("live");
      if (data.event === "calendly.event_scheduled" && publicId) {
        setJustBooked(true);
        void api(`/public/orders/${encodeURIComponent(publicId)}/booked`, { method: "POST", json: { eventUri: data.payload?.event?.uri ?? "", inviteeUri: data.payload?.invitee?.uri ?? "" } })
          .then(() => qc.invalidateQueries({ queryKey: ["public-order", publicId] }))
          .catch(() => undefined);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [publicId, qc]);

  if (!publicId) return <SiteState title="That page needs an order" body="Follow the link from your receipt." />;
  if (q.isError) return <SiteState title="We couldn't find that order" body="Check the link in your receipt." />;
  if (!d) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "#F4F8FE" }}>
        <Spinner />
      </div>
    );
  }
  if (d.order.status !== "paid") return <SiteState title="This order isn't paid yet" body="Finish checkout first, then come back to book." />;
  const owner = d.company.ownerFirst;
  const intakeHref = `/intake?order=${encodeURIComponent(publicId)}`;
  const dot = calState === "blocked" ? "#E39A2B" : calState === "live" ? "#2FBF71" : "#C4D0DF";
  const stateLabel = !calendly ? "CALENDLY · NOT CONNECTED" : calState === "blocked" ? "CALENDLY · OFFLINE" : calState === "live" ? "CALENDLY · LIVE" : "CALENDLY · CONNECTING";

  return (
    <FlowPage logoUrl={brand.logoUrl} companyName={brand.companyName} right={<SecureBadge />}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 28, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div className="cs-eyebrow">Step 1 of 2</div>
          <h1 className="cs-display" style={{ fontWeight: 700, fontSize: "clamp(26px,3vw,36px)", lineHeight: 1.1, letterSpacing: "-0.02em", margin: "14px 0 0", color: "var(--navy)" }}>
            Book your Brand Voice Interview
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: "#3D556F", margin: "14px 0 0" }}>90 minutes on Zoom, recorded. Talk the way you would to a client — {owner} asks the questions. Your name and email are already filled in.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
            {["Calendar invite with Zoom link, instantly", "Reminders 24h and 1h before", "Reschedule any time from the invite"].map((t) => (
              <div key={t} style={{ display: "flex", gap: 10, fontSize: 14.5, color: "#16283D" }}>
                <span style={{ color: "var(--blue)", fontWeight: 700 }}>✓</span>
                {t}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 26, display: "flex", flexWrap: "wrap", gap: 12 }}>
            {calendly && (
              <a href={calendly} target="_blank" rel="noopener noreferrer" className="cs-btn cs-btn--primary" style={{ fontSize: 15, padding: "14px 22px", boxShadow: "none" }}>
                Open in Calendly ↗
              </a>
            )}
            <Link href={intakeHref} className="cs-btn cs-btn--secondary" style={{ fontSize: 15, padding: "14px 22px" }}>
              {d.intakeDone ? "Back to intake" : "I'll book later — go to intake"}
            </Link>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div style={{ background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 18, overflow: "hidden", boxShadow: "0 24px 60px rgba(var(--navy-rgb),0.08)" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #E4EDF9", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {d.company.ownerPhoto && <img src={d.company.ownerPhoto} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />}
              <div>
                <div style={{ fontSize: 12, color: "#6A809A", fontWeight: 700 }}>{d.company.ownerFullName}</div>
                <div className="cs-display" style={{ fontWeight: 700, fontSize: 16 }}>
                  Brand Voice Interview · 90 min
                </div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#006BFF", letterSpacing: "0.06em" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot }} />
                {stateLabel}
              </div>
            </div>
            {booked ? (
              <div style={{ padding: "36px 24px", textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#EDF7F1", color: "#1E7A4C", fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>✓</div>
                <div className="cs-display" style={{ fontWeight: 700, fontSize: 20, marginTop: 16 }}>
                  Interview booked
                </div>
                <div style={{ fontSize: 14.5, color: "#5A718C", marginTop: 6 }}>{d.booking?.startAt ? fmtWhen(d.booking.startAt) : "Scheduled via Calendly"} · invite and Zoom link are in your inbox</div>
                <button type="button" className="cs-btn cs-btn--primary" style={{ marginTop: 20, fontSize: 14.5, padding: "13px 22px", boxShadow: "none" }} onClick={() => navigate(d.intakeDone ? `/client/login?email=${encodeURIComponent(d.order.customerEmail)}` : intakeHref)}>
                  {d.intakeDone ? "Go to your portal →" : "Continue to intake →"}
                </button>
                {calendly && (
                  <div style={{ marginTop: 12 }}>
                    <a href={calendly} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, color: "var(--blue-deep)" }}>
                      Need a different time? Open Calendly ↗
                    </a>
                  </div>
                )}
              </div>
            ) : !calendly ? (
              <div style={{ padding: "36px 24px", textAlign: "center" }}>
                <div className="cs-display" style={{ fontWeight: 700, fontSize: 18 }}>
                  {owner} will send you a time
                </div>
                <div style={{ fontSize: 14.5, color: "#5A718C", marginTop: 6, lineHeight: 1.55 }}>Online booking isn't connected on this site yet. You'll get an email with interview times within one business day.</div>
                <Link href={intakeHref} className="cs-btn cs-btn--primary" style={{ marginTop: 20, fontSize: 14.5, padding: "13px 22px", boxShadow: "none" }}>
                  Continue to intake →
                </Link>
              </div>
            ) : (
              <div ref={mountRef} style={{ height: 700, minHeight: 700, width: "100%", position: "relative", background: "#FFFFFF" }}>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "#6A809A", fontSize: 13.5, fontWeight: 600, pointerEvents: "none" }}>
                  <Spinner />
                  Loading {owner}'s calendar…
                </div>
              </div>
            )}
          </div>
          {calendly && !booked && calState === "blocked" && (
            <div style={{ background: "#FFFFFF", border: "1px dashed #B9D2F4", borderRadius: 14, padding: "14px 16px", fontSize: 12.5, lineHeight: 1.6, color: "#8A6320", fontWeight: 700 }}>Calendly couldn't load here — use “Open in Calendly” above. Your booking still lands in your portal.</div>
          )}
        </div>
      </div>
    </FlowPage>
  );
}

export type { OrderPayload };
