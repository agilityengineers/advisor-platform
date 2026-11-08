import { Link } from "wouter";
import { OFFERS, isOfferKey, offerPriceLabel, offerTermLabel, type PaymentPlan } from "@workspace/shared";
import { useDocumentMeta } from "@/hooks/use-meta";
import { PublicShell } from "./PublicShell";
import { SiteHeader, SiteFooter } from "./SiteChrome";
import { siteVoice } from "./usePublicSite";

/**
 * `/buy?offer=&plan=` — the checkout's address. The Stripe buying flow lands here in
 * the next phase; until then the page states the offer and sends the buyer to a call.
 */
export function BuyPlaceholder() {
  return (
    <PublicShell>
      {(site) => {
        const params = new URLSearchParams(window.location.search);
        const key = params.get("offer");
        const offer = isOfferKey(key) ? OFFERS[key] : null;
        const plan: PaymentPlan = params.get("plan") === "split" ? "split" : "full";
        const { first, company } = siteVoice(site.site.content);
        const calendly = site.calendlyUrl;
        return <BuyBody offer={offer} plan={plan} first={first} company={company} calendly={calendly} content={site.site.content} />;
      }}
    </PublicShell>
  );
}

function BuyBody({ offer, plan, first, company, calendly, content }: { offer: (typeof OFFERS)[keyof typeof OFFERS] | null; plan: PaymentPlan; first: string; company: string; calendly: string | null; content: Parameters<typeof SiteHeader>[0]["content"] }) {
  useDocumentMeta({ title: `${offer ? offer.name : "Checkout"} — ${company}`, robots: "noindex, nofollow" });
  return (
    <>
      <SiteHeader content={content} calendlyUrl={calendly} page="pricing" pricingCta="Talk it through" />
      <section style={{ background: "#F4F8FE", minHeight: "60vh" }}>
        <div className="cs-wrap" style={{ padding: "72px 20px", maxWidth: 720 }}>
          <div className="cs-eyebrow">Checkout</div>
          <h1 className="cs-display" style={{ fontWeight: 700, fontSize: "clamp(30px,4vw,44px)", lineHeight: 1.08, letterSpacing: "-0.03em", margin: "16px 0 0", color: "var(--navy)" }}>
            {offer ? offer.name : "Pick an offer first"}
          </h1>
          {offer ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 18 }}>
                <div className="cs-display" style={{ fontWeight: 700, fontSize: 40, letterSpacing: "-0.03em", color: "var(--navy)" }}>
                  {offerPriceLabel(offer, plan)}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#6A809A" }}>{offerTermLabel(offer, plan)}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 18 }}>
                {offer.includes.map((i) => (
                  <div key={i} style={{ fontSize: 15, color: "#16283D", lineHeight: 1.5, display: "flex", gap: 9 }}>
                    <span style={{ color: "var(--blue)", fontWeight: 700 }}>✓</span>
                    {i}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ fontSize: 16, lineHeight: 1.6, color: "#3D556F", margin: "16px 0 0" }}>The pricing page lists every engagement with its price and what's included.</p>
          )}
          <div style={{ marginTop: 28, background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 18, padding: "22px 24px" }}>
            <div style={{ fontSize: 15.5, lineHeight: 1.6, color: "#3D556F" }}>Online checkout for {company} opens shortly. In the meantime, {first} will take your booking directly — pick a time and the engagement is confirmed on the call.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 18 }}>
              {calendly && (
                <a href={calendly} target="_blank" rel="noopener noreferrer" className="cs-btn cs-btn--primary" style={{ fontSize: 15, padding: "14px 24px" }}>
                  Book a time with {first} →
                </a>
              )}
              <Link href="/pricing" className="cs-btn cs-btn--secondary" style={{ fontSize: 15, padding: "14px 24px" }}>
                Back to pricing
              </Link>
            </div>
          </div>
        </div>
      </section>
      <SiteFooter content={content} right={<Link href="/pricing" className="cs-footer__cta">← Back to pricing</Link>} />
    </>
  );
}
