import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { OrderPayload } from "./types";

export const orderParam = () => new URLSearchParams(window.location.search).get("order") ?? "";

/** The buyer's order, by the unguessable id in the URL. `sessionId` lets the return page confirm a live payment. */
export function useOrder(publicId: string, opts: { sessionId?: string | null; pollWhilePending?: boolean } = {}) {
  return useQuery<OrderPayload>({
    queryKey: ["public-order", publicId, opts.sessionId ?? null],
    queryFn: () => api(`/public/orders/${encodeURIComponent(publicId)}${opts.sessionId ? `?session_id=${encodeURIComponent(opts.sessionId)}` : ""}`),
    enabled: Boolean(publicId),
    retry: false,
    refetchInterval: (q) => (opts.pollWhilePending && q.state.data?.order.status === "pending" ? 2500 : false),
  });
}

export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
export const fmtWhen = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

/** Load Calendly's embed script once (allowed by the CSP) and resolve when `window.Calendly` exists. */
export function loadCalendly(): Promise<CalendlyGlobal | null> {
  const w = window as Window & { Calendly?: CalendlyGlobal };
  if (w.Calendly) return Promise.resolve(w.Calendly);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-calendly]");
    const done = () => resolve((window as Window & { Calendly?: CalendlyGlobal }).Calendly ?? null);
    if (existing) {
      existing.addEventListener("load", done);
      existing.addEventListener("error", () => resolve(null));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://assets.calendly.com/assets/external/widget.js";
    s.async = true;
    s.dataset.calendly = "1";
    s.onload = done;
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
    if (!document.querySelector("link[data-calendly]")) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = "https://assets.calendly.com/assets/external/widget.css";
      l.dataset.calendly = "1";
      document.head.appendChild(l);
    }
  });
}

export interface CalendlyGlobal {
  initInlineWidget: (opts: { url: string; parentElement: HTMLElement; prefill?: { name?: string; email?: string; customAnswers?: Record<string, string> } }) => void;
}
