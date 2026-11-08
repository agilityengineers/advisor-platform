import type { ReactNode } from "react";
import { Link } from "wouter";
import { useTenant } from "@/hooks/use-tenant";
import { initials } from "@/lib/utils";
import { Spinner } from "./ui";

/**
 * The sign-in doors. A company's door shows that company's branding and never
 * the platform's; the platform door wears the Advisor Platform look
 * (cream, ink, brass, Newsreader).
 */
export function AuthShell({ title, intro, children, footer }: { title: string; intro?: string; children: ReactNode; footer?: ReactNode }) {
  const tenant = useTenant();

  if (tenant.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <Spinner />
      </div>
    );
  }

  if (tenant.kind === "company_suspended") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page px-6">
        <div className="max-w-md text-center">
          <h1 className="font-display text-[22px] font-bold text-navy">{tenant.company.name} is unavailable</h1>
          <p className="mt-2 text-[14.5px] text-body">This account is suspended. Please contact the company directly.</p>
        </div>
      </div>
    );
  }

  if (tenant.kind === "platform") {
    return (
      <div className="min-h-screen bg-ap-cream text-ap-ink" style={{ fontFamily: "var(--font-ap-sans)" }}>
        <div className="mx-auto grid min-h-screen max-w-[1200px] grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
          <aside className="hidden flex-col justify-between bg-ap-green p-12 text-[#F6F2EA] lg:flex">
            <Link href="/" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-ap-brass text-[16px] font-semibold" style={{ fontFamily: "var(--font-ap-display)" }}>
                AP
              </span>
              <span className="text-[15px] font-semibold tracking-tight">Advisor Platform</span>
            </Link>
            <div>
              <h2 className="text-[40px] font-medium leading-[1.08] tracking-[-0.01em]" style={{ fontFamily: "var(--font-ap-display)" }}>
                Your advisory practice, running on one console.
              </h2>
              <p className="mt-5 max-w-[440px] text-[16px] leading-relaxed text-[#F6F2EA]/75">Branded landing page, lead-to-close pipeline, Brand Voice capture, Profile Grader, checkout and client portal — on your own domain.</p>
            </div>
            <div className="text-[12.5px] text-[#F6F2EA]/55">advisor-platform.com · advisor-platform.findabusinesspro.com · advisor-platform.authority-desk.com</div>
          </aside>
          <main className="flex items-center justify-center px-6 py-12">
            <div className="w-full max-w-[420px]">
              <Link href="/" className="mb-8 flex items-center gap-3 lg:hidden">
                <span className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-ap-green text-[14px] font-semibold text-ap-brass" style={{ fontFamily: "var(--font-ap-display)" }}>
                  AP
                </span>
                <span className="text-[15px] font-semibold">Advisor Platform</span>
              </Link>
              <div className="rounded-[14px] border border-[#E6DFD0] bg-ap-surface p-8 shadow-[0_18px_50px_rgba(22,19,15,0.06)]">
                <h1 className="text-[30px] font-medium leading-tight tracking-[-0.01em]" style={{ fontFamily: "var(--font-ap-display)" }}>
                  {title}
                </h1>
                {intro && <p className="mt-2 text-[14.5px] leading-relaxed text-ap-ink/70">{intro}</p>}
                <div className="mt-6">{children}</div>
              </div>
              {footer && <div className="mt-5 text-center text-[13.5px] text-ap-ink/70">{footer}</div>}
            </div>
          </main>
        </div>
      </div>
    );
  }

  const { branding, name } = tenant.company;
  const displayName = branding.companyName || name;
  return (
    <div className="min-h-screen bg-page">
      <div className="mx-auto grid min-h-screen max-w-[1180px] grid-cols-1 lg:grid-cols-[1fr_1fr]">
        <aside className="hidden flex-col justify-between p-12 text-white lg:flex" style={{ background: "var(--brand-accent)" }}>
          <Link href="/" className="flex items-center gap-3">
            {branding.logoUrl ? (
              // A white plate keeps dark-on-light logos legible on the dark panel.
              <span className="inline-flex rounded-[10px] bg-white px-3 py-2">
                <img src={branding.logoUrl} alt={displayName} className="h-9 max-w-[220px] object-contain object-left" />
              </span>
            ) : (
              <>
                <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand font-display text-[15px] font-bold text-[var(--brand-on-primary)]">{initials(displayName)}</span>
                <span className="font-display text-[15px] font-bold tracking-tight">{displayName}</span>
              </>
            )}
          </Link>
          <div>
            <h2 className="font-display text-[38px] font-bold leading-[1.1] tracking-[-0.02em]">{branding.tagline || "Better profiles, stronger connection."}</h2>
            <p className="mt-5 max-w-[440px] text-[15.5px] leading-relaxed text-white/75">Sign in to work your pipeline, publish your website, and see where every client stands.</p>
          </div>
          <div className="text-[12.5px] text-white/50">{displayName}</div>
        </aside>
        <main className="flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-[420px]">
            <Link href="/" className="mb-8 flex items-center gap-3 lg:hidden">
              {branding.logoUrl ? <img src={branding.logoUrl} alt={displayName} className="h-9 max-w-[200px] object-contain object-left" /> : <span className="font-display text-[16px] font-bold text-navy">{displayName}</span>}
            </Link>
            <div className="rounded-card-lg border border-line bg-white p-8 shadow-card">
              <h1 className="font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-navy">{title}</h1>
              {intro && <p className="mt-2 text-[14.5px] leading-relaxed text-body">{intro}</p>}
              <div className="mt-6">{children}</div>
            </div>
            {footer && <div className="mt-5 text-center text-[13.5px] text-body">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
