import { useEffect, useState } from "react";
import type { SiteContent } from "@workspace/shared";
import { initials } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-media-query";
import type { PublicReview } from "./types";

const AUTOPLAY_MS = 6000;

/** "What clients say": dark quote card rotating every 6s, paused on hover, with dots, arrows and the next three. */
export function ReviewSlider({ content, reviews }: { content: SiteContent; reviews: PublicReview[] }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const n = reviews.length;

  useEffect(() => {
    if (n < 2 || paused || reduced) return;
    const t = window.setInterval(() => setIdx((i) => (i + 1) % n), AUTOPLAY_MS);
    return () => window.clearInterval(t);
  }, [n, paused, reduced]);

  if (n === 0) return null;
  const a = reviews[idx % n];
  const step = (d: number) => setIdx((i) => (i + d + n) % n);
  const upcoming = n > 1 ? [1, 2, 3].filter((k) => k < n).map((k) => ({ r: reviews[(idx + k) % n], at: (idx + k) % n })) : [];
  const t = content.testimonials;

  return (
    <section style={{ background: "#F4F8FE", borderTop: "1px solid #E4EDF9", borderBottom: "1px solid #E4EDF9" }}>
      <div className="cs-wrap cs-section--tight">
        <div data-reveal="1" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "20px 40px" }}>
          <div style={{ maxWidth: 620, minWidth: 0 }}>
            <div className="cs-eyebrow">{t.eyebrow}</div>
            <h2 className="cs-h2" style={{ fontSize: "clamp(28px,3.2vw,42px)", lineHeight: 1.12 }}>
              {t.headline}
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: "#5A718C", margin: "14px 0 0" }}>{t.intro}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" className="cs-arrow" onClick={() => step(-1)} aria-label="Previous review">
              ←
            </button>
            <button type="button" className="cs-arrow" onClick={() => step(1)} aria-label="Next review">
              →
            </button>
          </div>
        </div>

        <div
          data-reveal="1"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          aria-live="polite"
          style={{ marginTop: 36, background: "var(--navy)", borderRadius: 22, padding: "clamp(28px,4vw,44px)", color: "#FFFFFF", position: "relative", overflow: "hidden", minHeight: 300, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 28 }}
        >
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(700px 320px at 90% 0%, rgba(var(--blue-rgb),0.3), rgba(var(--navy-rgb),0) 70%)" }} />
          <div style={{ position: "relative", minWidth: 0 }}>
            <div className="cs-display" style={{ fontWeight: 700, fontSize: 48, lineHeight: 0.6, color: "var(--blue-light)" }}>
              “
            </div>
            <div style={{ marginTop: 16, minHeight: 120 }}>
              <p key={a.id} className="cs-quote">
                {a.quote}
              </p>
            </div>
          </div>
          <div style={{ position: "relative", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
              <div className="cs-display" style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--blue)", color: "var(--on-primary)", fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {initials(a.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                {a.linkedin ? (
                  <a href={`https://${a.linkedin.replace(/^https?:\/\//, "")}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 15.5, fontWeight: 700, color: "#FFFFFF" }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--blue-light)")} onMouseLeave={(e) => (e.currentTarget.style.color = "#FFFFFF")}>
                    {a.name}
                  </a>
                ) : (
                  <div style={{ fontSize: 15.5, fontWeight: 700, color: "#FFFFFF" }}>{a.name}</div>
                )}
                <div style={{ fontSize: 13, color: "#B9CBE0", fontWeight: 600, marginTop: 2 }}>{a.role}</div>
                <div style={{ fontSize: 11.5, color: "var(--blue-light)", fontWeight: 700, marginTop: 4, letterSpacing: "0.06em" }}>LINKEDIN RECOMMENDATION · {(a.category || "").toUpperCase()}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {reviews.map((r, i) => (
                <button key={r.id} type="button" className="cs-dotbtn" onClick={() => setIdx(i)} aria-label={`Review ${i + 1}`} style={{ width: i === idx % n ? 28 : 8, background: i === idx % n ? "var(--blue)" : "rgba(255,255,255,0.28)" }} />
              ))}
            </div>
          </div>
        </div>

        {upcoming.length > 0 && (
          <div data-reveal="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: 16, marginTop: 16 }}>
            {upcoming.map(({ r, at }) => (
              <button key={r.id} type="button" className="cs-upcoming" onClick={() => setIdx(at)}>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "#2B3F57", textWrap: "pretty" }}>“{r.quote.length > 120 ? `${r.quote.slice(0, 120).trim()}…` : r.quote}”</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--pale)", color: "var(--blue-deep)", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(r.name)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--navy)" }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: "#6A809A", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.role}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
