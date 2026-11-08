import { useEffect, type RefObject } from "react";

/**
 * Below-the-fold blocks marked `data-reveal` fade and rise in as they scroll into
 * view (the prototype's reveal behaviour). Anything already on screen at mount
 * stays visible; reduced-motion users get everything at once.
 */
export function useReveal(root: RefObject<HTMLElement | null>, ready: boolean): void {
  useEffect(() => {
    const el = root.current;
    if (!el || !ready || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const vh = window.innerHeight || 800;
    const nodes = Array.from(el.querySelectorAll<HTMLElement>("[data-reveal]")).filter((n) => n.getBoundingClientRect().top > vh * 0.9);
    nodes.forEach((n) => n.classList.add("cs-reveal"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    nodes.forEach((n) => io.observe(n));
    return () => {
      io.disconnect();
      nodes.forEach((n) => n.classList.remove("cs-reveal", "is-in"));
    };
  }, [root, ready]);
}

/** Scroll to `location.hash` once the page content exists (the landing loads asynchronously). */
export function useHashScroll(ready: boolean): void {
  useEffect(() => {
    if (!ready || !window.location.hash) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 60);
    return () => window.clearTimeout(t);
  }, [ready]);
}
