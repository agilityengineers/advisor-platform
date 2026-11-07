import type { FeatureKey, FeatureSource, IntegrationProvider, IntegrationStatus, Perms, Role, Rubric, RubricProblem, SectionMeta, SiteContent, SiteContentOverrides, StageKind, IntegrationDef } from "@workspace/shared";

export interface Summary {
  company: { id: number; name: string; slug: string; ownerName: string; ownerEmail: string; plan: string; status: string; trialEndsAt: string | null; createdAt: string };
  plan: { key: string; name: string; price: number | null };
  branding: { companyName: string; tagline: string; logoUrl: string; primaryColor: string; accentColor: string } | null;
  features: Record<FeatureKey, { enabled: boolean; source: FeatureSource; inPlan: boolean }>;
  integrations: Record<IntegrationProvider, IntegrationStatus>;
  domain: { domain: string; verified: boolean; active: boolean; sslStatus: string } | null;
  publicUrl: string;
  viewer: { role: Role; isSuperAdmin: boolean; perms: Perms };
  counts: { leads: number; reviewsLive: number; hasDraft: boolean };
  calendlyUrl: string | null;
}

export interface StageView {
  id: number;
  name: string;
  kind: StageKind;
  color: string;
  sort: number;
  count: number;
  dot: string;
  bg: string;
  fg: string;
}

export interface LeadView {
  id: number;
  publicId: string;
  name: string;
  email: string;
  phone: string;
  category: string;
  linkedin: string;
  goal: string;
  source: string;
  intent: string | null;
  stageId: number | null;
  stage: { id: number; name: string; kind: StageKind; color: string; dot: string; bg: string; fg: string } | null;
  ownerUserId: number | null;
  bookedAt: string | null;
  grade: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadsResponse {
  leads: LeadView[];
  stages: StageView[];
  kpis: { newThisWeek: number; inConversation: number; clients: number; total: number; lastReceivedAt: string | null };
  calendlyUrl: string | null;
}

export interface AssessmentView {
  id: number;
  publicId: string;
  linkedinUrl: string;
  status: "pending" | "fetching" | "retrying" | "scored" | "failed" | string;
  attempt: number;
  errorMessage: string | null;
  grade: string | null;
  pctTotal: number | null;
  total: number | null;
  maxTotal: number | null;
  strongest: string | null;
  biggestGap: string | null;
  rubricVersion: number | null;
  unlocked: boolean;
  unlockedAt: string | null;
  source: string | null;
  reportUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadDetail {
  lead: LeadView;
  activity: { id: number; type: string; body: string; meta: Record<string, unknown>; actorUserId: number | null; createdAt: string }[];
  booking: { id: number; startAt: string | null; status: string; eventUri: string } | null;
  assessments: AssessmentView[];
  grader: { mode: "live" | "demo" | "off"; rubricVersion: number; canRun: boolean };
  calendly: { connected: boolean; prefillUrl: string | null };
  templates: { key: string; label: string; timing: string; subject: string }[];
}

export interface SiteContentResponse {
  meta: SectionMeta[];
  defaults: SiteContent;
  live: SiteContent;
  working: SiteContent;
  draft: { content: SiteContentOverrides; updatedAt: string } | null;
  published: { content: SiteContentOverrides; version: number; publishedAt: string | null } | null;
  status: "draft" | "published" | "defaults";
  canEditVideo: boolean;
  urls: { live: string; preview: string };
}

export interface ReviewView {
  id: number;
  name: string;
  role: string;
  category: string;
  linkedin: string;
  quote: string;
  reviewedOn: string;
  visible: boolean;
  sort: number;
}

export interface RubricResponse {
  working: Rubric;
  hasDraft: boolean;
  draftUpdatedAt: string | null;
  published: { version: number; publishedAt: string | null; source: "company" | "platform" };
  nextVersion: number;
  problems: RubricProblem[];
  platformDefault: Rubric;
}

export interface IntegrationView {
  provider: IntegrationProvider;
  status: IntegrationStatus;
  config: Record<string, string | boolean>;
  secrets: Record<string, { set: boolean; last4: string }>;
  lastError: string | null;
  connectedAt: string | null;
}

export interface DomainView {
  subdomain: string;
  custom: {
    id: number;
    domain: string;
    provider: string;
    verified: boolean;
    verifiedAt: string | null;
    active: boolean;
    sslStatus: string;
    lastCheckedAt: string | null;
    lastError: string | null;
    recheckUntil: string | null;
    records: { txt: { host: string; value: string }; cname: { host: string; value: string }; apex: { host: string; note: string } };
    steps: string;
  } | null;
}

export interface SettingsResponse {
  branding: { companyName: string; tagline: string; logoUrl: string; primaryColor: string; accentColor: string };
  domain: DomainView;
  integrations: IntegrationView[];
  integrationDefs: IntegrationDef[];
  features: Record<FeatureKey, boolean>;
  dnsProviderSteps: Record<string, string>;
}

export const INT_STATUS: Record<IntegrationStatus, { bg: string; fg: string; label: string; dot: string; side: string }> = {
  connected: { bg: "#EDF7F1", fg: "#1E7A4C", label: "Connected", dot: "#2FBF71", side: "ON" },
  pending: { bg: "#FFF8F0", fg: "#8A6320", label: "Pending", dot: "#E39A2B", side: "PENDING" },
  not_connected: { bg: "#F1F4F8", fg: "#6A809A", label: "Not connected", dot: "rgba(255,255,255,0.25)", side: "OFF" },
  error: { bg: "#FDECE9", fg: "#C2361F", label: "Needs attention", dot: "#C2361F", side: "ERROR" },
};

export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
