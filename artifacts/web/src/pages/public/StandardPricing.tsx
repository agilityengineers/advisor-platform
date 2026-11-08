import { useState } from "react";
import { Link } from "wouter";
import { OFFERS, STANDARD_ADDONS, STANDARD_CORE_TIERS, STANDARD_CREDITS, STANDARD_ENTRY_OFFERS, STANDARD_TEAM_TILES, checkoutPath, isOfferKey, money, offerPriceLabel, offerTermLabel, type PaymentPlan, type SiteContent } from "@workspace/shared";
import { useDocumentMeta } from "@/hooks/use-meta";
import { PublicShell } from "./PublicShell";
import { SiteHeader, SiteFooter, PricingBar } from "./SiteChrome";
import { siteVoice } from "./usePublicSite";
import type { PublicSiteResponse } from "./types";

export function StandardPricing() {
  return <PublicShell>{(site) => <StandardBody site={site} />}</PublicShell>;
}

const Check = () => <div className="cs-check cs-check--sm">✓</div>;

function StandardBody({ site }: { site: PublicSiteResponse }) {
  const c: SiteContent = site.site.content;
  const { brand } = c;
  const { first, company } = siteVoice(c);
  const params = new URLSearchParams(window.location.search);
  const [plan, setPlan] = useState<PaymentPlan>(params.get("plan") === "split" ? "split" : "full");
  const highlight = isOfferKey(params.get("offer")) ? params.get("offer") : null;
  const calendly = site.calendlyUrl;
  const bookHref = calendly ?? "/";
  const bookTarget = calendly ? "_blank" : undefined;
  const canCheckout = site.company.publicFeatures.stripe_checkout;
  const authorityDesk = site.company.publicFeatures.authority_desk && brand.authorityDeskUrl;
  useDocumentMeta({ title: `Standard pricing — ${company}`, robots: "noindex, nofollow, noarchive" });
  const fill = (s: string) => s.replace(/\{ownerFirst\}/g, first);
  const mailto = `mailto:?subject=${encodeURIComponent(`LinkedIn team profiles — ${company}`)}&body=${encodeURIComponent(`${brand.ownerFullName || first} rebuilds LinkedIn profiles for sales teams in one consistent company voice ($797/profile for 5–9, $697 for 10+). Pricing here: ${window.location.href}`)}`;

  return (
    <>
      <PricingBar current="standard" />
      <SiteHeader content={c} calendlyUrl={calendly} page="pricing" pricingCta="Talk it through" />

      <section style={{ background: "linear-gradient(180deg,#FFFFFF 0%,#F4F8FE 100%)", borderBottom: "1px solid #E4EDF9" }}>
        <div className="cs-wrap" style={{ padding: "72px 20px 56px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 48, alignItems: "end" }}>
          <div style={{ minWidth: 0 }}>
            <div className="cs-eyebrow">Standard pricing</div>
            <h1 className="cs-display" style={{ fontWeight: 700, fontSize: "clamp(34px,4.4vw,54px)", lineHeight: 1.06, letterSpacing: "-0.03em", margin: "16px 0 0", color: "var(--navy)", textWrap: "balance" }}>
              Priced by what gets built. Not by your title.
            </h1>
            <p style={{ fontSize: "clamp(16px,1.3vw,18.5px)", lineHeight: 1.65, color: "#3D556F", margin: "20px 0 0", maxWidth: "56ch", textWrap: "pretty" }}>Every entry offer credits toward a full profile build, so starting small never costs you. Pick the tier we talked about — or book a call and we'll scope it together.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 18, padding: "18px 20px", boxShadow: "0 18px 40px rgba(var(--navy-rgb),0.08)" }}>
            {brand.ownerPhoto && <img src={brand.ownerPhoto} alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>A note from {first}</div>
              <div style={{ fontSize: 14, lineHeight: 1.55, color: "#425973", marginTop: 3 }}>I've marked the tier I'd recommend based on our conversation. Questions on scope or payment plans — just reply to my email or grab a time below.</div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "#F4F8FE", borderBottom: "1px solid #E4EDF9" }}>
        <div className="cs-wrap" style={{ padding: "56px 20px 72px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
            <div>
              <div className="cs-eyebrow">Core offers</div>
              <h2 className="cs-h2" style={{ fontSize: "clamp(24px,2.6vw,32px)", lineHeight: 1.15, marginTop: 10 }}>
                Your profile, rebuilt in your voice
              </h2>
            </div>
            <div className="cs-toggle" role="group" aria-label="Payment">
              <button type="button" aria-pressed={plan === "full"} onClick={() => setPlan("full")}>
                Pay in full
              </button>
              <button type="button" aria-pressed={plan === "split"} onClick={() => setPlan("split")}>
                Payment plan
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(290px,100%),1fr))", gap: 20, marginTop: 32, alignItems: "stretch" }}>
            {STANDARD_CORE_TIERS.map((tier) => {
              const offer = OFFERS[tier.key];
              const price = offerPriceLabel(offer, plan);
              const cta = tier.bookInstead ? (
                <a href={bookHref} target={bookTarget} rel="noopener noreferrer" className="cs-tier__cta cs-tier__cta--outline">
                  {tier.cta(price)}
                </a>
              ) : canCheckout ? (
                <Link href={checkoutPath(tier.key, plan)} className={`cs-tier__cta ${tier.dark ? "cs-tier__cta--fill" : "cs-tier__cta--outline"}`}>
                  {tier.cta(price)}
                </Link>
              ) : (
                <a href={bookHref} target={bookTarget} rel="noopener noreferrer" className={`cs-tier__cta ${tier.dark ? "cs-tier__cta--fill" : "cs-tier__cta--outline"}`}>
                  {tier.cta(price)}
                </a>
              );
              return (
                <div key={tier.key} className={`cs-tier${tier.dark ? " cs-tier--dark" : ""}${highlight === tier.key ? " cs-tier--highlight" : ""}`}>
                  {tier.dark && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(500px 260px at 100% 0%, rgba(var(--blue-rgb),0.4), rgba(var(--navy-rgb),0) 70%)" }} />}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", position: "relative" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: tier.dark ? "var(--blue-light)" : "#7C93AD" }}>{tier.kicker}</div>
                    {tier.recommended && <div style={{ background: "var(--blue)", color: "var(--on-primary)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", padding: "6px 11px", borderRadius: 999, whiteSpace: "nowrap" }}>{first.toUpperCase()} RECOMMENDS</div>}
                  </div>
                  <h3>{offer.name}</h3>
                  <div className="cs-tier__price">
                    <div className="cs-tier__amount">{price}</div>
                    <div className="cs-tier__term">{offerTermLabel(offer, plan)}</div>
                  </div>
                  <p className="cs-tier__body">{tier.body}</p>
                  <div className="cs-tier__list">
                    {tier.bullets.map((b) => (
                      <div key={b} className="cs-tier__item">
                        <Check />
                        <div>
                          {b.includes("($347 value)") ? (
                            <>
                              {b.replace(" ($347 value)", "")} <span style={{ color: "var(--blue-light)", fontWeight: 700 }}>($347 value)</span>
                            </>
                          ) : (
                            b
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {cta}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{ background: "#FFFFFF", borderBottom: "1px solid #E4EDF9" }}>
        <div className="cs-wrap" style={{ padding: "72px 20px" }}>
          <div style={{ maxWidth: 640 }}>
            <div className="cs-eyebrow">Entry offers</div>
            <h2 className="cs-h2" style={{ fontSize: "clamp(24px,2.6vw,32px)", lineHeight: 1.15, marginTop: 10 }}>
              Start small. Every dollar credits forward.
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", gap: 18, marginTop: 32 }}>
            {STANDARD_ENTRY_OFFERS.map((e) => {
              const offer = OFFERS[e.key];
              const cta = canCheckout ? (
                <Link href={checkoutPath(e.key)} className="cs-btn cs-btn--navy cs-btn--block" style={{ marginTop: 16 }}>
                  {e.cta}
                </Link>
              ) : (
                <a href={bookHref} target={bookTarget} rel="noopener noreferrer" className="cs-btn cs-btn--navy cs-btn--block" style={{ marginTop: 16 }}>
                  {e.cta}
                </a>
              );
              return (
                <div key={e.key} className={`cs-entry${highlight === e.key ? " cs-tier--highlight" : ""}`}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                    <h3 className="cs-display" style={{ fontWeight: 700, fontSize: 20, margin: 0, color: "var(--navy)" }}>
                      {offer.name}
                    </h3>
                    <div className="cs-display" style={{ fontWeight: 700, fontSize: 26, letterSpacing: "-0.02em", color: "var(--navy)" }}>
                      {money(offer.price)}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#6A809A", marginTop: 4 }}>{e.sub}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 18, flex: 1 }}>
                    {e.bullets.map((b) => (
                      <div key={b} style={{ fontSize: 14, color: "#16283D", lineHeight: 1.5, display: "flex", gap: 9 }}>
                        <span style={{ color: "var(--blue)", fontWeight: 700 }}>—</span>
                        {fill(b)}
                      </div>
                    ))}
                  </div>
                  <div className="cs-entry__credit">{fill(e.credit)}</div>
                  {cta}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="cs-dark">
        <div className="cs-dark__glow" style={{ background: "radial-gradient(800px 400px at 10% 0%, rgba(var(--blue-rgb),0.3), rgba(var(--navy-rgb),0) 70%)" }} />
        <div className="cs-wrap" style={{ padding: "72px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 44, alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <div className="cs-eyebrow cs-eyebrow--light">Teams</div>
            <h2 className="cs-h2 cs-h2--light" style={{ fontSize: "clamp(26px,3vw,38px)", marginTop: 14 }}>
              Team Profiles — one voice, every seller.
            </h2>
            <p style={{ fontSize: 16.5, lineHeight: 1.65, color: "#B9CBE0", margin: "16px 0 0", maxWidth: "52ch" }}>For sales teams and companies. One group voice session sets the company messaging; then short individual interviews and aligned rewrites for each profile.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
              {STANDARD_TEAM_TILES.map((t) => (
                <div key={t.label} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 14, padding: "14px 18px" }}>
                  <div className="cs-display" style={{ fontWeight: 700, fontSize: 24 }}>
                    {t.value}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#B9CBE0", marginTop: 2 }}>{t.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <a href={bookHref} target={bookTarget} rel="noopener noreferrer" className="cs-btn cs-btn--white cs-btn--block" style={{ fontSize: 15.5, padding: "16px 22px" }}>
              Book a team scoping call
            </a>
            <a href={mailto} className="cs-btn cs-btn--ghost cs-btn--block">
              Send This to Your Sales Leader
            </a>
          </div>
        </div>
      </section>

      <section style={{ background: "#FFFFFF", borderBottom: "1px solid #E4EDF9" }}>
        <div className="cs-wrap" style={{ padding: "72px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 48, alignItems: "start" }}>
          <div style={{ minWidth: 0 }}>
            <div className="cs-eyebrow">Add-ons</div>
            <h2 className="cs-h2" style={{ fontSize: "clamp(22px,2.4vw,30px)", lineHeight: 1.15, marginTop: 10 }}>
              Bolt on as needed
            </h2>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 22, border: "1px solid #DDE8F7", borderRadius: 16, overflow: "hidden" }}>
              {STANDARD_ADDONS.map((a) => (
                <div key={a.title} className="cs-addon-row">
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>{a.title}</div>
                    <div style={{ fontSize: 13, color: "#6A809A", fontWeight: 600, marginTop: 2 }}>{a.sub}</div>
                  </div>
                  <div className="cs-display" style={{ fontWeight: 700, fontSize: 17, color: "var(--navy)", whiteSpace: "nowrap" }}>
                    {a.price}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="cs-eyebrow">Good to know</div>
            <h2 className="cs-h2" style={{ fontSize: "clamp(22px,2.4vw,30px)", lineHeight: 1.15, marginTop: 10 }}>
              How the credits work
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }}>
              {STANDARD_CREDITS.map((cr) => (
                <div key={cr.title} style={{ background: "#F4F8FE", border: "1px solid #DDE8F7", borderRadius: 14, padding: "18px 20px" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>{cr.title}</div>
                  <div style={{ fontSize: 14, color: "#425973", lineHeight: 1.55, marginTop: 5 }}>{cr.body}</div>
                </div>
              ))}
              {authorityDesk && (
                <div style={{ background: "#F4F8FE", border: "1px solid #DDE8F7", borderRadius: 14, padding: "18px 20px" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>Already a client?</div>
                  <div style={{ fontSize: 14, color: "#425973", lineHeight: 1.55, marginTop: 5 }}>
                    Your Blueprint carries into The Authority Desk's done-for-you newsroom if you want the profile to keep working after it's rebuilt.{" "}
                    <a href={brand.authorityDeskUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>
                      See how →
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "#F4F8FE" }}>
        <div className="cs-wrap" style={{ padding: "64px 20px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
          <div style={{ minWidth: 0, flex: "1 1 360px" }}>
            <h2 className="cs-h2" style={{ fontSize: "clamp(24px,2.8vw,34px)", lineHeight: 1.12, margin: 0 }}>
              Not sure which tier? Fifteen minutes settles it.
            </h2>
            <p style={{ fontSize: 15.5, lineHeight: 1.6, color: "#5A718C", margin: "12px 0 0" }}>No pressure — if a smaller offer is the right call, that's what I'll tell you.</p>
          </div>
          <a href={bookHref} target={bookTarget} rel="noopener noreferrer" className="cs-btn cs-btn--primary" style={{ boxShadow: "0 14px 30px rgba(var(--blue-rgb),0.3)" }}>
            Book a 15-min call with {first}
          </a>
        </div>
      </section>

      <Disclaimer kind="standard" />

      <footer style={{ background: "#FFFFFF" }}>
        <div className="cs-wrap" style={{ padding: "28px 20px 36px", display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center", justifyContent: "space-between" }}>
          {brand.footerLogoUrl || brand.logoUrl ? <img src={brand.footerLogoUrl || brand.logoUrl} alt={company} style={{ height: 32, width: "auto", display: "block" }} /> : <span className="cs-logo__word" style={{ fontSize: 16 }}>{company}</span>}
          <div style={{ fontSize: 13, color: "#6A809A", fontWeight: 600, lineHeight: 1.6 }}>{company} · Prices in USD · This page is shared by invitation and isn't listed publicly.</div>
        </div>
      </footer>
    </>
  );
}

/** "What you're buying": activity-based marketing, not paid advertising. */
export function Disclaimer({ kind }: { kind: "standard" | "commercial" }) {
  return (
    <section style={{ background: "#FFFFFF", borderTop: "1px solid #E4EDF9" }}>
      <div className="cs-wrap" style={{ padding: kind === "standard" ? "48px 20px 8px" : "40px 20px 8px" }}>
        <div style={{ background: "#F4F8FE", border: "1px solid #DDE8F7", borderRadius: 16, padding: "22px 24px", display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div className="cs-display" style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--pale)", color: "var(--blue-deep)", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            i
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "var(--blue-deep)" }}>WHAT YOU'RE BUYING</div>
            <p style={{ fontSize: 14.5, lineHeight: 1.65, color: "#3D556F", margin: "8px 0 0", textWrap: "pretty" }}>
              Every engagement on this page is <strong style={{ color: "var(--navy)" }}>activity-based marketing</strong>:{" "}
              {kind === "standard" ? "the foundational work of building your positioning, your voice, and the profile that carries them. These are the fundamentals a landing page, outreach, or any marketing effort is built on." : "the foundational work of building your positioning, your voice, your team's profiles, and the outreach habits that any marketing effort is built on."}
            </p>
            <p style={{ fontSize: 14.5, lineHeight: 1.65, color: "#3D556F", margin: "10px 0 0", textWrap: "pretty" }}>
              This is <strong style={{ color: "var(--navy)" }}>not paid advertising</strong>. Nothing here includes pay-per-click, sponsored placement, ad spend, or pay-for-performance marketing, and no engagement is priced on or guarantees a specific number of leads, {kind === "standard" ? "followers" : "connections"}, or sales. Results depend on your market, your offer, and how consistently the work is put to use.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
