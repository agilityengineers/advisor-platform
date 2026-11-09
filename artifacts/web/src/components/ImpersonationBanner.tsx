import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { exitImpersonation } from "@/lib/impersonation";

const ROLE_LABEL: Record<string, string> = { admin: "Admin", manager: "Manager", advisor: "Client advisor", client: "Client" };

function remaining(expiresAt: string, now: number): string {
  const mins = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
  return mins <= 1 ? "less than a minute" : `${mins} min`;
}

/**
 * Pinned to the bottom of every page while the super admin is signed in as someone else: who,
 * which company, why, how long is left, and a one-click way out. Ends the session on its own
 * when the clock runs out. Also confirms, back in Platform Admin, that a session has ended.
 */
export function ImpersonationBanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const imp = user?.impersonation ?? null;
  const [now, setNow] = useState(() => Date.now());
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!imp) return;
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, [imp]);

  useEffect(() => {
    if (imp && !leaving && Date.parse(imp.expiresAt) <= now) {
      setLeaving(true);
      void exitImpersonation();
    }
  }, [imp, now, leaving]);

  // Lift toasts above the banner while it shows.
  useEffect(() => {
    if (!imp) return;
    document.documentElement.style.setProperty("--toast-offset", "76px");
    return () => {
      document.documentElement.style.removeProperty("--toast-offset");
    };
  }, [imp]);

  // Back in Platform Admin after a session ended (or expired) elsewhere.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("impersonation") !== "ended") return;
    toast("Impersonation session ended. You're back in your own account.", "info");
    params.delete("impersonation");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [toast]);

  if (!user || !imp) return null;
  const who = `${user.name} · ${ROLE_LABEL[user.role] ?? user.role}${user.company ? ` · ${user.company.name}` : ""}`;
  return (
    <>
      <div aria-hidden className="h-[64px]" />
      <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-0 z-[90] border-t-2 border-navy bg-warn text-navy shadow-[0_-8px_24px_rgba(10,22,38,0.18)]">
        <div className="mx-auto flex min-h-[64px] max-w-[1400px] items-center gap-4 px-4 py-2 max-sm:flex-wrap max-sm:gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-navy opacity-50" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-navy" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-bold">
              Impersonating {who}
            </div>
            <div className="truncate text-[12px] font-semibold opacity-80" title={imp.reason}>
              Signed in by {imp.by.name} · Ends in {remaining(imp.expiresAt, now)} · Reason: {imp.reason}
            </div>
          </div>
          <button
            type="button"
            disabled={leaving}
            onClick={() => {
              setLeaving(true);
              void exitImpersonation();
            }}
            className="shrink-0 rounded-pill bg-navy px-4 py-2 text-[13px] font-bold text-white hover:bg-navy/90 disabled:opacity-60"
          >
            {leaving ? "Ending…" : "End session"}
          </button>
        </div>
      </div>
    </>
  );
}
