import type { ReactNode } from "react";
import { Link } from "wouter";
import { CompanyLogo } from "./SiteChrome";

/** The buying-flow pages share a pale page, a slim header and the company's logo. */
export function FlowPage({ logoUrl, companyName, right, children, maxWidth = 1080 }: { logoUrl: string; companyName: string; right?: ReactNode; children: ReactNode; maxWidth?: number }) {
  return (
    <div className="cs-site" style={{ minHeight: "100vh", background: "#F4F8FE", display: "flex", flexDirection: "column" }}>
      <header style={{ background: "#FFFFFF", borderBottom: "1px solid #E4EDF9" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <Link href="/" className="cs-logo" aria-label={companyName}>
            <CompanyLogo src={logoUrl} name={companyName} height={34} maxWidth={170} />
          </Link>
          {right}
        </div>
      </header>
      <main style={{ flex: 1, padding: "48px 20px 80px" }}>
        <div style={{ maxWidth, margin: "0 auto" }}>{children}</div>
      </main>
    </div>
  );
}

export const SecureBadge = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#1E7A4C" }}>
    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2FBF71" }} />
    Secure checkout
  </div>
);

export function FlowCard({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "#FFFFFF", border: "1px solid #DDE8F7", borderRadius: 18, padding: 22, ...style }}>{children}</div>;
}

export const Kicker = ({ children }: { children: ReactNode }) => <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.1em", color: "#7C93AD" }}>{children}</div>;
