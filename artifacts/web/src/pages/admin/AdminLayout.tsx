import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { cn, initials } from "@/lib/utils";
import type { Overview } from "./types";

export const OVERVIEW_KEY = ["admin", "overview"];
export const useOverview = () => useQuery<Overview>({ queryKey: OVERVIEW_KEY, queryFn: () => api("/admin/overview"), staleTime: 30_000 });

// Paths are relative to the nested /admin router (wouter `nest`).
const NAV: { href: string; label: string; count?: (o: Overview) => number }[] = [
  { href: "/", label: "Companies", count: (o) => o.counts.companies },
  { href: "/requests", label: "Requests", count: (o) => o.counts.newRequests },
  { href: "/templates", label: "Templates", count: (o) => o.counts.templates },
  { href: "/registry", label: "Feature registry", count: (o) => o.counts.features },
  { href: "/plans", label: "Plans", count: (o) => o.counts.plans },
  { href: "/landing", label: "Platform landing" },
  { href: "/settings", label: "Platform settings" },
];

const isActive = (href: string, location: string) => (href === "/" ? location === "/" || location === "" : location.startsWith(href));

/** The super admin console shell: navy sidebar, Advisor Platform identity, platform domains, Clarence. */
export function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const overview = useOverview();
  const o = overview.data;
  const domains = o?.platform.domains ?? ["advisor-platform.com", "advisor-platform.findabusinesspro.com", "advisor-platform.authority-desk.com"];

  return (
    <div className="flex min-h-screen bg-page">
      <aside className="sticky top-0 flex h-screen w-[246px] shrink-0 flex-col gap-[26px] bg-navy px-[18px] py-[22px] text-white max-lg:hidden">
        <Link href="/" className="flex items-center gap-[11px]">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-blue font-display text-[15px] font-bold">AP</div>
          <div className="min-w-0">
            <div className="font-display text-[14.5px] font-bold tracking-[-0.01em]">Advisor Platform</div>
            <div className="text-[11px] font-bold tracking-[0.1em] text-[#7FB6FF]">PLATFORM ADMIN</div>
          </div>
        </Link>
        <nav aria-label="Platform" className="flex flex-col gap-1">
          {NAV.map((n) => {
            const active = isActive(n.href, location);
            const count = o && n.count ? n.count(o) : null;
            return (
              <Link key={n.href} href={n.href} className={cn("flex items-center justify-between gap-2.5 rounded-[11px] px-[13px] py-[11px] text-left text-[14.5px] transition-colors", active ? "bg-blue font-bold text-white" : "font-semibold text-[#AFC4DB] hover:bg-white/10 hover:text-white")}>
                {n.label}
                {count != null && <span className="rounded-pill bg-white/15 px-2 py-[3px] text-[11.5px] font-bold">{count}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-[14px] border border-white/10 bg-white/5 p-3.5">
          <div className="text-[10.5px] font-bold tracking-[0.1em] text-[#7FB6FF]">PLATFORM DOMAINS</div>
          {domains.map((d) => (
            <div key={d} className="mt-[7px] break-all text-[12px] font-semibold text-[#DCE7F4]">
              {d}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-[11px] border-t border-white/10 pt-4">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-warn text-[13px] font-bold text-navy">{initials(user?.name ?? "CW")}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-bold">{user?.name}</div>
            <div className="break-all text-[11.5px] font-semibold text-[#8FA6BF]">{user?.email}</div>
          </div>
          <button type="button" onClick={logout} aria-label="Sign out" className="text-[#8FA6BF] hover:text-white">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-7 pb-[60px] pt-[26px] max-md:px-4">
        <div className="mb-4 hidden items-center justify-between rounded-card border border-line bg-white px-4 py-3 text-[13px] font-semibold text-body max-lg:flex">
          <span>Platform Admin is best on desktop (≥1024px).</span>
          <button type="button" onClick={logout} className="font-bold text-blue">
            Sign out
          </button>
        </div>
        <nav aria-label="Platform (compact)" className="mb-4 hidden flex-wrap gap-1.5 max-lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cn("rounded-pill border px-3 py-1.5 text-[12.5px] font-bold", isActive(n.href, location) ? "border-blue bg-blue text-white" : "border-line bg-white text-body")}>
              {n.label}
            </Link>
          ))}
        </nav>
        {children}
      </main>
    </div>
  );
}
