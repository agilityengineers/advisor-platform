import { Component, type ReactNode } from "react";
import { Route, Router, Switch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TenantProvider } from "@/hooks/use-tenant";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { routeBase } from "@/lib/api";
import { Home } from "@/pages/Home";
import { NotFound } from "@/pages/NotFound";
import { SignInChooser } from "@/pages/auth/SignIn";
import { StaffSignIn } from "@/pages/auth/StaffSignIn";
import { ClientSignIn, ClientVerify } from "@/pages/auth/ClientSignIn";
import { ForgotPassword, ResetPassword } from "@/pages/auth/Password";
import { AcceptInvite } from "@/pages/auth/AcceptInvite";
import { PlatformAdminPlaceholder, CompanyConsolePlaceholder, ClientPortalPlaceholder } from "@/pages/Placeholders";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 } },
});

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Unhandled render error", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-page px-6 text-center">
          <div>
            <h1 className="font-display text-[22px] font-bold text-navy">Something went wrong</h1>
            <p className="mt-2 text-body">Please reload the page.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Router base={routeBase()}>
          <TenantProvider>
            <AuthProvider>
              <Switch>
                <Route path="/" component={Home} />
                <Route path="/login" component={SignInChooser} />
                <Route path="/staff/login" component={StaffSignIn} />
                <Route path="/client/login" component={ClientSignIn} />
                <Route path="/client/verify" component={ClientVerify} />
                <Route path="/forgot-password" component={ForgotPassword} />
                <Route path="/reset-password" component={ResetPassword} />
                <Route path="/accept-invite" component={AcceptInvite} />
                <Route path="/admin" nest>
                  <ProtectedRoute roles={["super_admin"]}>
                    <PlatformAdminPlaceholder />
                  </ProtectedRoute>
                </Route>
                <Route path="/app" nest>
                  <ProtectedRoute roles={["super_admin", "admin", "manager", "advisor"]}>
                    <CompanyConsolePlaceholder />
                  </ProtectedRoute>
                </Route>
                <Route path="/portal" nest>
                  <ProtectedRoute roles={["client"]}>
                    <ClientPortalPlaceholder />
                  </ProtectedRoute>
                </Route>
                <Route component={NotFound} />
              </Switch>
            </AuthProvider>
          </TenantProvider>
        </Router>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
