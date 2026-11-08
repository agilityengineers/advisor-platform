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
  leadUnlocked?: boolean;
  canToggle: boolean;
  rubricVersion: number;
  categoryCount: number;
  status: string;
  result: GraderResult | null;
  errorMessage?: string | null;
  createdAt: string | null;
}

export interface PlatformLeadResponse {
  ok: boolean;
  requestId: string;
  firstName: string;
  intent: "demo" | "trial";
  calendlyUrl: string | null;
}

// ---------------------------------------------------------------------------
// Buying flow
// ---------------------------------------------------------------------------

export interface CheckoutStart {
  mode: "demo" | "live";
  orderId: string;
  dueTodayCents: number;
  thanksUrl: string;
  clientSecret?: string | null;
  url?: string | null;
  publishableKey?: string | null;
  accountId?: string;
}

export interface OrderStageView {
  id: number;
  key: string;
  label: string;
  status: "pending" | "current" | "done" | "scheduled";
  meta: string;
  note: string;
  completedAt: string | null;
  action: "intake" | "book" | "reschedule" | null;
}

export interface OrderPayload {
  order: {
    publicId: string;
    status: "pending" | "paid" | "refunded" | "canceled";
    offer: { key: string; name: string; sub: string; includes: string[] };
    plan: "full" | "split";
    installments: number;
    bumps: { key: string; label: string; amountCents: number }[];
    amountCents: number;
    totalCents: number;
    laterCents: number;
    customerName: string;
    firstName: string;
    customerEmail: string;
    paidAt: string | null;
    createdAt: string;
    schedule: { seq: number; amountCents: number; dueAt: string | null; status: string; paidAt: string | null }[];
  };
  links: { thanks: string; book: string; intake: string; portal: string; calendly: string | null };
  company: { name: string; ownerFirst: string; ownerFullName: string; ownerPhoto: string; ownerTitle: string; logoUrl: string; iconUrl: string };
  intakeDone: boolean;
  intake: Partial<{ phone: string; linkedin: string; knownFor: string; audience: string; access: "upload" | "self" }>;
  booking: { startAt: string | null; confirmed: boolean } | null;
  stages: OrderStageView[];
  checkoutMode: "live" | "demo" | "off";
  linkedin: string;
}

export interface PortalPayload {
  client: { id: number; publicId: string; name: string; email: string; phone: string; linkedin: string; createdAt: string } | null;
  company: PublicCompany & { ownerFirst: string; ownerFullName: string; ownerPhoto: string; ownerTitle: string; ownerEmail: string };
  stages: OrderStageView[];
  progress: { done: number; total: number; pct: number };
  files: { id: number; name: string; url: string; stageKey: string; createdAt: string }[];
  orders: { publicId: string; offerName: string; status: string; amountCents: number; plan: string; installments: number; paidAt: string | null; createdAt: string; schedule: { seq: number; amountCents: number; dueAt: string | null; status: string; paidAt: string | null }[] }[];
  booking: { startAt: string | null; confirmed: boolean } | null;
  intake: { completedAt: string | null; data: Record<string, unknown> };
  links: { book: string; intake: string; calendly: string | null } | null;
  calendlyUrl: string | null;
  currentOrder: string | null;
}
