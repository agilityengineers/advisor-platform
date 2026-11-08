import { Link } from "wouter";
import { parseCriteria, type SiteContent } from "@workspace/shared";
import { useDocumentMeta } from "@/hooks/use-meta";
import { routeBase } from "@/lib/api";
import { PublicShell } from "./PublicShell";
import { SiteHeader, SiteFooter, SiteState } from "./SiteChrome";
import { siteVoice } from "./usePublicSite";
import type { PublicSiteResponse } from "./types";

export function AboutPage() {
  return <PublicShell>{(site) => (site.site.content.visibility.about ? <AboutBody site={site} /> : <SiteState title="That page isn't here" body="This company has not published an About page." />)}</PublicShell>;
}

function AboutBody({ site }: { site: PublicSiteResponse }) {
  const c: SiteContent = site.site.content;
  const { about, brand } = c;
  const { full, company } = siteVoice(c);
  const calendly = site.calendlyUrl;
  const base = routeBase();
  const apply = `${base}/#apply`;
  const bookHref = calendly ?? apply;
  const bookTarget = calendly ? "_blank" : undefined;
  const criteria = parseCriteria(about.criteria);
  const maxWeight = Math.max(1, ...criteria.map((x) => x.weight));
  useDocumentMeta({ title: `${about.eyebrow} — ${company}`, description: about.intro.slice(0, 160) });

  return (
    <>
      <SiteHeader content={c} calendlyUrl={calendly} page="about" />

      <section style={{ background: "linear-gradient(180deg,#FFFFFF 0%,#F4F8FE 100%)", borderBottom: "1px solid #E4EDF9" }}>
        <div className="cs-wrap" style={{ padding: "80px 20px 88px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", gap: 60, alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <div className="cs-eyebrow">{about.eyebrow}</div>
            <h1 className="cs-display" style={{ fontWeight: 700, fontSize: "clamp(36px,4.6vw,56px)", lineHeight: 1.06, letterSpacing: "-0.03em", margin: "18px 0 0", color: "var(--navy)", textWrap: "balance" }}>
              {about.headline}
            </h1>
            <p style={{ fontSize: "clamp(17px,1.4vw,19px)", lineHeight: 1.65, color: "#3D556F", margin: "22px 0 0", maxWidth: "56ch", textWrap: "pretty" }}>{about.intro}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 32 }}>
              <a href={apply} className="cs-btn cs-btn--primary">
                Get my profile audit
              </a>
              <a href={bookHref} target={bookTarget} rel="noopener noreferrer" className="cs-btn cs-btn--secondary">
                Book a 15-min call
              </a>
            </div>
          </div>
          <div style={{ minWidth: 0, display: "flex", justifyContent: "center" }}>
            <div style={{ width: "100%", maxWidth: 440, background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 22, padding: 20, boxShadow: "0 30px 70px rgba(var(--navy-rgb),0.12)" }}>
              {about.heroPhoto ? (
                <img src={about.heroPhoto} alt={full} style={{ display: "block", width: "100%", aspectRatio: "4/5", objectFit: "cover", objectPosition: "50% 18%", borderRadius: 14 }} />
              ) : (
                <div style={{ width: "100%", aspectRatio: "4/5", borderRadius: 14, border: "2px dashed #B9D2F4", background: "var(--pale)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
                  <div className="cs-display" style={{ fontWeight: 600, fontSize: 15, color: "#4E6B8C", lineHeight: 1.5 }}>
                    Add a portrait in Website → About page
                  </div>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
                {brand.ownerPhoto && <img src={brand.ownerPhoto} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", display: "block" }} />}
                <div style={{ minWidth: 0 }}>
                  <div className="cs-display" style={{ fontWeight: 700, fontSize: 16, color: "var(--navy)" }}>
                    {full}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#6A809A" }}>{c.guide.title || brand.ownerTitle}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "#FFFFFF" }}>
        <div className="cs-wrap" style={{ padding: "92px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 56, alignItems: "start" }}>
          <div style={{ minWidth: 0 }}>
            <div className="cs-eyebrow">{about.standEyebrow}</div>
            <h2 className="cs-h2" style={{ fontSize: "clamp(28px,3.2vw,40px)", lineHeight: 1.12 }}>
              {about.standHeadline}
            </h2>
            <p style={{ fontSize: 17, lineHeight: 1.68, color: "#3D556F", margin: "20px 0 0", maxWidth: "58ch", textWrap: "pretty" }}>{about.standP1}</p>
            <p style={{ fontSize: 17, lineHeight: 1.68, color: "#3D556F", margin: "16px 0 0", maxWidth: "58ch", textWrap: "pretty" }}>{about.standP2}</p>
          </div>
          <div style={{ minWidth: 0, display: "grid", gap: 14 }}>
            <div style={{ background: "#F4F8FE", border: "1px solid #DDE8F7", borderRadius: 18, padding: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "var(--blue-deep)" }}>{about.card1Kicker}</div>
              <div className="cs-display" style={{ fontWeight: 600, fontSize: 18, color: "var(--navy)", marginTop: 10 }}>
                {about.card1Title}
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.6, color: "#425973", marginTop: 8 }}>{about.card1Body}</div>
            </div>
            <div style={{ background: "var(--navy)", borderRadius: 18, padding: 24, color: "#FFFFFF" }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "var(--blue-light)" }}>{about.card2Kicker}</div>
              <div className="cs-display" style={{ fontWeight: 600, fontSize: 18, marginTop: 10 }}>
                {about.card2Title}
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.6, color: "#B9CBE0", marginTop: 8 }}>{about.card2Body}</div>
            </div>
          </div>
        </div>
      </section>

      {criteria.length > 0 && (
        <section className="cs-dark">
          <div className="cs-dark__glow" style={{ background: "radial-gradient(900px 420px at 85% 0%, rgba(var(--blue-rgb),0.3), rgba(var(--navy-rgb),0) 70%)" }} />
          <div className="cs-wrap" style={{ padding: "92px 20px" }}>
            <div style={{ maxWidth: 720 }}>
              <div className="cs-eyebrow cs-eyebrow--light">{about.criteriaEyebrow}</div>
              <h2 className="cs-h2 cs-h2--light" style={{ fontSize: "clamp(28px,3.4vw,42px)" }}>
                {about.criteriaHeadline}
              </h2>
              <p style={{ fontSize: 17, lineHeight: 1.65, color: "#B9CBE0", margin: "18px 0 0", maxWidth: "58ch", textWrap: "pretty" }}>{about.criteriaIntro}</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 12, marginTop: 44 }}>
              {criteria.map((cr) => (
                <div key={cr.rank} style={{ display: "flex", alignItems: "center", gap: 16, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "16px 18px", minWidth: 0 }}>
                  <div className="cs-display" style={{ fontWeight: 700, fontSize: 13, color: "var(--blue-light)", width: 26, flexShrink: 0 }}>
                    {cr.rank}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>{cr.label}</div>
                    <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.1)", marginTop: 9, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.round((cr.weight / maxWeight) * 100)}%`, background: "var(--blue)", borderRadius: 999 }} />
                    </div>
                  </div>
                  <div className="cs-display" style={{ fontWeight: 700, fontSize: 16, color: "#FFFFFF", flexShrink: 0 }}>
                    {cr.weight}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section style={{ background: "#F4F8FE", borderBottom: "1px solid #E4EDF9" }}>
        <div className="cs-wrap" style={{ padding: "92px 20px" }}>
          <div style={{ maxWidth: 720 }}>
            <div className="cs-eyebrow">{about.holdEyebrow}</div>
            <h2 className="cs-h2" style={{ fontSize: "clamp(28px,3.4vw,42px)" }}>
              {about.holdHeadline}
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", gap: 20, marginTop: 44 }}>
            {[
              ["01", about.q1Title, about.q1Body],
              ["02", about.q2Title, about.q2Body],
              ["03", about.q3Title, about.q3Body],
            ].map(([n, t, b]) => (
              <div key={n} className="cs-plan-card" style={{ padding: 28 }}>
                <div className="cs-num">{n}</div>
                <h3 style={{ fontSize: 20, marginTop: 18 }}>{t}</h3>
                <p style={{ marginTop: 12 }}>{b}</p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 48, background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 20, padding: 30, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: 28, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "#7C93AD" }}>{about.standardKicker}</div>
              <div className="cs-display" style={{ fontWeight: 700, fontSize: 22, color: "var(--navy)", marginTop: 10, letterSpacing: "-0.01em" }}>
                {about.standardTitle}
              </div>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: "#5A718C", margin: "10px 0 0" }}>{about.standardBody}</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
              <div style={{ background: "var(--navy)", borderRadius: 14, padding: "18px 14px", textAlign: "center", color: "#FFFFFF" }}>
                <div className="cs-display" style={{ fontWeight: 700, fontSize: 22 }}>
                  85–100
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--blue-light)", marginTop: 4, letterSpacing: "0.06em" }}>EXPERT</div>
              </div>
              <div style={{ background: "var(--pale)", borderRadius: 14, padding: "18px 14px", textAlign: "center" }}>
                <div className="cs-display" style={{ fontWeight: 700, fontSize: 22, color: "var(--navy)" }}>
                  70–84
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--blue-deep)", marginTop: 4, letterSpacing: "0.06em" }}>PROFICIENT</div>
              </div>
              <div style={{ background: "#F4F8FE", border: "1px solid #DDE8F7", borderRadius: 14, padding: "18px 14px", textAlign: "center" }}>
                <div className="cs-display" style={{ fontWeight: 700, fontSize: 22, color: "var(--navy)" }}>
                  &lt;70
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#6A809A", marginTop: 4, letterSpacing: "0.06em" }}>DEVELOPING</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "#FFFFFF" }}>
        <div className="cs-wrap" style={{ padding: "92px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 56, alignItems: "center" }}>
          <div style={{ minWidth: 0, order: 2 }}>
            <div className="cs-eyebrow">{about.workEyebrow}</div>
            <h2 className="cs-h2" style={{ fontSize: "clamp(28px,3.2vw,40px)", lineHeight: 1.12 }}>
              {about.workHeadline}
            </h2>
            <p style={{ fontSize: 17, lineHeight: 1.68, color: "#3D556F", margin: "20px 0 0", maxWidth: "58ch", textWrap: "pretty" }}>{about.workBody}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 26 }}>
              {[about.workBullet1, about.workBullet2, about.workBullet3].filter(Boolean).map((b) => (
                <div key={b} className="cs-bullet">
                  <div className="cs-check">✓</div>
                  <div className="cs-bullet__text">{b}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ minWidth: 0, order: 1 }}>
            {about.workPhoto ? (
              <img src={about.workPhoto} alt={full} style={{ display: "block", width: "100%", aspectRatio: "5/4", objectFit: "cover", objectPosition: "50% 25%", borderRadius: 22, boxShadow: "0 24px 60px rgba(var(--navy-rgb),0.14)" }} />
            ) : (
              <div style={{ width: "100%", aspectRatio: "5/4", borderRadius: 22, border: "2px dashed #B9D2F4", background: "var(--pale)" }} />
            )}
          </div>
        </div>
      </section>

      <section className="cs-dark">
        <div className="cs-dark__glow" style={{ background: "radial-gradient(800px 420px at 20% 100%, rgba(var(--blue-rgb),0.32), rgba(var(--navy-rgb),0) 70%)" }} />
        <div className="cs-wrap" style={{ padding: "84px 20px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 28 }}>
          <div style={{ minWidth: 0, flex: "1 1 380px" }}>
            <h2 className="cs-h2 cs-h2--light" style={{ fontSize: "clamp(28px,3.2vw,40px)", margin: 0 }}>
              {about.ctaHeadline}
            </h2>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: "#B9CBE0", margin: "14px 0 0", maxWidth: "52ch" }}>{about.ctaBody}</p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            <a href={apply} className="cs-btn cs-btn--primary">
              Get my profile audit
            </a>
            {calendly && (
              <a href={calendly} target="_blank" rel="noopener noreferrer" className="cs-btn cs-btn--white" style={{ fontSize: 16, padding: "16px 28px" }}>
                Book on Calendly →
              </a>
            )}
          </div>
        </div>
      </section>

      <SiteFooter
        content={c}
        right={
          <Link href="/" className="cs-footer__cta">
            ← Back to home
          </Link>
        }
      />
    </>
  );
}
