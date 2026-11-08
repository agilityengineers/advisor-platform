import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { shade, tint, prefersWhiteText, hexToRgbTriplet } from "@/lib/utils";

const BRAND_VARS = ["--brand-primary", "--brand-primary-hover", "--brand-accent", "--brand-tint", "--brand-on-primary", "--brand-primary-deep", "--brand-primary-light", "--brand-tint-border", "--brand-primary-rgb", "--brand-accent-rgb"] as const;

/** The design's exact derived shades for the default blue; other brands derive theirs arithmetically. */
const DEFAULT_PRIMARY = "#1668f0";
const DEFAULT_DERIVED = { hover: "#0b4fd0", deep: "#0b4fd0", light: "#7fb6ff", tint: "#eaf2fd", tintBorder: "#d3e4fb" } as const;

export interface PublicBranding {
  companyName: string;
  tagline: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
}

export interface PublicCompany {
  id: number;
  name: string;
  slug: string;
  ownerName: string;
  status: string;
  branding: PublicBranding;
  publicFeatures: Record<string, boolean>;
  checkout: { ready: boolean; mode: "live" | "demo" | "off" };
}

export type TenantState =
  | { kind: "loading" }
  | { kind: "platform"; platform: { name: string; domains: string[]; primaryDomain: string } }
  | { kind: "company"; via: string; company: PublicCompany }
  | { kind: "company_suspended"; company: { name: string; slug: string } };

const TenantContext = createContext<TenantState>({ kind: "loading" });

/** Inject the company's colours as CSS custom properties so every surface inherits them. */
export function applyBrandVariables(branding: PublicBranding | null): void {
  const root = document.documentElement;
  if (!branding) {
    for (const k of BRAND_VARS) root.style.removeProperty(k);
    return;
  }
  const primary = branding.primaryColor.toLowerCase();
  const isDefault = primary === DEFAULT_PRIMARY;
  root.style.setProperty("--brand-primary", branding.primaryColor);
  root.style.setProperty("--brand-primary-hover", isDefault ? DEFAULT_DERIVED.hover : shade(primary));
  root.style.setProperty("--brand-primary-deep", isDefault ? DEFAULT_DERIVED.deep : shade(primary, 0.2));
  root.style.setProperty("--brand-primary-light", isDefault ? DEFAULT_DERIVED.light : tint(primary, 0.5));
  root.style.setProperty("--brand-accent", branding.accentColor);
  root.style.setProperty("--brand-tint", isDefault ? DEFAULT_DERIVED.tint : tint(primary));
  root.style.setProperty("--brand-tint-border", isDefault ? DEFAULT_DERIVED.tintBorder : tint(primary, 0.78));
  root.style.setProperty("--brand-primary-rgb", hexToRgbTriplet(primary));
  root.style.setProperty("--brand-accent-rgb", hexToRgbTriplet(branding.accentColor));
  root.style.setProperty("--brand-on-primary", prefersWhiteText(primary) ? "#ffffff" : "#0a1626");
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery<Exclude<TenantState, { kind: "loading" }>>({
    queryKey: ["tenant", window.location.pathname.match(/^\/t\/[^/]+/)?.[0] ?? ""],
    queryFn: () => api("/tenant"),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (!data) return;
    if (data.kind === "company") {
      applyBrandVariables(data.company.branding);
      document.title = data.company.branding.companyName || data.company.name;
    } else {
      applyBrandVariables(null);
      document.title = "Advisor Platform";
    }
  }, [data]);

  return <TenantContext.Provider value={data ?? { kind: "loading" }}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantState {
  return useContext(TenantContext);
}

export function useCompanyTenant(): PublicCompany | null {
  const t = useTenant();
  return t.kind === "company" ? t.company : null;
}
