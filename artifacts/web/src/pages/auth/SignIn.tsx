import { Link, useLocation } from "wouter";
import { Briefcase, UserRound, ArrowRight } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { useTenant } from "@/hooks/use-tenant";
import { useEffect } from "react";

/** The chooser: staff vs client. On a company's own door the client door opens directly. */
export function SignInChooser() {
  const tenant = useTenant();
  const [, navigate] = useLocation();
  const search = typeof window !== "undefined" ? window.location.search : "";

  useEffect(() => {
    if (tenant.kind === "company") navigate(`/client/login${search}`, { replace: true });
  }, [tenant.kind, navigate, search]);

  const isPlatform = tenant.kind === "platform";
  return (
    <AuthShell title="Sign in" intro="Choose the door that matches you.">
      <div className="grid gap-3">
        <Link href={`/staff/login${search}`} className={isPlatform ? "group flex items-center gap-4 rounded-[10px] border border-[#E6DFD0] bg-white p-4 transition hover:border-ap-brass" : "group flex items-center gap-4 rounded-card border border-line bg-white p-4 transition hover:border-brand"}>
          <span className={isPlatform ? "flex h-11 w-11 items-center justify-center rounded-[8px] bg-ap-cream text-ap-brass" : "flex h-11 w-11 items-center justify-center rounded-[12px] bg-pale text-brand"}>
            <Briefcase className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-bold">I run or work in a company</span>
            <span className="block text-[13px] opacity-70">Admins, managers, advisors and the platform owner</span>
          </span>
          <ArrowRight className="h-4 w-4 opacity-50 transition group-hover:translate-x-0.5" />
        </Link>
        <Link href={`/client/login${search}`} className={isPlatform ? "group flex items-center gap-4 rounded-[10px] border border-[#E6DFD0] bg-white p-4 transition hover:border-ap-brass" : "group flex items-center gap-4 rounded-card border border-line bg-white p-4 transition hover:border-brand"}>
          <span className={isPlatform ? "flex h-11 w-11 items-center justify-center rounded-[8px] bg-ap-cream text-ap-brass" : "flex h-11 w-11 items-center justify-center rounded-[12px] bg-pale text-brand"}>
            <UserRound className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-bold">I'm a client</span>
            <span className="block text-[13px] opacity-70">Open your portal with a secure email link</span>
          </span>
          <ArrowRight className="h-4 w-4 opacity-50 transition group-hover:translate-x-0.5" />
        </Link>
      </div>
    </AuthShell>
  );
}
