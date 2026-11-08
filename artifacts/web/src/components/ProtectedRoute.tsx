import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import type { Role } from "@workspace/shared";
import { useAuth } from "@/hooks/use-auth";
import { routeBase } from "@/lib/api";
import { Spinner } from "./ui";

/** Sends a signed-out visitor to the right door, carrying the page they wanted as ?next=. */
export function ProtectedRoute({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    // This component may sit inside a nested router, so build absolute paths
    // (`~` tells wouter to ignore every base) from the real browser location.
    const here = `${window.location.pathname}${window.location.search}`;
    if (!user) {
      const door = roles.length === 1 && roles[0] === "client" ? "/client/login" : "/staff/login";
      navigate(`~${routeBase()}${door}?next=${encodeURIComponent(here)}`, { replace: true });
    } else if (!roles.includes(user.role)) {
      navigate(`~${routeBase()}/`, { replace: true });
    }
  }, [user, isLoading, roles, navigate]);

  if (isLoading || !user || !roles.includes(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <Spinner />
      </div>
    );
  }
  return <>{children}</>;
}
