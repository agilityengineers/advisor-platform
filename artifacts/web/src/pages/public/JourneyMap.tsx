import { useEffect, useRef, useState } from "react";
import type { SiteContent } from "@workspace/shared";
import { useMediaQuery, useReducedMotion } from "@/hooks/use-media-query";
import { siteVoice } from "./usePublicSite";

interface Props {
  content: SiteContent;
  showAuthorityDesk: boolean;
}

const STEP_MS = 2200;

/**
 * The five-step journey map. Lights steps 1→5 in sequence while on screen,
 * pauses on hover; horizontal at ≥900px, vertical below.
 */
export function JourneyMap({ content, showAuthorityDesk }: Props) {
  const { first } = siteVoice(content);
  const horizontal = useMediaQuery("(min-width: 900px)");
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(reduced ? 2 : 1);
  const [running, setRunning] = useState(false);
  const paused = useRef(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduced || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => setRunning(e.isIntersecting)), { threshold: 0.3 });
    io.observe(root);
    return () => io.disconnect();
  }, [reduced]);

  useEffect(() => {
    if (!running || reduced) return;
    const t = window.setInterval(() => {
      if (!paused.current) setActive((a) => (a % 5) + 1);
    }, STEP_MS);
    return () => window.clearInterval(t);
  }, [running, reduced]);

  const steps = [
    { kicker: "TODAY · 2 MIN", title: "Request your audit", body: "Six fields and your LinkedIn URL. That's all we need to begin." },
    { kicker: "WITHIN 2 BUSINESS DAYS", title: "Get your Profile Grade", body: "Scored across all 22 sections, with the biggest gaps named plainly.", dark: true },
    { kicker: `15-MIN CALL WITH ${first.toUpperCase()}`, title: "Walk through the grade", body: "Where the points went, what they're costing you, and whether done-for-you or done-with-you fits." },
    { kicker: "1-HOUR INTERVIEW", title: "Brand Voice Blueprint", body: "We capture how you actually talk. Every word we write from here sounds like you." },
    { kicker: "2–3 WEEKS", title: "Profile rebuilt, re-graded", body: "All 22 sections rewritten and published. You see the before-and-after score." },
  ];

  const dotStyle = (n: number, size: number): React.CSSProperties => {
    const on = n === active;
    const done = n < active;
    return {
      width: size,
      height: size,
      fontSize: size > 50 ? 17 : 15,
      background: on ? "var(--blue)" : done ? "var(--navy)" : "#FFFFFF",
      color: on || done ? "#FFFFFF" : "var(--blue-deep)",
      borderColor: on || done ? "transparent" : "var(--blue)",
      boxShadow: on ? "0 0 0 8px rgba(var(--blue-rgb),0.18), 0 10px 24px rgba(var(--blue-rgb),0.3)" : "none",
      transform: on ? "scale(1.08)" : "scale(1)",
    };
  };
  const cardStyle = (n: number, dark?: boolean): React.CSSProperties => {
    const on = n === active;
    return {
      transform: on ? "translateY(-6px)" : "none",
      boxShadow: on ? (dark ? "0 24px 50px rgba(var(--blue-rgb),0.35)" : "0 18px 40px rgba(var(--blue-rgb),0.18)") : "none",
      borderColor: dark ? undefined : on ? "var(--blue)" : "#DDE8F7",
    };
  };

  const card = (n: number) => {
    const s = steps[n - 1];
    return (
      <div className={`cs-step__card${s.dark ? " cs-step__card--dark" : ""}`} style={cardStyle(n, s.dark)}>
        {s.dark && <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(var(--blue-rgb),0.45), rgba(var(--blue-rgb),0) 70%)" }} />}
        <div className="cs-kicker" style={{ color: s.dark ? "var(--blue-light)" : undefined, position: "relative" }}>
          {s.kicker}
        </div>
        <div className="cs-step__title">{s.title}</div>
        {s.dark ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12, position: "relative" }}>
              <div className="cs-display" style={{ fontWeight: 700, fontSize: 40, lineHeight: 1, letterSpacing: "-0.03em" }}>
                64
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#B9CBE0" }}>/ 100 · Developing</div>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.14)", marginTop: 12, overflow: "hidden", position: "relative" }}>
              <div style={{ height: "100%", width: active >= 2 ? "64%" : "0%", background: "var(--blue)", borderRadius: 999, transition: "width 1.2s cubic-bezier(.2,.7,.2,1)" }} />
            </div>
            <p className="cs-step__body" style={{ color: "#B9CBE0", fontSize: 13.5, lineHeight: 1.55, marginTop: 12, position: "relative" }}>
              {s.body}
            </p>
          </>
        ) : (
          <p className="cs-step__body">{s.body}</p>
        )}
      </div>
    );
  };

  return (
    <div ref={rootRef} data-reveal="1" style={{ position: "relative", marginTop: 52 }} onMouseEnter={() => (paused.current = true)} onMouseLeave={() => (paused.current = false)}>
      {horizontal ? (
        <div className="cs-journey-h">
          {steps.map((_, i) => {
            const n = i + 1;
            return (
              <div key={n} style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="cs-step__dot" style={dotStyle(n, 56)}>
                    {String(n).padStart(2, "0")}
                  </div>
                  {n < 5 && (
                    <div className="cs-line" style={{ flex: 1, height: 2 }}>
                      <div className="cs-line__fill" style={{ height: "100%", width: n < active ? "100%" : "0%" }} />
                    </div>
                  )}
                </div>
                {card(n)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="cs-journey-v">
          {steps.map((_, i) => {
            const n = i + 1;
            return (
              <div key={n} style={{ display: "flex", gap: 18, minWidth: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div className="cs-step__dot" style={dotStyle(n, 48)}>
                    {String(n).padStart(2, "0")}
                  </div>
                  {n < 5 && (
                    <div className="cs-line" style={{ flex: 1, width: 2, margin: "8px 0" }}>
                      <div className="cs-line__fill" style={{ width: "100%", height: n < active ? "100%" : "0%" }} />
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", paddingBottom: n < 5 ? 16 : 0 }}>{card(n)}</div>
              </div>
            );
          })}
        </div>
      )}

      <div className="cs-handoff">
        <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#FFFFFF", border: "1px dashed #B9D2F4", borderRadius: 18, padding: "20px 22px" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--pale)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {content.brand.iconUrl ? <img src={content.brand.iconUrl} alt="" style={{ width: 30, height: 30, objectFit: "contain" }} /> : <span className="cs-display" style={{ fontWeight: 700, fontSize: 14, color: "var(--blue-deep)" }}>✓</span>}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="cs-kicker" style={{ color: "var(--blue-deep)" }}>
              WHERE MOST CLIENTS STOP
            </div>
            <div style={{ fontSize: 14.5, lineHeight: 1.55, color: "#425973", marginTop: 5 }}>An authority-grade profile, your voice on paper, and optional sales coaching when inbound needs converting.</div>
          </div>
        </div>
        {showAuthorityDesk && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#F6F2EA", border: "1px solid rgba(22,19,15,0.12)", borderRadius: 18, padding: "20px 22px", flexWrap: "wrap" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#FCFAF5", border: "1px solid rgba(22,19,15,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <img src="/authority-desk-icon-192.png" alt="The Authority Desk" style={{ width: 32, height: 32, objectFit: "contain", display: "block" }} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="cs-kicker" style={{ color: "#B07C2E" }}>
                OPTIONAL NEXT CHAPTER · THE AUTHORITY DESK
              </div>
              <div style={{ fontSize: 14.5, lineHeight: 1.55, color: "#5E564B", marginTop: 5 }}>Want the profile to keep working? Your Blueprint carries straight into a done-for-you newsroom — published articles under your name, ~20 minutes a month.</div>
            </div>
            <a href={content.brand.authorityDeskUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5, fontWeight: 700, color: "#16130F", whiteSpace: "nowrap", borderBottom: "1.5px solid #B07C2E", paddingBottom: 2 }}>
              Learn more →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
