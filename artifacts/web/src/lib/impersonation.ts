import type { SessionResponse } from "@/hooks/use-auth";
import { api } from "./api";
import { beginImpersonation, finishImpersonation } from "./session";

export interface ImpersonationInfo {
  sessionId: number;
  by: { id: number; name: string; email: string };
  reason: string;
  startedAt: string;
  expiresAt: string;
}

export interface StartImpersonationResponse extends SessionResponse {
  company: { id: number; name: string; slug: string };
  notified: string[];
}

/**
 * Switch this browser into the target user's session and open their home under the company's
 * own path (`/t/:slug/...`) so branding matches what they see. A full page load clears every
 * cached super-admin query. A suspended company's door shows the "suspended" page, so those
 * open on the platform path instead.
 */
export function enterImpersonation(r: StartImpersonationResponse, opts: { companySuspended?: boolean } = {}): void {
  beginImpersonation(r.token, `${window.location.pathname}${window.location.search}`);
  const home = r.user.role === "client" ? "/portal" : "/app";
  window.location.assign(opts.companySuspended ? home : `/t/${r.company.slug}${home}`);
}

/** End the session on the server (best effort — it may already have expired) and return to Platform Admin. */
export async function exitImpersonation(): Promise<void> {
  try {
    await api("/auth/impersonation/end", { method: "POST" });
  } catch {
    /* already ended or expired: the token is useless either way */
  }
  const back = finishImpersonation() ?? "/admin";
  window.location.assign(back);
}
