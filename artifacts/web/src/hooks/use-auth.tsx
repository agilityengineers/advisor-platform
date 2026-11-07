import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Perms, Role } from "@workspace/shared";
import { api } from "@/lib/api";
import { getToken, setToken, recallDoor } from "@/lib/session";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  username: string | null;
  role: Role;
  companyId: number | null;
  company: { id: number; name: string; slug: string; plan: string; status: string } | null;
  perms: Perms;
  phone: string | null;
  avatarUrl: string | null;
  hasPassword: boolean;
}

export interface SessionResponse {
  token: string;
  expiresIn: number;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  /** Store a freshly issued session and navigate to the right home. */
  acceptSession: (session: SessionResponse, next?: string | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
export const ME_KEY = ["auth", "me"];

/** Where each role lands after sign-in. */
export function homeFor(user: AuthUser): string {
  if (user.role === "super_admin") return "/admin";
  if (user.role === "client") return "/portal";
  return "/app";
}

export function isSafeNext(next: string | null | undefined): next is string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const token = getToken();

  const { data, isLoading } = useQuery<AuthUser>({
    queryKey: ME_KEY,
    queryFn: () => api("/auth/me"),
    enabled: Boolean(token),
    retry: false,
    staleTime: 60_000,
  });

  const acceptSession = useCallback(
    (session: SessionResponse, next?: string | null) => {
      setToken(session.token);
      queryClient.setQueryData(ME_KEY, session.user);
      navigate(isSafeNext(next) ? next : homeFor(session.user));
    },
    [navigate, queryClient],
  );

  const logout = useCallback(() => {
    setToken(null);
    queryClient.setQueryData(ME_KEY, null);
    queryClient.removeQueries();
    navigate(recallDoor() ?? "/login");
  }, [navigate, queryClient]);

  return <AuthContext.Provider value={{ user: token ? (data ?? null) : null, isLoading: Boolean(token) && isLoading, acceptSession, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
