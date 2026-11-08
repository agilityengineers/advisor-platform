import { useQuery } from "@tanstack/react-query";
import { ownerFirstName, type SiteContent } from "@workspace/shared";
import { api } from "@/lib/api";
import type { PublicSiteResponse } from "./types";

export const isPreview = () => new URLSearchParams(window.location.search).get("preview") === "1";

/** The company's published site (or the draft, for signed-in staff with ?preview=1). */
export function usePublicSite(enabled = true) {
  const preview = isPreview();
  return useQuery<PublicSiteResponse>({
    queryKey: ["public-site", preview],
    queryFn: () => api(`/public/site${preview ? "?preview=1" : ""}`),
    enabled,
    staleTime: preview ? 0 : 60_000,
  });
}

/** Copy helpers shared by every company page. */
export function siteVoice(content: SiteContent) {
  const first = ownerFirstName(content.brand) || "us";
  const full = content.brand.ownerFullName || content.brand.ownerName;
  return { first, full, company: content.brand.companyName };
}
