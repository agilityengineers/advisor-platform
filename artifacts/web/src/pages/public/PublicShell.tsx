import { useRef, type ReactNode } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { Spinner } from "@/components/ui";
import { useReveal } from "@/hooks/use-reveal";
import { usePublicSite } from "./usePublicSite";
import { SiteState } from "./SiteChrome";
import type { PublicSiteResponse } from "./types";

/**
 * Resolves the company behind the host and loads its published site once, then
 * hands the payload to a page. Shows the suspended / not-a-company states.
 */
export function PublicShell({ children }: { children: (site: PublicSiteResponse) => ReactNode }) {
  const tenant = useTenant();
  const query = usePublicSite(tenant.kind === "company");
  const root = useRef<HTMLDivElement>(null);
  useReveal(root, Boolean(query.data));

  if (tenant.kind === "loading" || (tenant.kind === "company" && query.isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <Spinner />
      </div>
    );
  }
  if (tenant.kind === "company_suspended") {
    return <SiteState title={`${tenant.company.name} is unavailable`} body="This site is temporarily suspended." />;
  }
  if (tenant.kind !== "company") {
    return <SiteState title="That page isn't here" body="This page belongs to a company site. Check the address you were given." />;
  }
  if (query.isError || !query.data) {
    return <SiteState title="We couldn't load this page" body="Please refresh in a moment." />;
  }
  return (
    <div ref={root} className="cs-site">
      {query.data.site.preview && (
        <div style={{ background: "#0A1626", color: "#FFFFFF", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.08em", textAlign: "center", padding: "8px 16px" }}>
          DRAFT PREVIEW · ONLY YOU CAN SEE THIS VERSION · VISITORS SEE THE PUBLISHED PAGE
        </div>
      )}
      {children(query.data)}
    </div>
  );
}
