import type { ReactNode } from "react";
import { Link } from "wouter";
import { LogOut } from "lucide-react";
import { INTEGRATION_PROVIDERS, type IntegrationProvider } from "@workspace/shared";
import { useAuth } from "@/hooks/use-auth";
import { cn, initials } from "@/lib/utils";
import { INT_STATUS, type Summary } from "./types";

const INT_NAME: Record<IntegrationProvider, string> = { sendgrid: "SendGrid", twilio: "Twilio", stripe: "Stripe", calendly: "Calendly" };

export interface ConsoleNavItem {
  id: string;
  label: string;
  count?: number | string | null;
  badge?: string | null;
  href?: string;
  onClick?: () => void;
  active?: boolean;
}

/**
 * The company console shell (CRM Dashboard.dc.html). The sidebar shows the
 * company logo or name — or, for the super admin, the Advisor Platform
 * identity with a "Viewing company" box that links back to Platform Admin.
 */
export function ConsoleLayout({ summary, nav, children }: { summary: Summary; nav: ConsoleNavItem[]; children: ReactNode }) {
  const { user, logout } = useAuth();
  const isSuper = summary.viewer.isSuperAdmin;
  const brand = summary.branding;
  const logo = summary.features.white_label.enabled ? brand?.logoUrl : "";
  const roleName = { super_admin: "Super admin", admin: "Admin · Company owner", manager: "Manager", advisor: "Client advisor", client: "Client" }[summary.viewer.role] ?? summary.viewer.role;

  return (
    <div className="flex min-h-screen items-stretch bg-page">
      <aside className="sticky top-0 flex h-screen w-[246px] shrink-0 flex-col gap-[26px] overflow-y-auto bg-navy px-[18px] py-[22px] text-white max-lg:hidden">
        <div className="flex flex-col gap-2">
          {isSuper ? (
            <div className="flex items-center gap-[11px]">
              <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-warn font-display text-[15px] font-bold text-navy">AP</div>
              <div className="min-w-0 font-display text-[14.5px] font-bold tracking-[-0.01em]">Advisor Platform</div>
            </div>
          ) : logo ? (
            <div role="img" aria-label={brand?.companyName || summary.company.name} className="h-12 w-full rounded-[10px] bg-white bg-contain bg-center bg-no-repeat p-1.5" style={{ backgroundImage: `url(${logo})`, backgroundOrigin: "content-box" }} />
          ) : (
            <div className="flex items-center gap-[11px]">
              <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-brand font-display text-[13px] font-bold text-[var(--brand-on-primary)]">{initials(summary.company.name)}</div>
              <div className="min-w-0 font-display text-[14.5px] font-bold tracking-[-0.01em]">{brand?.companyName || summary.company.name}</div>
            </div>
          )}
          <div className="text-[11px] font-bold tracking-[0.1em] text-[#7FB6FF]">{isSuper ? "SUPER ADMIN · CLARENCE WILLIAMS" : `${summary.plan.name.toUpperCase()} · LEAD CONSOLE`}</div>
        </div>

        {isSuper && (
          <Link href="~/admin" className="flex items-center gap-2.5 rounded-[11px] border border-warn/45 bg-warn/15 px-3 py-2.5 text-white hover:bg-warn/25">
            <span className="h-2 w-2 shrink-0 rounded-full bg-warn" />
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-bold">Viewing company: {summary.company.name}</div>
              <div className="text-[11px] font-semibold text-[#F3D9A8]">← Back to Platform Admin</div>
            </div>
          </Link>
        )}

        <nav aria-label="Sections" className="flex flex-col gap-1">
          {nav.map((n) =>
            n.href ? (
              <a key={n.id} href={n.href} target="_blank" rel="noopener noreferrer" className="rounded-[11px] px-[13px] py-[11px] text-[14.5px] font-semibold text-[#AFC4DB] hover:bg-white/10 hover:text-white">
                {n.label}
              </a>
            ) : (
              <button key={n.id} type="button" onClick={n.onClick} className={cn("flex items-center justify-between gap-2.5 rounded-[11px] px-[13px] py-[11px] text-left text-[14.5px] transition-colors", n.active ? "bg-brand font-bold text-[var(--brand-on-primary)]" : "font-semibold text-[#AFC4DB] hover:bg-white/10 hover:text-white")}>
                {n.label}
                {n.badge ? <span className="rounded-pill bg-warn px-[7px] py-[3px] text-[10.5px] font-bold text-navy">{n.badge}</span> : n.count != null ? <span className={cn("rounded-pill px-2 py-[3px] text-[11.5px] font-bold", n.active ? "bg-white/20" : "bg-white/10")}>{n.count}</span> : null}
              </button>
            ),
          )}
        </nav>

        <div className="mt-auto rounded-[14px] border border-white/10 bg-white/5 p-[15px]">
          <div className="text-[11.5px] font-bold tracking-[0.1em] text-[#7FB6FF]">INTEGRATIONS</div>
          <div className="mt-[11px] flex flex-col gap-[9px]">
            {INTEGRATION_PROVIDERS.map((p) => {
              const st = INT_STATUS[summary.integrations[p] ?? "not_connected"];
              return (
                <div key={p} className="flex items-center gap-[9px] text-[13.5px] font-semibold text-[#DCE7F4]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: st.dot }} />
                  {INT_NAME[p]}
                  <span className="ml-auto text-[10.5px] font-bold text-[#8FA6BF]">{st.side}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2.5 border-t border-white/10 pt-3.5">
          <div className="flex items-center gap-[11px]">
            <div className={cn("flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold", isSuper ? "bg-warn text-navy" : "bg-brand text-[var(--brand-on-primary)]")}>{initials(user?.name ?? "?")}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-bold">{user?.name}</div>
              <div className="text-[11.5px] font-semibold text-[#8FA6BF]">{roleName}</div>
            </div>
            <button type="button" onClick={logout} aria-label="Sign out" className="text-[#8FA6BF] hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="hidden items-center justify-between gap-3 border-b border-line-soft bg-white px-4 py-2.5 text-[12.5px] font-semibold text-body max-lg:flex">
          <div className="flex min-w-0 items-center gap-2">
            {isSuper && <span className="rounded-pill bg-warn/20 px-2 py-0.5 text-[11px] font-bold text-warn-deep">Viewing: {summary.company.name}</span>}
            <span className="truncate">Best on desktop (≥1024px). Leads and the lead drawer work here.</span>
          </div>
          <button type="button" onClick={logout} className="font-bold text-brand">
            Sign out
          </button>
        </div>
        {children}
      </main>
    </div>
  );
}
