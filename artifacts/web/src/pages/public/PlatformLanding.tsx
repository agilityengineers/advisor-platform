import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Menu, X } from "lucide-react";
import type { PlatformContent, PlatformFormIntent, TemplateCardStyle } from "@workspace/shared";
import { api, ApiError } from "@/lib/api";
import { useDocumentMeta } from "@/hooks/use-meta";
import { Spinner } from "@/components/ui";
import type { PlatformLeadResponse } from "./types";

interface PlatformContentResponse {
  content: PlatformContent;
  version: number;
  preview: boolean;
  publishedAt: string | null;
}

const TEMPLATE_STYLES: Record<TemplateCardStyle, { bg: string; ink: string; accent: string; line: string }> = {
  cream: { bg: "#F6F2EA", ink: "#16130F", accent: "#B07C2E", line: "rgba(22,19,15,0.12)" },
  green: { bg: "#13231C", ink: "#FBF8F2", accent: "#B07C2E", line: "rgba(237,231,218,0.2)" },
  blue: { bg: "#EAF2FD", ink: "#0A1626", accent: "#1668F0", line: "rgba(10,22,38,0.12)" },
};

const HERO_COLS = [
  { name: "New", dot: "#B07C2E", n: 3, cards: ["80%", "65%"] },
  { name: "Contacted", dot: "#5E564B", n: 2, cards: ["70%"] },
  { name: "Call booked", dot: "#13231C", n: 2, cards: ["75%", "55%"] },
  { name: "Client", dot: "#16130F", n: 4, cards: ["60%"] },
];

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#tour", label: "The console" },
  { href: "#ai", label: "AI" },
  { href: "#white-label", label: "White label" },
  { href: "#faq", label: "FAQ" },
];

function Eyebrow({ children, center }: { children: string; center?: boolean }) {
  return (
    <div className={`ap-eyebrow${center ? " ap-eyebrow--center" : ""}`}>
      <span className="ap-eyebrow__rule" />
      <span className="ap-eyebrow__text">{children}</span>
      {center && <span className="ap-eyebrow__rule" />}
    </div>
  );
}

/** The Advisor Platform landing page, rendered from the published platform content. */
export function PlatformLanding() {
  const preview = new URLSearchParams(window.location.search).get("preview") === "1";
  const q = useQuery<PlatformContentResponse>({ queryKey: ["platform-content", preview], queryFn: () => api(`/platform-content${preview ? "?preview=1" : ""}`), staleTime: preview ? 0 : 60_000 });
  useDocumentMeta({ title: "Advisor Platform — Run your authority practice like a business", description: q.data?.content.hero.sub.slice(0, 160) });
  if (!q.data) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "#F6F2EA" }}>
        {q.isError ? <div style={{ fontFamily: "Newsreader, serif", fontSize: 22, color: "#16130F" }}>We couldn't load the page. Please refresh.</div> : <Spinner />}
      </div>
    );
  }
  return <PlatformBody content={q.data.content} preview={q.data.preview} />;
}

