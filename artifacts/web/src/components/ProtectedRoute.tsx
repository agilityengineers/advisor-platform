import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import type { Role } from "@workspace/shared";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "./ui";

/** Sends a signed-out visitor to the right door, carrying the page they wanted as ?next=. */
export function ProtectedRoute({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      const door = roles.length === 1 && roles[0] === "client" ? "/client/login" : "/staff/login";
      navigate(`${door}?next=${encodeURIComponent(location)}`, { replace: true });
    } else if (!roles.includes(user.role)) {
      navigate("/", { replace: true });
    }
  }, [user, isLoading, roles, location, navigate]);

  if (isLoading || !user || !roles.includes(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <Spinner />
      </div>
    );
  }
  return <>{children}</>;
}
