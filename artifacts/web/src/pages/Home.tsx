import { useTenant } from "@/hooks/use-tenant";
import { Spinner } from "@/components/ui";
import { PlatformLanding } from "@/pages/public/PlatformLanding";
import { CompanyLanding } from "@/pages/public/CompanyLanding";

/**
 * `/` — the Advisor Platform landing on platform hosts, a company's landing page
 * on its own domain, subdomain or /t/:slug path.
 */
export function Home() {
  const tenant = useTenant();
  if (tenant.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <Spinner />
      </div>
    );
  }
  if (tenant.kind === "platform") return <PlatformLanding />;
  return <CompanyLanding />;
}
