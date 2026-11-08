import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { loadStripe } from "@stripe/stripe-js";
import { OFFERS, BUMPS, BUMP_KEYS, cents, isOfferKey, priceOrder, type BumpKey, type BumpSelection, type PaymentPlan } from "@workspace/shared";
import { api, ApiError } from "@/lib/api";
import { useDocumentMeta } from "@/hooks/use-meta";
import { PublicShell } from "./PublicShell";
import { FlowPage, FlowCard, Kicker, SecureBadge } from "./FlowChrome";
import { siteVoice } from "./usePublicSite";
import type { CheckoutStart, PublicSiteResponse } from "./types";

/** `/buy?offer=&plan=` — on-brand checkout (Buying Flow.dc.html, screen 1). */
export function Checkout() {
  return <PublicShell>{(site) => <CheckoutBody site={site} />}</PublicShell>;
}

function CheckoutBody({ site }: { site: PublicSiteResponse }) {
  const params = new URLSearchParams(window.location.search);
  const offerKey = isOfferKey(params.get("offer")) ? params.get("offer")! : "voice";
  const offer = OFFERS[offerKey as keyof typeof OFFERS];
  const { brand } = site.site.content;
  const { first, company } = siteVoice(site.site.content);
  const [, navigate] = useLocation();
  const [plan, setPlan] = useState<PaymentPlan>(params.get("plan") === "split" && offer.splittable ? "split" : "full");
  const [bumps, setBumps] = useState<BumpSelection>({});
  const [buyer, setBuyer] = useState({ name: "", email: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [start, setStart] = useState<CheckoutStart | null>(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const pricing = priceOrder(offer, plan, bumps);
  const ready = site.company.checkout.ready;
  const locked = Boolean(start);
  useDocumentMeta({ title: `Checkout · ${offer.name} — ${company}`, robots: "noindex, nofollow" });

  // Live mode: mount Stripe's embedded Checkout once the order exists.
  useEffect(() => {
    if (!start || start.mode !== "live" || !start.clientSecret) return;
    if (!start.publishableKey) {
      if (start.url) window.location.assign(start.url);
      else setEmbedError("Stripe is missing a publishable key on this platform.");
      return;
    }
    let checkout: { destroy: () => void; mount: (el: HTMLElement) => void } | null = null;
    let cancelled = false;
    void (async () => {
      const stripe = await loadStripe(start.publishableKey!, start.accountId ? { stripeAccount: start.accountId } : undefined);
      if (!stripe || cancelled || !mountRef.current) {
        if (!stripe) setEmbedError("Stripe.js could not load. Check your connection and try again.");
        return;
      }
      try {
        const created = await stripe.createEmbeddedCheckoutPage({ clientSecret: start.clientSecret! });
        checkout = created;
        created.mount(mountRef.current);
      } catch (err) {
        setEmbedError(err instanceof Error ? err.message : "Stripe could not start the checkout.");
      }
    })();
    return () => {
      cancelled = true;
      checkout?.destroy();
    };
  }, [start]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (buyer.name.trim().length < 2) errs.name = "Please tell us your name.";
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(buyer.email.trim())) errs.email = "That email doesn't look right.";
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const r = await api<CheckoutStart>("/public/checkout", { method: "POST", json: { offer: offerKey, plan, bumps, name: buyer.name, email: buyer.email, phone: buyer.phone } });
      setStart(r);
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const demoPay = async () => {
    if (!start) return;
    setPaying(true);
    try {
      await api(`/public/orders/${encodeURIComponent(start.orderId)}/demo-pay`, { method: "POST" });
      navigate(`/thanks?order=${encodeURIComponent(start.orderId)}`);
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "Payment didn't go through. Please try again." });
      setPaying(false);
    }
  };

  const toggle = (key: BumpKey) => (e: React.ChangeEvent<HTMLInputElement>) => setBumps((b) => ({ ...b, [key]: e.target.checked }));
  const bumpStyle = (on: boolean) => ({ border: `1px solid ${on ? "var(--blue)" : "#DDE8F7"}`, background: on ? "var(--pale)" : "#FFFFFF" });

  return (
    <FlowPage logoUrl={brand.logoUrl} companyName={brand.companyName} right={<SecureBadge />}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", gap: 28, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <FlowCard>
            <Kicker>YOUR ORDER</Kicker>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginTop: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div className="cs-display" style={{ fontWeight: 700, fontSize: 19, color: "var(--navy)" }}>
                  {offer.name}
                </div>
                <div style={{ fontSize: 13.5, color: "#6A809A", fontWeight: 600, marginTop: 3 }}>{offer.sub}</div>
              </div>
              <div className="cs-display" style={{ fontWeight: 700, fontSize: 19, color: "var(--navy)", whiteSpace: "nowrap" }}>
                {pricing.split && offer.split ? `${offer.split.n} × ${cents(offer.split.each * 100)}` : cents(pricing.baseCents)}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              {offer.includes.map((i) => (
                <div key={i} style={{ display: "flex", gap: 9, fontSize: 13.5, color: "#3D556F", lineHeight: 1.5 }}>
                  <span style={{ color: "var(--blue)", fontWeight: 700 }}>✓</span>
                  {i}
                </div>
              ))}
            </div>
            {offer.splittable && offer.split && (
              <div className="cs-toggle" style={{ marginTop: 18, background: "#F4F8FE" }} role="group" aria-label="Payment plan">
                <button type="button" aria-pressed={plan === "full"} disabled={locked} onClick={() => setPlan("full")} style={{ padding: "8px 14px", fontSize: 13 }}>
                  Pay in full
                </button>
                <button type="button" aria-pressed={plan === "split"} disabled={locked} onClick={() => setPlan("split")} style={{ padding: "8px 14px", fontSize: 13 }}>
                  {offer.split.n} × {cents(offer.split.each * 100)}
                </button>
              </div>
            )}
          </FlowCard>

          <FlowCard>
            <Kicker>ADD TO THIS ORDER</Kicker>
            {BUMP_KEYS.map((key, i) => {
              const b = BUMPS[key];
              const on = Boolean(bumps[key]);
              const amount = pricing.bumps.find((x) => x.key === key)?.amountCents ?? (b.cents ?? Math.round(offer.price * (b.share ?? 0)) * 100);
              return (
                <label key={key} style={{ display: "flex", alignItems: "flex-start", gap: 14, marginTop: i === 0 ? 14 : 10, padding: 14, borderRadius: 12, cursor: locked ? "default" : "pointer", ...bumpStyle(on) }}>
                  <input type="checkbox" checked={on} disabled={locked} onChange={toggle(key)} style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--blue)" }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--navy)" }}>{b.label}</div>
                      <div className="cs-display" style={{ fontWeight: 700, fontSize: 14.5 }}>
                        {b.share ? `+${Math.round(b.share * 100)}% · ${cents(amount)}` : `+${cents(amount)}`}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: "#5A718C", lineHeight: 1.5, marginTop: 3 }}>{b.body}</div>
                  </div>
                </label>
              );
            })}
          </FlowCard>

          <FlowCard>
            <Row label={offer.name} value={pricing.split ? `${cents(pricing.laterCents)} today` : cents(pricing.baseCents)} />
            {pricing.bumps.map((b) => (
              <Row key={b.key} label={b.label} value={cents(b.amountCents)} />
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid #E4EDF9", marginTop: 8, paddingTop: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>{pricing.split ? "Due today" : "Total"}</span>
              <span className="cs-display" style={{ fontWeight: 700, fontSize: 26, letterSpacing: "-0.02em" }}>
                {cents(pricing.dueTodayCents)}
              </span>
            </div>
            {pricing.split && (
              <div style={{ fontSize: 12.5, color: "#6A809A", fontWeight: 600, marginTop: 6 }}>
                Then {pricing.installments - 1} more payment{pricing.installments > 2 ? "s" : ""} of {cents(pricing.laterCents)} every 30 days. Total {cents(pricing.totalCents)}.
              </div>
            )}
          </FlowCard>
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 18, padding: 26, display: "flex", flexDirection: "column", gap: 16, minWidth: 0, boxShadow: "0 24px 60px rgba(var(--navy-rgb),0.08)" }}>
          <div className="cs-display" style={{ fontWeight: 700, fontSize: 18 }}>
            Payment
          </div>
          {!ready ? (
            <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "#3D556F" }}>
              Online checkout isn't switched on for {company} yet. {site.calendlyUrl ? (
                <>
                  <a href={site.calendlyUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>
                    Book a time with {first}
                  </a>{" "}
                  and the engagement is confirmed on the call.
                </>
              ) : (
                `Reply to ${first}'s email and the engagement is confirmed by hand.`
              )}
            </div>
          ) : !start ? (
            <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="cs-field">
                <label htmlFor="co-name" className="cs-label">
                  Full name
                </label>
                <input id="co-name" className={`cs-input${errors.name ? " cs-input--error" : ""}`} style={{ background: "#FFFFFF", borderRadius: 8 }} autoComplete="name" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} />
                {errors.name && <div className="cs-error">{errors.name}</div>}
              </div>
              <div className="cs-field">
                <label htmlFor="co-email" className="cs-label">
                  Email
                </label>
                <input id="co-email" type="email" className={`cs-input${errors.email ? " cs-input--error" : ""}`} style={{ background: "#FFFFFF", borderRadius: 8 }} autoComplete="email" placeholder="you@company.com" value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} />
                {errors.email && <div className="cs-error">{errors.email}</div>}
              </div>
              <div className="cs-field">
                <label htmlFor="co-phone" className="cs-label">
                  Phone <span style={{ color: "#7C93AD", fontWeight: 600 }}>(optional)</span>
                </label>
                <input id="co-phone" type="tel" className="cs-input" style={{ background: "#FFFFFF", borderRadius: 8 }} autoComplete="tel" placeholder="(555) 214-8890" value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} />
              </div>
              {errors.form && (
                <div role="alert" className="cs-error">
                  {errors.form}
                </div>
              )}
              <button type="submit" className="cs-submit" disabled={busy} style={{ marginTop: 6 }}>
                {busy ? "One moment…" : `Continue to payment · ${cents(pricing.dueTodayCents)}`}
              </button>
              <div style={{ fontSize: 12, color: "#7C93AD", lineHeight: 1.55, textAlign: "center" }}>
                By paying you agree to the engagement terms. Activity-based marketing — not paid advertising; no performance guarantees.
                <br />
                Payments processed by <strong style={{ color: "#635BFF" }}>Stripe</strong>. We never see your card number.
              </div>
            </form>
          ) : start.mode === "demo" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: "#FFF8F0", border: "1px solid #F6E4CC", borderRadius: 12, padding: "12px 14px", fontSize: 13, lineHeight: 1.55, color: "#8A6320", fontWeight: 600 }}>Demo checkout — Stripe isn't connected on this environment, so no card is charged. The order, portal and emails behave exactly as they will live.</div>
              <div style={{ fontSize: 14, color: "#3D556F" }}>
                Order <strong style={{ color: "var(--navy)" }}>{start.orderId.toUpperCase()}</strong> for {buyer.name} · {buyer.email}
              </div>
              {errors.form && (
                <div role="alert" className="cs-error">
                  {errors.form}
                </div>
              )}
              <button type="button" className="cs-submit" disabled={paying} onClick={demoPay}>
                {paying ? "Processing…" : `Pay ${cents(start.dueTodayCents)} (demo)`}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 13.5, color: "#3D556F" }}>
                Order <strong style={{ color: "var(--navy)" }}>{start.orderId.toUpperCase()}</strong> · {cents(start.dueTodayCents)} due today
              </div>
              {embedError ? (
                <div role="alert" className="cs-error">
                  {embedError}{" "}
                  {start.url && (
                    <a href={start.url} style={{ fontWeight: 700 }}>
                      Open Stripe Checkout ↗
                    </a>
                  )}
                </div>
              ) : (
                <div ref={mountRef} style={{ minHeight: 420 }} />
              )}
            </div>
          )}
        </div>
      </div>
      <div style={{ marginTop: 22, textAlign: "center" }}>
        <Link href="/pricing" style={{ fontSize: 13.5, fontWeight: 700, color: "var(--blue-deep)" }}>
          ← Back to pricing
        </Link>
      </div>
    </FlowPage>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#3D556F", padding: "6px 0" }}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);