function PlatformBody({ content: c, preview }: { content: PlatformContent; preview: boolean }) {
  const [open, setOpen] = useState(false);
  const calendly = c.founder.calendlyUrl;

  return (
    <div className="ap-site">
      {preview && <div style={{ background: "#16130F", color: "#F6F2EA", fontSize: 12.5, fontWeight: 600, letterSpacing: "0.08em", textAlign: "center", padding: "8px 16px" }}>DRAFT PREVIEW · ONLY YOU CAN SEE THIS VERSION</div>}
      <header className="ap-header">
        <div className="ap-wrap ap-header__row">
          <a href="#top" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="ap-serif" style={{ width: 30, height: 30, borderRadius: 8, background: "#16130F", color: "#F6F2EA", fontWeight: 600, fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center" }}>
              A
            </div>
            <span className="ap-serif" style={{ fontWeight: 500, fontSize: 21, letterSpacing: "-0.01em" }}>
              Advisor Platform
            </span>
          </a>
          <nav aria-label="Primary" className="ap-nav">
            <div className="ap-nav__links">
              {NAV.map((n) => (
                <a key={n.href} href={n.href}>
                  {n.label}
                </a>
              ))}
            </div>
            <a href="#demo" className="ap-btn">
              {c.hero.primaryCta}
            </a>
            <button type="button" className="ap-menu-btn" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </nav>
        </div>
        {open && (
          <div className="ap-menu" onClick={() => setOpen(false)}>
            {NAV.map((n) => (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
            <a href="#demo" style={{ color: "#B07C2E" }}>
              {c.hero.primaryCta}
            </a>
            <a href="/staff/login">Sign in</a>
          </div>
        )}
      </header>

      <section id="top" style={{ padding: "96px 24px 104px" }}>
        <div className="ap-wrap ap-grid-2" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <div style={{ minWidth: 0 }}>
            <Eyebrow>{c.hero.eyebrow}</Eyebrow>
            <h1 className="ap-h1">
              {c.hero.headline}
              <br />
              <em>{c.hero.headlineEm}</em>
            </h1>
            <p style={{ fontSize: 19, lineHeight: 1.62, color: "#5E564B", margin: "26px 0 0", maxWidth: "33em", textWrap: "pretty" }}>{c.hero.sub}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", marginTop: 34 }}>
              <a href="#demo" className="ap-btn ap-btn--lg">
                {c.hero.primaryCta}
              </a>
              <a href="#trial" className="ap-link">
                {c.hero.secondaryCta}
              </a>
            </div>
            <div style={{ marginTop: 28, fontSize: 14.5, color: "#7a7163", display: "flex", gap: 9, alignItems: "center" }}>
              <span style={{ color: "#B07C2E", fontSize: 18 }}>✦</span>
              {c.hero.note}
            </div>
          </div>
          <div style={{ minWidth: 0, position: "relative", minHeight: 440, display: "flex", alignItems: "center" }}>
            <div className="ap-console">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#9a9082", fontWeight: 600 }}>Your console · Pipeline</span>
                <span style={{ fontSize: 10.5, textTransform: "uppercase", color: "#B07C2E", border: "1px solid #B07C2E", borderRadius: 100, padding: "4px 11px", fontWeight: 600 }}>Live</span>
              </div>
              <div className="ap-console__cols">
                {HERO_COLS.map((col) => (
                  <div key={col.name} style={{ background: "#F6F2EA", border: "1px solid rgba(22,19,15,0.1)", borderRadius: 8, padding: 10, minHeight: 150 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#433d34" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: col.dot }} />
                      {col.name}
                      <span style={{ marginLeft: "auto", color: "#9a9082" }}>{col.n}</span>
                    </div>
                    {col.cards.map((w) => (
                      <div key={w} style={{ marginTop: 8, background: "#FCFAF5", border: "1px solid rgba(22,19,15,0.1)", borderRadius: 6, padding: 8 }}>
                        <div style={{ height: 7, width: w, borderRadius: 4, background: "rgba(22,19,15,0.35)" }} />
                        <div style={{ height: 5, width: "60%", borderRadius: 4, background: "rgba(22,19,15,0.12)", marginTop: 6 }} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(22,19,15,0.1)" }}>
                <div className="ap-serif" style={{ width: 34, height: 34, borderRadius: "50%", background: "#13231C", color: "#F6F2EA", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #B07C2E", flexShrink: 0 }}>
                  AI
                </div>
                <div style={{ fontSize: 13.5, color: "#5E564B" }}>
                  <strong style={{ color: "#16130F" }}>{c.hero.aiLineStrong}</strong> {c.hero.aiLine}
                </div>
              </div>
            </div>
            <div className="ap-float" style={{ top: -22, right: -14, background: "#13231C", color: "#EDE7DA", padding: "14px 18px", boxShadow: "0 18px 36px -18px rgba(19,35,28,0.6)" }}>
              <div className="ap-serif" style={{ fontSize: 26, color: "#B07C2E", lineHeight: 1 }}>
                {c.hero.chipValue} <span style={{ fontSize: 14 }}>{c.hero.chipUnit}</span>
              </div>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(237,231,218,0.72)", marginTop: 4 }}>{c.hero.chipLabel}</div>
            </div>
            <div className="ap-float" style={{ bottom: -24, left: -18, background: "#FCFAF5", border: "1px solid rgba(22,19,15,0.13)", padding: "12px 16px", boxShadow: "0 18px 36px -20px rgba(22,19,15,0.3)", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#B07C2E" }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{c.hero.domainChip}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="ap-trust">
        <div className="ap-wrap ap-trust__row">
          {c.trust.items.map((t, i) => (
            <span key={t} style={{ display: "contents" }}>
              {i > 0 && <span style={{ opacity: 0.4 }}>·</span>}
              <span>{t}</span>
            </span>
          ))}
        </div>
      </div>

      <section id="how" className="ap-section">
        <div className="ap-wrap" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
            <Eyebrow center>{c.how.eyebrow}</Eyebrow>
            <h2 className="ap-h2" style={{ fontSize: "clamp(32px,4.4vw,54px)" }}>
              {c.how.headline} <em>{c.how.headlineEm}</em>
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", gap: 28, marginTop: 56 }}>
            {c.how.steps.map((s) => (
              <div key={s.label} className="ap-step">
                <div className="ap-step__label">{s.label}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="tour" style={{ background: "#13231C", color: "#EDE7DA", padding: "110px 24px" }}>
        <div className="ap-wrap" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <div style={{ textAlign: "center", maxWidth: 820, margin: "0 auto" }}>
            <Eyebrow center>{c.tour.eyebrow}</Eyebrow>
            <h2 className="ap-h2" style={{ fontSize: "clamp(34px,4.6vw,58px)", color: "#FBF8F2" }}>
              {c.tour.headline}
              <br />
              <em>{c.tour.headlineEm}</em>
            </h2>
            <p style={{ fontSize: 18.5, lineHeight: 1.62, color: "rgba(237,231,218,0.78)", margin: "20px 0 0" }}>{c.tour.intro}</p>
          </div>
          <div className="ap-tour">
            {c.tour.cells.map((t) => (
              <div key={t.n} className="ap-tour__cell">
                <div className="ap-serif" style={{ fontSize: 34, color: "#B07C2E", lineHeight: 1 }}>
                  {t.n}
                </div>
                <h3 className="ap-serif" style={{ fontWeight: 500, fontSize: 21, color: "#FBF8F2", margin: "14px 0 0" }}>
                  {t.title}
                </h3>
                <p style={{ fontSize: 15, lineHeight: 1.55, color: "rgba(237,231,218,0.72)", margin: "10px 0 0" }}>{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="ai" className="ap-section">
        <div className="ap-wrap" style={{ paddingLeft: 0, paddingRight: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", gap: 64, alignItems: "start" }}>
          <div style={{ minWidth: 0 }}>
            <Eyebrow>{c.ai.eyebrow}</Eyebrow>
            <h2 className="ap-h2" style={{ fontSize: "clamp(32px,4.4vw,54px)", maxWidth: "18ch" }}>
              {c.ai.headline} <em>{c.ai.headlineEm}</em>
            </h2>
            <p style={{ fontSize: 18, lineHeight: 1.62, color: "#5E564B", margin: "22px 0 0", maxWidth: "38ch" }}>{c.ai.intro}</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {c.ai.items.map((a) => (
              <div key={a.letter + a.title} className="ap-ai-item">
                <div className="ap-serif" style={{ fontSize: 22, color: "#B07C2E", flexShrink: 0, width: 28 }}>
                  {a.letter}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px" }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{a.title}</h3>
                    <span className={`ap-tag ${a.tag === "now" ? "ap-tag--now" : "ap-tag--roadmap"}`}>{a.tag === "now" ? "Available now" : "Roadmap"}</span>
                  </div>
                  <p style={{ fontSize: 15.5, lineHeight: 1.6, color: "#5E564B", margin: "8px 0 0" }}>{a.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="white-label" className="ap-section--flush">
        <div className="ap-wrap ap-panel" style={{ paddingLeft: "clamp(24px,4.5vw,56px)", paddingRight: "clamp(24px,4.5vw,56px)" }}>
          <div style={{ minWidth: 0 }}>
            <Eyebrow>{c.whiteLabel.eyebrow}</Eyebrow>
            <h2 className="ap-h2" style={{ fontSize: "clamp(30px,3.8vw,46px)", lineHeight: 1.08 }}>
              {c.whiteLabel.headline}
              <br />
              <em>{c.whiteLabel.headlineEm}</em>
            </h2>
            <p style={{ fontSize: 17.5, lineHeight: 1.62, color: "#5E564B", margin: "20px 0 0", maxWidth: "40ch" }}>{c.whiteLabel.body}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24, fontSize: 15, color: "#433d34" }}>
              {c.whiteLabel.bullets.map((b) => (
                <div key={b} style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "#B07C2E" }}>—</span>
                  {b}
                </div>
              ))}
            </div>
          </div>
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {c.whiteLabel.brands.map((b) => (
              <div key={b.name} className="ap-brand-row">
                <div style={{ width: 40, height: 40, borderRadius: 10, background: b.color, color: "#FFFFFF", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {b.name
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{b.name}</div>
                  <div style={{ fontSize: 12.5, color: "#8b8274", overflowWrap: "anywhere" }}>{b.domain}</div>
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  <span style={{ width: 14, height: 14, borderRadius: "50%", background: b.color }} />
                  <span style={{ width: 14, height: 14, borderRadius: "50%", background: b.accent }} />
                </div>
              </div>
            ))}
            <div style={{ fontSize: 12.5, color: "#8b8274", textAlign: "center", marginTop: 4 }}>{c.whiteLabel.note}</div>
          </div>
        </div>
      </section>

      <section className="ap-section--flush">
        <div className="ap-wrap" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
            <div>
              <Eyebrow>{c.integrations.eyebrow}</Eyebrow>
              <h2 className="ap-h2" style={{ fontSize: "clamp(30px,3.8vw,46px)", lineHeight: 1.08, marginTop: 16 }}>
                {c.integrations.headline}
              </h2>
            </div>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: "#5E564B", margin: 0, maxWidth: "34ch" }}>{c.integrations.aside}</p>
          </div>
          <div className="ap-int-grid">
            {c.integrations.items.map((i) => (
              <div key={i.name}>
                <div className="ap-serif" style={{ fontWeight: 500, fontSize: 22 }}>
                  {i.name}
                </div>
                <div style={{ fontSize: 15, lineHeight: 1.6, color: "#5E564B", marginTop: 8 }}>{i.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ap-section--flush">
        <div className="ap-wrap" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
            <Eyebrow center>{c.templates.eyebrow}</Eyebrow>
            <h2 className="ap-h2" style={{ fontSize: "clamp(32px,4.4vw,54px)" }}>
              {c.templates.headline}
            </h2>
            <p style={{ fontSize: 17, lineHeight: 1.62, color: "#5E564B", margin: "18px 0 0" }}>{c.templates.intro}</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: 20, marginTop: 48 }}>
            {c.templates.showcase.map((t) => {
              const s = TEMPLATE_STYLES[t.style] ?? TEMPLATE_STYLES.cream;
              return (
                <div key={t.name} className="ap-tpl">
                  <div style={{ background: s.bg, padding: 18, height: 150, display: "flex", flexDirection: "column", gap: 7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div style={{ height: 8, width: 60, borderRadius: 4, background: s.ink }} />
                      <div style={{ height: 14, width: 54, borderRadius: 100, background: s.accent }} />
                    </div>
                    <div style={{ height: 13, width: "80%", borderRadius: 4, background: s.ink, marginTop: 10 }} />
                    <div style={{ height: 13, width: "55%", borderRadius: 4, background: s.ink }} />
                    <div style={{ height: 6, width: "85%", borderRadius: 3, background: s.line, marginTop: 8 }} />
                    <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                      {[0, 1, 2].map((k) => (
                        <div key={k} style={{ flex: 1, height: 22, borderRadius: 5, background: s.line }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: 18 }}>
                    <div className="ap-serif" style={{ fontWeight: 500, fontSize: 20 }}>
                      {t.name}
                    </div>
                    <div style={{ fontSize: 13.5, color: "#8b8274", marginTop: 4 }}>{t.audience}</div>
                    <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "#B07C2E", fontWeight: 600, marginTop: 12 }}>{t.tag}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="ap-section--flush">
        <div className="ap-wrap" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <Eyebrow>{c.testimonials.eyebrow}</Eyebrow>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", gap: 20, marginTop: 28 }}>
            {c.testimonials.quotes.map((qt, i) => (
              <div key={i} className="ap-quote">
                <div className="ap-serif" style={{ fontStyle: "italic", fontSize: 19, lineHeight: 1.45, color: "#5E564B", flex: 1 }}>
                  {qt.text}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22 }}>
                  <div className="ap-serif" style={{ width: 40, height: 40, borderRadius: "50%", background: "#13231C", color: "#F6F2EA", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #B07C2E" }}>
                    {qt.name.startsWith("Name TBD") ? "—" : qt.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{qt.name}</div>
                    <div style={{ fontSize: 12.5, color: "#8b8274" }}>{qt.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {c.testimonials.note && <div style={{ fontSize: 12.5, color: "#8b8274", marginTop: 12 }}>{c.testimonials.note}</div>}
        </div>
      </section>

      <section id="faq" className="ap-section--flush">
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          <div style={{ textAlign: "center" }}>
            <Eyebrow center>{c.faq.eyebrow}</Eyebrow>
            <h2 className="ap-h2" style={{ fontSize: "clamp(32px,4.4vw,54px)" }}>
              {c.faq.headline}
            </h2>
          </div>
          <div className="ap-faq" style={{ borderTop: "1px solid rgba(22,19,15,0.14)", marginTop: 44 }}>
            {c.faq.items.map((f) => (
              <details key={f.q}>
                <summary>
                  <span>{f.q}</span>
                  <span className="ap-faq__plus" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="demo" style={{ background: "#16130F", color: "#F6F2EA", padding: "110px 24px" }}>
        <div className="ap-wrap" style={{ paddingLeft: 0, paddingRight: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", gap: 56, alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <Eyebrow>{c.founder.eyebrow}</Eyebrow>
            <h2 className="ap-h2" style={{ fontSize: "clamp(34px,4.6vw,56px)", lineHeight: 1.04, color: "#FBF8F2" }}>
              {c.founder.headline} <em>{c.founder.headlineEm}</em>
            </h2>
            <p style={{ fontSize: 17.5, lineHeight: 1.65, color: "rgba(246,242,234,0.74)", margin: "22px 0 0", maxWidth: "46ch" }}>{c.founder.body}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 28 }}>
              <div className="ap-serif" style={{ width: 52, height: 52, borderRadius: "50%", background: "#B07C2E", color: "#16130F", fontWeight: 600, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {c.founder.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </div>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 600 }}>{c.founder.name}</div>
                <div style={{ fontSize: 13, color: "rgba(246,242,234,0.6)" }}>{c.founder.title}</div>
              </div>
            </div>
            {calendly && (
              <a href={calendly} target="_blank" rel="noopener noreferrer" className="ap-link ap-link--light" style={{ display: "inline-block", marginTop: 28 }}>
                {c.founder.calendlyLabel}
              </a>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <DemoForm content={c} />
          </div>
        </div>
      </section>

      <footer className="ap-footer">
        <div className="ap-wrap" style={{ paddingLeft: 0, paddingRight: 0, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
          <div>
            <div className="ap-serif" style={{ fontSize: 18, color: "#F6F2EA" }}>
              Advisor Platform
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{c.footer.tagline}</div>
          </div>
          <div style={{ fontSize: 13, display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
            <span>advisor-platform.com</span>
            <span>advisor-platform.authority-desk.com</span>
            <a href="/staff/login">Sign in</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

type Field = "name" | "company" | "email" | "linkedin";

function DemoForm({ content: c }: { content: PlatformContent }) {
  const [form, setForm] = useState<Record<Field, string>>({ name: "", company: "", email: "", linkedin: "" });
  const [hp, setHp] = useState("");
  const [intent, setIntent] = useState<PlatformFormIntent>("demo");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [sent, setSent] = useState<PlatformLeadResponse | null>(null);
  const f = c.form;

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((s) => ({ ...s, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const errs: Partial<Record<Field, string>> = {};
    if (form.name.trim().length < 2) errs.name = "Please tell us your name.";
    if (!form.company.trim()) errs.company = "Which practice or company is this for?";
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(form.email.trim())) errs.email = "That email doesn't look right.";
    if (Object.keys(errs).length) {
      setErrors(errs);
      document.getElementById(`ap-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setStatus("submitting");
    try {
      const r = await api<PlatformLeadResponse>("/public/platform-leads", { method: "POST", json: { ...form, intent, website: hp } });
      setSent(r);
    } catch (err) {
      const field = err instanceof ApiError && typeof err.data?.field === "string" ? (err.data.field as Field) : "email";
      setErrors({ [field]: err instanceof ApiError && err.status === 400 ? err.message : "Something went wrong sending that. Please try again." });
    } finally {
      setStatus("idle");
    }
  };

  if (sent) {
    const first = sent.firstName || form.name.split(" ")[0] || "there";
    return (
      <div role="status" style={{ background: "#FCFAF5", color: "#16130F", borderRadius: 10, padding: "44px 32px", textAlign: "center" }}>
        <div className="ap-serif" style={{ fontSize: 28, fontWeight: 500 }}>
          {f.successTitle.replace(/\{firstName\}/g, first)}
        </div>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: "#5E564B", margin: "12px 0 0" }}>{f.successBody}</p>
        {(sent.calendlyUrl || c.founder.calendlyUrl) && (
          <a href={sent.calendlyUrl ?? c.founder.calendlyUrl} target="_blank" rel="noopener noreferrer" className="ap-btn ap-btn--md" style={{ marginTop: 22 }}>
            {f.successCta}
          </a>
        )}
      </div>
    );
  }

  const input = (k: Field, label: string, type = "text", placeholder?: string, required = true) => (
    <div className="ap-field">
      <label htmlFor={`ap-${k}`}>{label}</label>
      <input id={`ap-${k}`} type={type} required={required} placeholder={placeholder} value={form[k]} onChange={set(k)} className={`ap-input${errors[k] ? " ap-input--error" : ""}`} />
      {errors[k] && (
        <div role="alert" className="ap-error">
          {errors[k]}
        </div>
      )}
    </div>
  );

  return (
    <form id="trial" onSubmit={submit} noValidate className="ap-form">
      <div>
        <div className="ap-serif" style={{ fontSize: 24, fontWeight: 500 }}>
          {f.title}
        </div>
        <div style={{ fontSize: 14, color: "#7a7163", marginTop: 4 }}>{f.sub}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(180px,100%),1fr))", gap: 12 }}>
        {input("name", "Your name")}
        {input("company", "Company / practice")}
      </div>
      {input("email", "Work email", "email")}
      {input("linkedin", "Your LinkedIn", "text", "linkedin.com/in/you", false)}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>I'd like to</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="ap-intent" aria-pressed={intent === "demo"} onClick={() => setIntent("demo")}>
            {f.demoLabel}
          </button>
          <button type="button" className="ap-intent" aria-pressed={intent === "trial"} onClick={() => setIntent("trial")}>
            {f.trialLabel}
          </button>
        </div>
      </div>
      <div className="ap-hp" aria-hidden="true">
        <label htmlFor="ap-website">Website</label>
        <input id="ap-website" type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
      </div>
      <button type="submit" className="ap-submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending…" : intent === "trial" ? f.trialSubmit : f.demoSubmit}
      </button>
      <div style={{ fontSize: 12.5, color: "#7a7163", textAlign: "center" }}>{f.footnote}</div>
    </form>
  );
}
