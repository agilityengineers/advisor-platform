import { Link } from "wouter";
import { cents } from "@workspace/shared";
import { useDocumentMeta } from "@/hooks/use-meta";
import { Spinner } from "@/components/ui";
import { PublicShell } from "./PublicShell";
import { FlowPage, SecureBadge } from "./FlowChrome";
import { SiteState } from "./SiteChrome";
import { orderParam, useOrder } from "./buyingFlow";
import type { PublicSiteResponse } from "./types";

/** `/thanks?order=&session_id=` — payment confirmed, three next steps (Buying Flow screen 2). */
export function ThankYou() {
  return <PublicShell>{(site) => <ThanksBody site={site} />}</PublicShell>;
}

function ThanksBody({ site }: { site: PublicSiteResponse }) {
  const publicId = orderParam();
  const sessionId = new URLSearchParams(window.location.search).get("session_id");
  const q = useOrder(publicId, { sessionId, pollWhilePending: true });
  const brand = site.site.content.brand;
  useDocumentMeta({ title: `Thank you — ${brand.companyName}`, robots: "noindex, nofollow" });

  if (!publicId) return <SiteState title="That page needs an order" body="Follow the link from your receipt." />;
  if (q.isError) return <SiteState title="We couldn't find that order" body="Check the link in your receipt, or reply to it and we'll sort it out." />;
  if (!q.data) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "#F4F8FE" }}>
        <Spinner />
      </div>
    );
  }
  const d = q.data;
  const o = d.order;
  const owner = d.company.ownerFirst;
  const portalHref = `/client/login?email=${encodeURIComponent(o.customerEmail)}`;

  if (o.status === "pending") {
    return (
      <FlowPage logoUrl={brand.logoUrl} companyName={brand.companyName} right={<SecureBadge />} maxWidth={880}>
        <div style={{ background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 22, padding: "44px 32px", textAlign: "center" }}>
          <Spinner className="mx-auto" />
          <div className="cs-display" style={{ fontWeight: 700, fontSize: 22, color: "var(--navy)", marginTop: 18 }}>
            Confirming your payment…
          </div>
          <p style={{ fontSize: 15, color: "#425973", margin: "10px 0 0", lineHeight: 1.6 }}>This usually takes a few seconds. If you closed Stripe before paying, head back to checkout.</p>
          <Link href={`/buy?offer=${encodeURIComponent(o.offer.key)}${o.plan === "split" ? "&plan=split" : ""}`} className="cs-btn cs-btn--secondary" style={{ marginTop: 22, fontSize: 14.5, padding: "13px 22px" }}>
            Back to checkout
          </Link>
        </div>
      </FlowPage>
    );
  }

  return (
    <FlowPage logoUrl={brand.logoUrl} companyName={brand.companyName} right={<SecureBadge />} maxWidth={880}>
      <div style={{ background: "var(--navy)", color: "#FFFFFF", borderRadius: 22, padding: 36, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(600px 300px at 90% 0%, rgba(var(--blue-rgb),0.35), rgba(var(--navy-rgb),0) 70%)" }} />
        <div style={{ position: "relative", display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(47,191,113,0.18)", border: "1px solid rgba(47,191,113,0.4)", color: "#8FE3B4", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", padding: "6px 11px", borderRadius: 999 }}>✓ PAYMENT RECEIVED</div>
            <h1 className="cs-display" style={{ fontWeight: 700, fontSize: "clamp(26px,3.2vw,38px)", lineHeight: 1.1, letterSpacing: "-0.02em", margin: "16px 0 0" }}>
              You're in, {o.firstName}. Here's what happens next.
            </h1>
            <div style={{ fontSize: 14.5, color: "#B9CBE0", fontWeight: 600, marginTop: 12 }}>
              Order {o.publicId.toUpperCase()} · {o.offer.name} · {cents(o.amountCents)} {d.checkoutMode === "demo" ? "recorded (demo)" : "charged"} · Receipt sent to {o.customerEmail}
            </div>
          </div>
          {d.company.ownerPhoto && <img src={d.company.ownerPhoto} alt="" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(255,255,255,0.2)", flexShrink: 0 }} />}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(240px,100%),1fr))", gap: 16, marginTop: 16 }}>
        <StepCard n="1" primary title="Book your Brand Voice Interview" body={`90 minutes with ${owner}. Pick a time now — it's the one thing that gates everything else.`} cta={d.booking ? "Booked ✓ · view" : "Pick a time →"} href={`/book?order=${encodeURIComponent(o.publicId)}`} />
        <StepCard n="2" title="Complete a 3-minute intake" body={`Your LinkedIn URL, who you want to reach, and how we'll publish. ${owner} reads it before your call.`} cta={d.intakeDone ? "Received ✓ · edit" : "Start intake"} href={`/intake?order=${encodeURIComponent(o.publicId)}`} />
        <StepCard n="3" title="Track it in your portal" body="Every stage, every file, every payment in one place. Login link is in your welcome email." cta="Open portal" href={portalHref} />
      </div>
      <div style={{ marginTop: 16, fontSize: 13.5, color: "#6A809A", fontWeight: 600, textAlign: "center" }}>Questions? Reply to your receipt — it goes straight to {owner}.</div>
    </FlowPage>
  );
}

function StepCard({ n, title, body, cta, href, primary }: { n: string; title: string; body: string; cta: string; href: string; primary?: boolean }) {
  return (
    <div style={{ background: "#FFFFFF", border: primary ? "2px solid var(--blue)" : "1px solid #DDE8F7", borderRadius: 18, padding: 24, display: "flex", flexDirection: "column" }}>
      <div className="cs-display" style={{ width: 34, height: 34, borderRadius: "50%", background: primary ? "var(--blue)" : "var(--pale)", color: primary ? "var(--on-primary)" : "var(--blue-deep)", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {n}
      </div>
      <div className="cs-display" style={{ fontWeight: 700, fontSize: 17, marginTop: 14, color: "var(--navy)" }}>
        {title}
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.55, color: "#5A718C", marginTop: 6, flex: 1 }}>{body}</div>
      <Link href={href} className={`cs-btn cs-btn--block ${primary ? "cs-btn--primary" : "cs-btn--secondary"}`} style={{ marginTop: 16, fontSize: 14.5, padding: "13px 18px", boxShadow: "none" }}>
        {cta}
      </Link>
    </div>
  );
}
