import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { shade, tint, prefersWhiteText } from "@/lib/utils";

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
    for (const k of ["--brand-primary", "--brand-primary-hover", "--brand-accent", "--brand-tint", "--brand-on-primary"]) root.style.removeProperty(k);
    return;
  }
  root.style.setProperty("--brand-primary", branding.primaryColor);
  root.style.setProperty("--brand-primary-hover", shade(branding.primaryColor));
  root.style.setProperty("--brand-accent", branding.accentColor);
  root.style.setProperty("--brand-tint", tint(branding.primaryColor));
  root.style.setProperty("--brand-on-primary", prefersWhiteText(branding.primaryColor) ? "#ffffff" : "#0a1626");
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
