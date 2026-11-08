import type { FeatureKey, FeatureSource, IntegrationProvider, IntegrationStatus, Perms, PlatformContent } from "@workspace/shared";

export interface CompanyRow {
  id: number;
  name: string;
  slug: string;
  subdomain: string;
  ownerName: string;
  ownerEmail: string;
  plan: string;
  planName: string;
  planPrice: number | null;
  status: string;
  trialEndsAt: string | null;
  createdAt: string;
  domain: { label: string; custom: string | null; verified: boolean; active: boolean; sslStatus: string | null; provider: string | null };
  integrations: Record<IntegrationProvider, IntegrationStatus>;
  featureCount: number;
  featureTotal: number;
  teamCount: number;
}

export interface PlanSummary {
  key: string;
  name: string;
  price: number | null;
  desc: string;
  featureKeys: string[];
  sort: number;
}

export interface Overview {
  kpis: { total: number; active: number; trial: number; comp: number; suspended: number; mrr: number };
  companies: CompanyRow[];
  plans: PlanSummary[];
  counts: { companies: number; templates: number; features: number; plans: number; newRequests: number };
  platform: { name: string; domains: string[]; primaryDomain: string; subdomainBase: string; superAdmin: { name: string; email: string; username: string } };
}

export interface CompanyDetail {
  company: {
    id: number;
    name: string;
    slug: string;
    subdomain: string;
    ownerName: string;
    ownerEmail: string;
    plan: string;
    planName: string;
    status: string;
    trialEndsAt: string | null;
    overrides: Partial<Record<FeatureKey, boolean>>;
    createdAt: string;
    suspendedAt: string | null;
  };
  branding: { companyName: string; tagline: string; logoUrl: string; primaryColor: string; accentColor: string } | null;
  domain: { domain: string; verified: boolean; active: boolean; sslStatus: string; provider: string; verifiedAt: string | null } | null;
  integrations: Record<string, { status: IntegrationStatus; config: Record<string, unknown>; connectedAt: string | null }>;
  team: { id: number; name: string; email: string; role: string; perms: Perms; hasPassword: boolean; active: boolean; lastLoginAt: string | null }[];
  features: Record<FeatureKey, { enabled: boolean; source: FeatureSource; inPlan: boolean }>;
  plan: { key: string; name: string; price: number | null; featureKeys: string[] } | null;
  publicUrl: string;
}

export interface TemplateRow {
  id: number;
  slug: string;
  name: string;
  source: string;
  audience: string;
  summary: string;
  sourceCompanyId: number | null;
  content: Record<string, Record<string, unknown>>;
  isDefault: boolean;
  createdAt: string;
}

export interface PlatformContentState {
  draft: { content: PlatformContent; updatedAt: string | null; exists: boolean };
  published: { content: PlatformContent; version: number; publishedAt: string | null; exists: boolean };
  defaults: PlatformContent;
}

export const INTEGRATION_ABBR: Record<IntegrationProvider, string> = { sendgrid: "SG", twilio: "TW", stripe: "ST", calendly: "CA" };
export const INTEGRATION_NAME: Record<IntegrationProvider, string> = { sendgrid: "SendGrid", twilio: "Twilio", stripe: "Stripe", calendly: "Calendly" };
export const INTEGRATION_STYLE: Record<IntegrationStatus, { bg: string; fg: string; label: string }> = {
  connected: { bg: "#EDF7F1", fg: "#1E7A4C", label: "Connected" },
  pending: { bg: "#FFF8F0", fg: "#8A6320", label: "Pending verification" },
  not_connected: { bg: "#F1F4F8", fg: "#9AAABF", label: "Not connected" },
  error: { bg: "#FDECE9", fg: "#C2361F", label: "Needs attention" },
};
export const STATUS_TONE: Record<string, "green" | "amber" | "blue" | "grey"> = { active: "green", trial: "amber", comp: "blue", suspended: "grey" };

export const money = (n: number) => `$${n.toLocaleString("en-US")}`;
