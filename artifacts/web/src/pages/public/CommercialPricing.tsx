import { COMMERCIAL_PROGRAMS, COMMERCIAL_SECTIONS, COMMERCIAL_STATS, type SiteContent } from "@workspace/shared";
import { useDocumentMeta } from "@/hooks/use-meta";
import { useHashScroll } from "@/hooks/use-reveal";
import { PublicShell } from "./PublicShell";
import { SiteHeader, PricingBar } from "./SiteChrome";
import { Disclaimer } from "./StandardPricing";
import { siteVoice } from "./usePublicSite";
import type { PublicSiteResponse } from "./types";

export function CommercialPricing() {
  return <PublicShell>{(site) => <CommercialBody site={site} />}</PublicShell>;
}

function emphasised(title: string, em: string | undefined, color: string) {
  if (!em) return title;
  const [before, after] = title.split(em);
  return (
    <>
      {before}
      <em style={{ fontStyle: "normal", color }}>{em}</em>
      {after}
    </>
  );
}

function CommercialBody({ site }: { site: PublicSiteResponse }) {
  const c: SiteContent = site.site.content;
  const { brand } = c;
  const { full, company } = siteVoice(c);
  const calendly = site.calendlyUrl;
  const bookHref = calendly ?? "/";
  const bookTarget = calendly ? "_blank" : undefined;
  useDocumentMeta({ title: `Commercial pricing — ${company}`, robots: "noindex, nofollow, noarchive" });
  useHashScroll(true);
  const phoneHref = brand.ownerPhone ? `tel:${brand.ownerPhone.replace(/[^0-9+]/g, "")}` : "";
  const linkedin = brand.ownerLinkedin.replace(/^https?:\/\//, "");

  return (
    <>
      <PricingBar current="commercial" />
      <SiteHeader content={c} calendlyUrl={calendly} page="pricing" pricingCta="Book a discovery call" />

      <section className="cs-dark">
        <div className="cs-dark__glow" style={{ background: "radial-gradient(900px 420px at 85% 0%, rgba(var(--blue-rgb),0.32), rgba(var(--navy-rgb),0) 70%)" }} />
        <div className="cs-wrap" style={{ padding: "72px 20px 64px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 40, alignItems: "end" }}>
          <div style={{ minWidth: 0 }}>
            <div className="cs-eyebrow cs-eyebrow--light">Commercial pricing · LinkedIn services menu</div>
            <h1 className="cs-display" style={{ fontWeight: 700, fontSize: "clamp(34px,4.4vw,54px)", lineHeight: 1.06, letterSpacing: "-0.03em", margin: "16px 0 0", textWrap: "balance" }}>
              Positioning professionals for sales using LinkedIn.
            </h1>
            <p style={{ fontSize: "clamp(16px,1.3vw,18.5px)", lineHeight: 1.65, color: "#B9CBE0", margin: "20px 0 0", maxWidth: "56ch", textWrap: "pretty" }}>Three ways to work together — your own profile and voice, your team, or the whole company. Every engagement is quoted as a flat fee based on scope; the figures below are averages from recent client work.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
            {COMMERCIAL_STATS.map((s) => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 16, padding: "18px 14px", textAlign: "center" }}>
                <div className="cs-display" style={{ fontWeight: 700, fontSize: 26, letterSpacing: "-0.02em" }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#B9CBE0", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "#FFFFFF", borderBottom: "1px solid #E4EDF9" }}>
        <div className="cs-wrap" style={{ padding: "24px 20px 0", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          <a href="#profile" className="cs-chip">
            01 · Profile &amp; Brand Voice
          </a>
          <a href="#team" className="cs-chip">
            02 · Team Workshops &amp; Training
          </a>
          <a href="#company" className="cs-chip">
            03 · Company Programs
          </a>
        </div>

        {COMMERCIAL_SECTIONS.map((sec, i) => (
          <div key={sec.id} id={sec.id} className="cs-wrap" style={{ padding: i === 0 ? "56px 20px 40px" : "40px 20px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 12, borderBottom: "2px solid var(--navy)", paddingBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                <div className="cs-display" style={{ fontWeight: 700, fontSize: 13, letterSpacing: "0.12em", color: "var(--blue-deep)" }}>
                  {sec.n}
                </div>
                <h2 className="cs-display" style={{ fontWeight: 700, fontSize: "clamp(22px,2.6vw,30px)", letterSpacing: "-0.02em", margin: 0, color: "var(--navy)" }}>
                  {sec.title}
                </h2>
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.1em", color: "#7C93AD" }}>AVG. INVESTMENT</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {sec.rows.map((row) => (
                <div key={row.title} className={`cs-menu-row${row.featured ? " cs-menu-row--featured" : ""}`}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: row.featured ? "center" : "baseline", gap: "6px 14px" }}>
                      <h3 className="cs-display" style={{ fontWeight: 700, fontSize: 20, margin: 0, color: row.featured ? "#FFFFFF" : "var(--navy)" }}>
                        {emphasised(row.title, row.titleEm, row.featured ? "var(--blue-light)" : "var(--blue-deep)")}
                      </h3>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: row.featured ? "var(--blue-light)" : "var(--blue-deep)" }}>{row.meta}</span>
                      {row.badge && <span style={{ background: "var(--blue)", color: "var(--on-primary)", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", padding: "4px 9px", borderRadius: 999 }}>{row.badge}</span>}
                    </div>
                    <p style={{ fontSize: 15, lineHeight: 1.62, color: row.featured ? "#C3D3E6" : "#425973", margin: "8px 0 0", maxWidth: "68ch" }}>
                      {row.body.includes("($175 value)") ? (
                        <>
                          {row.body.replace(" ($175 value).", "")} <span style={{ color: "#FFFFFF", fontWeight: 700 }}>($175 value)</span>.
                        </>
                      ) : (
                        row.body
                      )}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="cs-display" style={{ fontWeight: 700, fontSize: 28, letterSpacing: "-0.02em", color: row.featured ? "#FFFFFF" : "var(--navy)" }}>
                      {row.price}
                    </div>
                    {row.priceNote && <div style={{ fontSize: 12, fontWeight: 700, color: "#7C93AD", marginTop: 2, whiteSpace: "nowrap" }}>{row.priceNote}</div>}
                    <a href={bookHref} target={bookTarget} rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 8, fontSize: 13, fontWeight: 700, color: row.featured ? "var(--blue-light)" : "var(--blue-deep)", whiteSpace: "nowrap" }}>
                      {row.cta}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div id="company" className="cs-wrap" style={{ padding: "40px 20px 64px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 12, borderBottom: "2px solid var(--navy)", paddingBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <div className="cs-display" style={{ fontWeight: 700, fontSize: 13, letterSpacing: "0.12em", color: "var(--blue-deep)" }}>
                03
              </div>
              <h2 className="cs-display" style={{ fontWeight: 700, fontSize: "clamp(22px,2.6vw,30px)", letterSpacing: "-0.02em", margin: 0, color: "var(--navy)" }}>
                Company Programs &amp; Ongoing Support
              </h2>
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.1em", color: "#7C93AD" }}>AVG. INVESTMENT</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 18, marginTop: 22 }}>
            {COMMERCIAL_PROGRAMS.map((p) => (
              <div key={p.title} style={{ background: p.dark ? "#F4F8FE" : "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 20, padding: 28, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <h3 className="cs-display" style={{ fontWeight: 700, fontSize: 21, margin: 0, color: "var(--navy)" }}>
                    {p.title}
                  </h3>
                  <div className="cs-display" style={{ fontWeight: 700, fontSize: p.price.startsWith("$") ? 28 : 18, letterSpacing: "-0.02em", color: p.price.startsWith("$") ? "var(--navy)" : "#425973" }}>
                    {p.price}
                  </div>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--blue-deep)", marginTop: 4 }}>{p.meta}</div>
                <p style={{ fontSize: 15, lineHeight: 1.62, color: "#425973", margin: "12px 0 0", flex: 1 }}>{p.body}</p>
                <a href={bookHref} target={bookTarget} rel="noopener noreferrer" className={`cs-btn cs-btn--block ${p.dark ? "cs-btn--navy" : "cs-btn--secondary"}`} style={{ marginTop: 20, fontSize: 14.5, padding: "14px 18px" }}>
                  {p.cta}
                </a>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#6A809A", margin: "22px 0 0", fontWeight: 600 }}>Averages are drawn from recent client engagements; every engagement is quoted as a flat fee based on scope. Platform subscriptions such as Sales Navigator are billed separately.</p>
        </div>
      </section>

      <section style={{ background: "#F4F8FE" }}>
        <div className="cs-wrap" style={{ padding: "64px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 32, alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <h2 className="cs-h2" style={{ fontSize: "clamp(24px,2.8vw,34px)", lineHeight: 1.12, margin: 0 }}>
              Not sure which fits?
            </h2>
            <p style={{ fontSize: 15.5, lineHeight: 1.62, color: "#3D556F", margin: "12px 0 0", maxWidth: "54ch" }}>Book a free 30-minute discovery call. Sales team accelerators, outreach sequences, and Sales Navigator reviews are quoted on request.</p>
            <a href={bookHref} target={bookTarget} rel="noopener noreferrer" className="cs-btn cs-btn--primary" style={{ marginTop: 22, boxShadow: "0 14px 30px rgba(var(--blue-rgb),0.3)" }}>
              Book a free discovery call
            </a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 18, padding: "20px 22px" }}>
            {brand.ownerPhoto && <img src={brand.ownerPhoto} alt="" style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />}
            <div style={{ minWidth: 0, fontSize: 14, lineHeight: 1.65, color: "#425973" }}>
              <div className="cs-display" style={{ fontWeight: 700, fontSize: 16, color: "var(--navy)" }}>
                {full}
              </div>
              {brand.ownerTitle && <div style={{ fontWeight: 600 }}>{brand.ownerTitle}</div>}
              {(brand.ownerEmail || brand.ownerPhone) && (
                <div style={{ overflowWrap: "anywhere" }}>
                  {brand.ownerEmail && <a href={`mailto:${brand.ownerEmail}`}>{brand.ownerEmail}</a>}
                  {brand.ownerEmail && brand.ownerPhone && " · "}
                  {brand.ownerPhone && <a href={phoneHref}>{brand.ownerPhone}</a>}
                </div>
              )}
              {linkedin && (
                <div style={{ overflowWrap: "anywhere" }}>
                  <a href={`https://${linkedin}`} target="_blank" rel="noopener noreferrer">
                    {linkedin}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <Disclaimer kind="commercial" />

      <footer style={{ background: "#FFFFFF" }}>
        <div className="cs-wrap" style={{ padding: "28px 20px 36px", display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center", justifyContent: "space-between" }}>
          {brand.footerLogoUrl || brand.logoUrl ? <img src={brand.footerLogoUrl || brand.logoUrl} alt={company} style={{ height: 32, width: "auto", display: "block" }} /> : <span className="cs-logo__word" style={{ fontSize: 16 }}>{company}</span>}
          <div style={{ fontSize: 13, color: "#6A809A", fontWeight: 600, lineHeight: 1.6 }}>{company} · Prices in USD · This page is shared by invitation and isn't listed publicly.</div>
        </div>
      </footer>
    </>
  );
}
