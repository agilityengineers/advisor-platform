import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth, homeFor } from "@/hooks/use-auth";
import { useTenant } from "@/hooks/use-tenant";
import { Button, Spinner } from "@/components/ui";

/**
 * Phase 1 placeholder for `/`: the platform landing and company landing pages
 * arrive in Phase 4. A signed-in person is sent to their console.
 */
export function Home() {
  const tenant = useTenant();
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && user) navigate(homeFor(user), { replace: true });
  }, [user, isLoading, navigate]);

  if (tenant.kind === "loading" || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <Spinner />
      </div>
    );
  }

  if (tenant.kind === "company_suspended") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page px-6 text-center">
        <div>
          <h1 className="font-display text-[24px] font-bold text-navy">{tenant.company.name} is unavailable</h1>
          <p className="mt-2 text-body">This site is temporarily suspended.</p>
        </div>
      </main>
    );
  }

  if (tenant.kind === "company") {
    const { branding, name } = tenant.company;
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-page px-6 text-center">
        {branding.logoUrl ? <img src={branding.logoUrl} alt={branding.companyName || name} className="mb-8 h-12 object-contain" /> : <div className="mb-8 font-display text-[22px] font-bold text-navy">{branding.companyName || name}</div>}
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-navy">{branding.tagline || "Better profiles, stronger connection."}</h1>
        <p className="mt-3 max-w-[520px] text-[15.5px] text-body">The public website for {branding.companyName || name} is being set up.</p>
        <div className="mt-8 flex gap-3">
          <Link href="/client/login">
            <Button size="lg">Client sign-in</Button>
          </Link>
          <Link href="/staff/login">
            <Button size="lg" variant="secondary">
              Staff sign-in
            </Button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ap-cream px-6 text-center text-ap-ink" style={{ fontFamily: "var(--font-ap-sans)" }}>
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-[6px] bg-ap-green text-[17px] font-semibold text-ap-brass" style={{ fontFamily: "var(--font-ap-display)" }}>
          AP
        </span>
        <span className="text-[17px] font-semibold">Advisor Platform</span>
      </div>
      <h1 className="max-w-[760px] text-[44px] font-medium leading-[1.08] tracking-[-0.01em]" style={{ fontFamily: "var(--font-ap-display)" }}>
        The white-label console for LinkedIn advisory professionals.
      </h1>
      <p className="mt-4 max-w-[560px] text-[16px] leading-relaxed text-ap-ink/70">Branded landing page, lead-to-close pipeline, Brand Voice capture, Profile Grader, checkout and client portal — on your own domain.</p>
      <div className="mt-8 flex gap-3">
        <Link href="/staff/login">
          <Button variant="ap" size="lg">
            Sign in
          </Button>
        </Link>
      </div>
    </main>
  );
}
