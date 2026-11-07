import type { GraderResult, SiteContent } from "@workspace/shared";
import type { PublicCompany } from "@/hooks/use-tenant";

export interface PublicReview {
  id: number;
  name: string;
  role: string;
  category: string;
  linkedin: string;
  quote: string;
  reviewedOn: string | null;
}

export interface PublicSiteResponse {
  company: PublicCompany;
  site: { content: SiteContent; version: number; publishedAt: string | null; customized: boolean; preview: boolean };
  reviews: PublicReview[];
  calendlyUrl: string | null;
}

export interface LeadSubmitResponse {
  ok: boolean;
  leadId: string;
  firstName: string;
  calendlyUrl: string | null;
}

export interface GradeResponse {
  company: PublicCompany;
  brand: { ownerName: string; ownerFullName: string; ownerPhoto: string; logoUrl: string };
  calendlyUrl: string | null;
  sample: boolean;
  profileName: string;
  linkedinUrl: string;
  unlocked: boolean;
  canToggle: boolean;
  rubricVersion: number;
  categoryCount: number;
  status: string;
  result: GraderResult | null;
  createdAt: string | null;
}

export interface PlatformLeadResponse {
  ok: boolean;
  requestId: string;
  firstName: string;
  intent: "demo" | "trial";
  calendlyUrl: string | null;
}
