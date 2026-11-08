import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import type { SiteContent } from "@workspace/shared";
import { routeBase } from "@/lib/api";
import { siteVoice } from "./usePublicSite";

interface ChromeProps {
  content: SiteContent;
  calendlyUrl: string | null;
  /** Which page this header sits on, for the active link and anchor prefixes. */
  page: "landing" | "about" | "pricing";
  /** Pricing pages trade the nav for a "private" badge and one button. */
  pricingCta?: string;
}

export function CompanyLogo({ src, name, height = 38, maxWidth = 190 }: { src: string; name: string; height?: number; maxWidth?: number }) {
  return src ? <img src={src} alt={name} className="cs-logo__img" style={{ height, maxWidth }} /> : <span className="cs-logo__word" style={{ fontSize: height > 34 ? 18 : 16 }}>{name}</span>;
}

/** Sticky header: logo, section links, "Book a call", primary CTA. Collapses to a menu below 900px. */
export function SiteHeader({ content, calendlyUrl, page, pricingCta }: ChromeProps) {
  const [open, setOpen] = useState(false);
  const { brand, hero, visibility } = content;
  const { first } = siteVoice(content);
  const home = page === "landing" ? "" : "/";
  const anchor = (id: string) => (page === "landing" ? `#${id}` : `${routeBase()}/#${id}`);
  const book = calendlyUrl ?? anchor("apply");
  const links: { href: string; label: string; current?: boolean; external?: boolean }[] = [
    ...(visibility.journey ? [{ href: anchor("journey"), label: "Your journey" }] : []),
    ...(visibility.cost ? [{ href: anchor("cost"), label: "The cost" }] : []),
    ...(visibility.plan ? [{ href: anchor("plan"), label: "The plan" }] : []),
    { href: anchor("blueprint"), label: "Brand Voice" },
    ...(visibility.about ? [{ href: `${routeBase()}/about`, label: `About ${first}`, current: page === "about" }] : []),
  ];
  // Landing-only links point at anchors on the same page; the About page keeps the prototype's shorter list.
  const shown = page === "about" ? links.filter((l) => l.label !== "Your journey") : links;

  return (
    <header className="cs-header">
      <div className="cs-wrap cs-header__row">
        {page === "landing" ? (
          <a href="#top" className="cs-logo" aria-label={brand.companyName}>
            <CompanyLogo src={brand.logoUrl} name={brand.companyName} />
          </a>
        ) : (
          <Link href={home || "/"} className="cs-logo" aria-label={brand.companyName}>
            <CompanyLogo src={brand.logoUrl} name={brand.companyName} />
          </Link>
        )}
        {page === "pricing" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div className="cs-private">
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--blue)" }} />
              PRIVATE · SHARED BY {first.toUpperCase()}
            </div>
            <a href={book} target={calendlyUrl ? "_blank" : undefined} rel="noopener noreferrer" className="cs-btn cs-btn--nav">
              {pricingCta ?? "Talk it through"}
            </a>
          </div>
        ) : (
          <nav aria-label="Primary" className="cs-nav">
            <div className="cs-nav__links">
              {shown.map((l) => (
                <a key={l.label} href={l.href} aria-current={l.current ? "page" : undefined}>
                  {l.label}
                </a>
              ))}
            </div>
            <a href={book} target={calendlyUrl ? "_blank" : undefined} rel="noopener noreferrer" className="cs-nav__book">
              Book a call
            </a>
            <a href={anchor("apply")} className="cs-btn cs-btn--nav">
              {hero.primaryCta}
            </a>
            <button type="button" className="cs-menu-btn" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </nav>
        )}
      </div>
      {open && page !== "pricing" && (
        <div className="cs-menu" onClick={() => setOpen(false)}>
          {shown.map((l) => (
            <a key={l.label} href={l.href}>
              {l.label}
            </a>
          ))}
          <a href={book} target={calendlyUrl ? "_blank" : undefined} rel="noopener noreferrer">
            Book a call
          </a>
          <a href={anchor("apply")} style={{ color: "var(--blue-deep)" }}>
            {hero.primaryCta} →
          </a>
        </div>
      )}
    </header>
  );
}

export function SiteFooter({ content, right, legal }: { content: SiteContent; right?: ReactNode; legal?: string }) {
  const { brand, hero } = content;
  const [, navigate] = useLocation();
  return (
    <footer className="cs-footer">
      <div className="cs-wrap cs-footer__row">
        <Link href="/" className="cs-logo" aria-label={brand.companyName}>
          <CompanyLogo src={brand.footerLogoUrl || brand.logoUrl} name={brand.companyName} height={34} maxWidth={170} />
        </Link>
        <div className="cs-footer__legal">{legal ?? brand.legalLine}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {right ?? (
            <a href="#apply" className="cs-footer__cta">
              {hero.primaryCta} →
            </a>
          )}
          <a
            href={`${routeBase()}/login`}
            className="cs-footer__signin"
            onClick={(e) => {
              e.preventDefault();
              navigate("/login");
            }}
          >
            Sign in
          </a>
        </div>
      </div>
    </footer>
  );
}

/** The amber strip linking the two private pricing pages to each other. */
export function PricingBar({ current }: { current: "standard" | "commercial" }) {
  const base = routeBase();
  return (
    <div className="cs-pricebar">
      <div className="cs-wrap cs-pricebar__row">
        <span>PRICING PAGES</span>
        {current === "standard" ? (
          <>
            <span className="cs-pricebar__on">Standard pricing · individuals</span>
            <a href={`${base}/commercial-pricing`} className="cs-pricebar__link">
              Commercial pricing · teams &amp; companies →
            </a>
          </>
        ) : (
          <>
            <a href={`${base}/pricing`} className="cs-pricebar__link">
              ← Standard pricing · individuals
            </a>
            <span className="cs-pricebar__on">Commercial pricing · teams &amp; companies</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Full-page states shared by every company route. */
export function SiteState({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <main className="cs-site" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center", background: "#F4F8FE" }}>
      <div style={{ maxWidth: 480 }}>
        <h1 className="cs-display" style={{ fontSize: 26, fontWeight: 700, color: "var(--navy)", margin: 0, letterSpacing: "-0.02em" }}>
          {title}
        </h1>
        {body && <p style={{ fontSize: 15.5, lineHeight: 1.6, color: "#3D556F", margin: "10px 0 0" }}>{body}</p>}
        {children}
      </div>
    </main>
  );
}
