import { Link } from "wouter";
import type { SiteContent } from "@workspace/shared";
import { useDocumentMeta } from "@/hooks/use-meta";
import { useHashScroll } from "@/hooks/use-reveal";
import { initials } from "@/lib/utils";
import { PublicShell } from "./PublicShell";
import { SiteHeader, SiteFooter } from "./SiteChrome";
import { HeroMedia } from "./HeroMedia";
import { JourneyMap } from "./JourneyMap";
import { ReviewSlider } from "./ReviewSlider";
import { ApplyForm } from "./ApplyForm";
import { siteVoice } from "./usePublicSite";
import type { PublicSiteResponse } from "./types";

export function CompanyLanding() {
  return <PublicShell>{(site) => <LandingBody site={site} />}</PublicShell>;
}

function LandingBody({ site }: { site: PublicSiteResponse }) {
  const c: SiteContent = site.site.content;
  const { brand, hero, journey, cost, guide, plan, apply, visibility: show } = c;
  const { first } = siteVoice(c);
  const calendly = site.calendlyUrl;
  const book = calendly ?? "#apply";
  const bookTarget = calendly ? "_blank" : undefined;
  const features = site.company.publicFeatures;
  useDocumentMeta({ title: `${brand.companyName}${site.company.branding.tagline ? ` — ${site.company.branding.tagline}` : ""}`, description: hero.subhead.slice(0, 160) });
  useHashScroll(true);

  return (
    <>
      <SiteHeader content={c} calendlyUrl={calendly} page="landing" />

      <section id="top" className="cs-hero">
        <div className="cs-hero__glow" />
        <div className="cs-wrap cs-hero__grid">
          <div data-reveal="1" style={{ minWidth: 0 }}>
            <div className="cs-hero__pill">{hero.eyebrow}</div>
            <h1 className="cs-hero__h1">{hero.headline}</h1>
            <p className="cs-hero__sub">{hero.subhead}</p>
            <div className="cs-hero__ctas">
              <a href="#apply" className="cs-btn cs-btn--primary">
                {hero.primaryCta}
              </a>
              <a href={book} target={bookTarget} rel="noopener noreferrer" className="cs-btn cs-btn--secondary">
                {hero.secondaryCta}
              </a>
            </div>
            <div className="cs-hero__stats">
              {[
                [hero.stat1Value, hero.stat1Label],
                [hero.stat2Value, hero.stat2Label],
                [hero.stat3Value, hero.stat3Label],
              ].map(([v, l]) => (
                <div key={l} style={{ minWidth: 0 }}>
                  <div className="cs-stat__v">{v}</div>
                  <div className="cs-stat__l">{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div data-reveal="1" style={{ minWidth: 0, display: "flex", justifyContent: "center" }}>
            <HeroMedia content={c} videoAllowed={features.hero_video} />
          </div>
        </div>
      </section>

      {show.journey && (
        <section id="journey" style={{ background: "#FFFFFF", borderBottom: "1px solid #E4EDF9" }}>
          <div className="cs-wrap cs-section--journey">
            <div data-reveal="1" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "20px 40px" }}>
              <div style={{ maxWidth: 640, minWidth: 0 }}>
                <div className="cs-eyebrow">{journey.eyebrow}</div>
                <h2 className="cs-h2" style={{ fontSize: "clamp(28px,3.4vw,42px)", marginTop: 14 }}>
                  {journey.headline}
                </h2>
              </div>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: "#5A718C", margin: 0, maxWidth: "34ch", textWrap: "pretty" }}>{journey.intro}</p>
            </div>
            <JourneyMap content={c} showAuthorityDesk={features.authority_desk && Boolean(brand.authorityDeskUrl)} />
            <div data-reveal="1" style={{ marginTop: 40, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <a href="#apply" className="cs-btn cs-btn--primary" style={{ padding: "16px 30px", boxShadow: "0 14px 30px rgba(var(--blue-rgb),0.3)" }}>
                Start at step 01 — get my grade
              </a>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#6A809A" }}>Free · Reviewed personally · Reply in 2 business days</div>
            </div>
          </div>
        </section>
      )}

      {show.cost && (
        <section id="cost" className="cs-dark">
          <div className="cs-dark__glow" style={{ background: "radial-gradient(900px 400px at 15% 0%, rgba(var(--blue-rgb),0.28), rgba(var(--navy-rgb),0) 70%)" }} />
          <div className="cs-wrap cs-section">
            <div data-reveal="1" style={{ maxWidth: 760 }}>
              <div className="cs-eyebrow cs-eyebrow--light">{cost.eyebrow}</div>
              <h2 className="cs-h2 cs-h2--light" style={{ fontSize: "clamp(30px,3.6vw,46px)", marginTop: 18 }}>
                {cost.headline}
              </h2>
              <p style={{ fontSize: 18, lineHeight: 1.65, color: "#B9CBE0", margin: "20px 0 0", maxWidth: "60ch", textWrap: "pretty" }}>{cost.intro}</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(250px,100%),1fr))", gap: 20, marginTop: 52 }}>
              {[
                [cost.card1Title, cost.card1Body],
                [cost.card2Title, cost.card2Body],
                [cost.card3Title, cost.card3Body],
                [cost.card4Title, cost.card4Body],
              ].map(([t, b]) => (
                <div key={t} data-reveal="1" className="cs-cost-card">
                  <div className="cs-cost-card__t">{t}</div>
                  <div className="cs-cost-card__b">{b}</div>
                </div>
              ))}
            </div>
            <div data-reveal="1" style={{ marginTop: 44, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18, background: "rgba(var(--blue-rgb),0.14)", border: "1px solid rgba(127,182,255,0.35)", borderRadius: 18, padding: "24px 26px" }}>
              <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.55, color: "#E7F0FB", minWidth: 0, flex: "1 1 320px" }}>{cost.banner}</div>
              <a href="#apply" className="cs-btn cs-btn--white">
                Start with an audit
              </a>
            </div>
          </div>
        </section>
      )}

      {show.guide && (
        <section id="guide" style={{ background: "#FFFFFF" }}>
          <div className="cs-wrap cs-section" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 56, alignItems: "center" }}>
            <div data-reveal="1" style={{ minWidth: 0 }}>
              <div style={{ background: "#F4F8FE", border: "1px solid #DDE8F7", borderRadius: 22, padding: 22 }}>
                {guide.photo ? (
                  <div role="img" aria-label={guide.name} style={{ width: "100%", aspectRatio: "4/5", borderRadius: 14, backgroundImage: `url(${guide.photo})`, backgroundSize: "cover", backgroundPosition: "50% 20%" }} />
                ) : (
                  <div style={{ width: "100%", aspectRatio: "4/5", borderRadius: 14, border: "2px dashed #B9D2F4", background: "var(--pale)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
                    <div className="cs-display" style={{ fontWeight: 600, fontSize: 15, color: "#4E6B8C", lineHeight: 1.5 }}>
                      Add a portrait of {guide.name}
                      <br />
                      in Website → About the guide
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
                  {brand.ownerPhoto ? (
                    <div style={{ width: 38, height: 38, borderRadius: "50%", backgroundImage: `url(${brand.ownerPhoto})`, backgroundSize: "cover", backgroundPosition: "center", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--pale)", color: "var(--blue-deep)", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(guide.name || "?")}</div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className="cs-display" style={{ fontWeight: 700, fontSize: 16, color: "var(--navy)" }}>
                      {guide.name}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#6A809A" }}>{guide.title}</div>
                  </div>
                </div>
              </div>
            </div>
            <div data-reveal="1" style={{ minWidth: 0 }}>
              <div className="cs-eyebrow">{guide.eyebrow}</div>
              <h2 className="cs-h2" style={{ fontSize: "clamp(30px,3.4vw,44px)" }}>
                {guide.headline}
              </h2>
              <p style={{ fontSize: 17.5, lineHeight: 1.68, color: "#3D556F", margin: "20px 0 0", maxWidth: "58ch", textWrap: "pretty" }}>{guide.p1}</p>
              <p style={{ fontSize: 17.5, lineHeight: 1.68, color: "#3D556F", margin: "16px 0 0", maxWidth: "58ch", textWrap: "pretty" }}>{guide.p2}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 28 }}>
                {[guide.bullet1, guide.bullet2, guide.bullet3].filter(Boolean).map((b) => (
                  <div key={b} className="cs-bullet">
                    <div className="cs-check">✓</div>
                    <div className="cs-bullet__text">{b}</div>
                  </div>
                ))}
              </div>
              {show.about && (
                <div style={{ marginTop: 32 }}>
                  <Link href="/about" className="cs-btn cs-btn--secondary" style={{ padding: "15px 28px" }}>
                    Learn more about {first} →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {show.plan && (
        <section id="plan" style={{ background: "#F4F8FE", borderTop: "1px solid #E4EDF9", borderBottom: "1px solid #E4EDF9" }}>
          <div className="cs-wrap cs-section">
            <div data-reveal="1" style={{ maxWidth: 720 }}>
              <div className="cs-eyebrow">{plan.eyebrow}</div>
              <h2 className="cs-h2" style={{ fontSize: "clamp(30px,3.6vw,46px)" }}>
                {plan.headline}
              </h2>
              <p style={{ fontSize: 18, lineHeight: 1.65, color: "#3D556F", margin: "18px 0 0", maxWidth: "58ch", textWrap: "pretty" }}>{plan.intro}</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 22, marginTop: 48 }}>
              {[
                { n: "01", t: plan.card1Title, k: plan.card1Kicker, b: plan.card1Body },
                { n: "02", t: plan.card2Title, k: plan.card2Kicker, b: plan.card2Body, dark: true, id: "blueprint" },
                { n: "03", t: plan.card3Title, k: plan.card3Kicker, b: plan.card3Body },
              ].map((card) => (
                <div key={card.n} id={card.id} data-reveal="1" className={`cs-plan-card${card.dark ? " cs-plan-card--dark" : ""}`}>
                  <div className="cs-num">{card.n}</div>
                  <h3>{card.t}</h3>
                  <div className="cs-plan-card__k">{card.k}</div>
                  <p>{card.b}</p>
                </div>
              ))}
            </div>

            <div data-reveal="1" className="cs-compare">
              <div className="cs-compare__grid">
                <div className="cs-compare__col">
                  <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8B9BAF" }}>Templates &amp; DIY guesswork</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
                    {["Same headline formula as ten thousand others", "Written to fill fields, not to position a specialist", "Voice borrowed from whatever the tool defaults to", "No plan for what a warm buyer does next"].map((t) => (
                      <div key={t} style={{ fontSize: 15.5, color: "#6A809A", lineHeight: 1.55 }}>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="cs-compare__col">
                  <div className="cs-eyebrow" style={{ letterSpacing: "0.12em" }}>
                    Expert-managed with {first}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
                    {["Positioning built from your niche and your buyer", "22 sections worked in a deliberate order", "Your documented voice, reusable across everything", "A clear, deliberate call to action on the profile"].map((t) => (
                      <div key={t} style={{ fontSize: 15.5, color: "#16283D", fontWeight: 600, lineHeight: 1.55 }}>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div data-reveal="1" style={{ marginTop: 44, display: "flex", justifyContent: "center" }}>
              <a href="#apply" className="cs-btn cs-btn--primary" style={{ padding: "16px 30px", boxShadow: "0 14px 30px rgba(var(--blue-rgb),0.3)" }}>
                Get my profile audit
              </a>
            </div>
          </div>
        </section>
      )}

      {show.process && (
        <section style={{ background: "#FFFFFF" }}>
          <div className="cs-wrap cs-section">
            <div data-reveal="1" style={{ maxWidth: 680 }}>
              <div className="cs-eyebrow">How it runs</div>
              <h2 className="cs-h2" style={{ fontSize: "clamp(28px,3.2vw,42px)", lineHeight: 1.12 }}>
                From first call to a profile that works for you.
              </h2>
            </div>
            <div className="cs-process">
              {[
                ["STEP 1", "Audit", "Your current profile reviewed against all 22 sections, with the gaps named plainly."],
                ["STEP 2", "Blueprint interview", "One hour to capture your voice, USP, and ideal audience into a reference document."],
                ["STEP 3", "Rebuild", "Each section written and published — done for you, or alongside you, your call."],
                ["STEP 4", "Convert", "Content and outreach in your documented voice, with sales coaching if you want it."],
              ].map(([k, t, b]) => (
                <div key={k} data-reveal="1" className="cs-process__cell">
                  <div className="cs-display" style={{ fontWeight: 700, fontSize: 13, letterSpacing: "0.1em", color: "var(--blue-deep)" }}>
                    {k}
                  </div>
                  <div className="cs-display" style={{ fontWeight: 700, fontSize: 20, marginTop: 12, color: "var(--navy)" }}>
                    {t}
                  </div>
                  <p style={{ fontSize: 15.5, lineHeight: 1.6, color: "#425973", margin: "10px 0 0" }}>{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {show.testimonials && features.reviews && site.reviews.length > 0 && <ReviewSlider content={c} reviews={site.reviews} />}

      <section id="apply" className="cs-dark">
        <div className="cs-dark__glow" style={{ background: "radial-gradient(800px 420px at 80% 10%, rgba(var(--blue-rgb),0.35), rgba(var(--navy-rgb),0) 70%)" }} />
        <div className="cs-wrap cs-section" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", gap: 56, alignItems: "start" }}>
          <div data-reveal="1" style={{ minWidth: 0 }}>
            <div className="cs-eyebrow cs-eyebrow--light">{apply.eyebrow}</div>
            <h2 className="cs-h2 cs-h2--light" style={{ fontSize: "clamp(30px,3.6vw,46px)", lineHeight: 1.08 }}>
              {apply.headline}
            </h2>
            <p style={{ fontSize: 17.5, lineHeight: 1.65, color: "#B9CBE0", margin: "20px 0 0", maxWidth: "52ch", textWrap: "pretty" }}>{apply.intro}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 30 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {brand.ownerPhoto && <div style={{ width: 34, height: 34, borderRadius: "50%", backgroundImage: `url(${brand.ownerPhoto})`, backgroundSize: "cover", backgroundPosition: "center", flexShrink: 0, border: "2px solid rgba(127,182,255,0.5)" }} />}
                <div style={{ fontSize: 16, color: "#DCE7F4", fontWeight: 600 }}>Reviewed personally by {brand.ownerName}</div>
              </div>
              <div className="cs-bullet">
                <div className="cs-check">✓</div>
                <div style={{ fontSize: 16, color: "#DCE7F4", fontWeight: 600 }}>No obligation, no template dump</div>
              </div>
            </div>
            {calendly && (
              <div style={{ marginTop: 30, padding: "20px 22px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 16, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
                <div style={{ minWidth: 0, flex: "1 1 200px", fontSize: 15.5, fontWeight: 600, color: "#DCE7F4", lineHeight: 1.55 }}>Rather just talk it through? Pick a time that works.</div>
                <a href={calendly} target="_blank" rel="noopener noreferrer" className="cs-btn cs-btn--white" style={{ fontSize: 14.5, padding: "13px 22px" }}>
                  Book on Calendly →
                </a>
              </div>
            )}
          </div>
          <div data-reveal="1" style={{ minWidth: 0 }}>
            <ApplyForm content={c} calendlyUrl={calendly} />
          </div>
        </div>
      </section>

      <SiteFooter content={c} />
    </>
  );
}
