/**
 * Platform model — ported from design_handoff/platform.js.
 *
 * Feature registry → plans unlock feature keys → super-admin overrides per
 * company win. The registry is code (Tax-Strategies pattern); plans live in
 * the `plans` table and are seeded from DEFAULT_PLANS.
 */

export const PLATFORM = {
  name: "Advisor Platform",
  shortName: "AP",
  domains: [
    "advisor-platform.com",
    "advisor-platform.findabusinesspro.com",
    "advisor-platform.authority-desk.com",
  ],
  primaryDomain: "advisor-platform.findabusinesspro.com",
  superAdmin: {
    name: "Clarence Williams",
    email: "emailme@clarencewilliams.com",
    username: "clarencewilliams",
  },
} as const;

export const FEATURE_CATEGORIES = ["core", "professional", "advanced", "enterprise"] as const;
export type FeatureCategory = (typeof FEATURE_CATEGORIES)[number];

export interface FeatureDefinition {
  key: FeatureKey;
  label: string;
  desc: string;
  category: FeatureCategory;
}

export const FEATURE_KEYS = [
  "website_cms",
  "pipeline_board",
  "reviews",
  "client_portal",
  "calendly",
  "sendgrid",
  "hero_video",
  "stripe_checkout",
  "twilio_sms",
  "team_management",
  "white_label",
  "authority_desk",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_REGISTRY: readonly FeatureDefinition[] = [
  { key: "website_cms", label: "Website CMS", desc: "Edit and publish landing-page content", category: "core" },
  { key: "pipeline_board", label: "Pipeline board", desc: "Kanban lead-to-close flow with custom stages", category: "core" },
  { key: "reviews", label: "Reviews manager", desc: "Add, hide, and order client testimonials", category: "core" },
  { key: "client_portal", label: "Client portal", desc: "Client-facing status, files, and payments", category: "core" },
  { key: "calendly", label: "Calendly booking", desc: "Embedded booking with prefill and webhooks", category: "professional" },
  { key: "sendgrid", label: "SendGrid email", desc: "Company-owned sending domain and templates", category: "professional" },
  { key: "hero_video", label: "Hero video", desc: "Video beside the landing-page headline", category: "professional" },
  { key: "stripe_checkout", label: "Stripe checkout", desc: "On-brand checkout, payment plans, order bumps", category: "professional" },
  { key: "twilio_sms", label: "Twilio SMS", desc: "Client reminders, new-lead alerts, company number", category: "advanced" },
  { key: "team_management", label: "Team management", desc: "Invite managers and advisors with granular permissions", category: "advanced" },
  { key: "white_label", label: "White label", desc: "Own logo, colors, and custom domain", category: "enterprise" },
  { key: "authority_desk", label: "Authority Desk handoff", desc: "Sibling-brand journey card and Blueprint handoff", category: "enterprise" },
];

export function isFeatureKey(key: string): key is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(key);
}

export function featureLabel(key: string): string {
  return FEATURE_REGISTRY.find((f) => f.key === key)?.label ?? key;
}

export const PLAN_KEYS = ["starter", "professional", "white_label", "enterprise"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface PlanDefinition {
  key: PlanKey;
  name: string;
  /** Monthly price in whole dollars; null = custom / contact. */
  price: number | null;
  desc: string;
  featureKeys: FeatureKey[];
  sort: number;
}

const STARTER_FEATURES: FeatureKey[] = ["website_cms", "pipeline_board", "reviews", "client_portal", "calendly"];
const PROFESSIONAL_FEATURES: FeatureKey[] = [...STARTER_FEATURES, "sendgrid", "hero_video", "stripe_checkout"];
const WHITE_LABEL_FEATURES: FeatureKey[] = [...PROFESSIONAL_FEATURES, "twilio_sms", "team_management", "white_label"];

export const DEFAULT_PLANS: readonly PlanDefinition[] = [
  { key: "starter", name: "Starter", price: 99, desc: "One professional, core console", featureKeys: STARTER_FEATURES, sort: 1 },
  { key: "professional", name: "Professional", price: 249, desc: "Email, video, and checkout", featureKeys: PROFESSIONAL_FEATURES, sort: 2 },
  { key: "white_label", name: "White Label", price: 599, desc: "Your brand, your domain, your team", featureKeys: WHITE_LABEL_FEATURES, sort: 3 },
  { key: "enterprise", name: "Enterprise", price: null, desc: "Everything, plus partner handoffs", featureKeys: [...FEATURE_KEYS], sort: 4 },
];

export function isPlanKey(key: string): key is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(key);
}

/** `{ featureKey: true | false }` forced on/off by the super admin regardless of plan. */
export type FeatureOverrides = Partial<Record<FeatureKey, boolean>>;

export type FeatureMap = Record<FeatureKey, boolean>;

export type FeatureSource = "plan" | "override_on" | "override_off";

/**
 * Effective features = plan keys, then super-admin overrides win.
 * Mirrors `PLATFORM_features` in platform.js exactly.
 */
export function effectiveFeatures(planFeatureKeys: readonly string[], overrides: FeatureOverrides | null | undefined): FeatureMap {
  const out = {} as FeatureMap;
  for (const f of FEATURE_REGISTRY) {
    const o = overrides?.[f.key];
    out[f.key] = o === true ? true : o === false ? false : planFeatureKeys.includes(f.key);
  }
  return out;
}

export function featureSources(planFeatureKeys: readonly string[], overrides: FeatureOverrides | null | undefined): Record<FeatureKey, { enabled: boolean; source: FeatureSource; inPlan: boolean }> {
  const out = {} as Record<FeatureKey, { enabled: boolean; source: FeatureSource; inPlan: boolean }>;
  for (const f of FEATURE_REGISTRY) {
    const o = overrides?.[f.key];
    const inPlan = planFeatureKeys.includes(f.key);
    if (o === true) out[f.key] = { enabled: true, source: "override_on", inPlan };
    else if (o === false) out[f.key] = { enabled: false, source: "override_off", inPlan };
    else out[f.key] = { enabled: inPlan, source: "plan", inPlan };
  }
  return out;
}

/** Plans (lowest first) that include a feature — used by the "Not in your plan" lock. */
export function plansWithFeature(plans: readonly { key: string; name: string; featureKeys: readonly string[]; sort: number }[], feature: string): { key: string; name: string }[] {
  return [...plans]
    .sort((a, b) => a.sort - b.sort)
    .filter((p) => p.featureKeys.includes(feature))
    .map((p) => ({ key: p.key, name: p.name }));
}

// ---------------------------------------------------------------------------
// Roles & permissions
// ---------------------------------------------------------------------------

export const ROLES = ["super_admin", "admin", "manager", "advisor", "client"] as const;
export type Role = (typeof ROLES)[number];

/** Roles that sign in through the staff door and may open a company console. */
export const STAFF_ROLES: readonly Role[] = ["super_admin", "admin", "manager", "advisor"];
/** Roles that may change company settings (branding, domain, integrations, team). */
export const OWNER_ROLES: readonly Role[] = ["super_admin", "admin"];

export interface RoleDefinition {
  id: Role;
  name: string;
  desc: string;
}

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  { id: "super_admin", name: "Super admin", desc: "Platform owner (Clarence). Every company, every page." },
  { id: "admin", name: "Admin · Company owner", desc: "The LinkedIn professional. Owns this company's site, pipeline, integrations, and team." },
  { id: "manager", name: "Manager", desc: "Runs pipeline and team day to day. Permissions set by the Admin." },
  { id: "advisor", name: "Client advisor", desc: "Works leads and clients. No site or settings access." },
  { id: "client", name: "Client", desc: "Sees their own portal only." },
];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export const PERMISSION_AREAS = ["clients", "pipeline", "website", "reviews", "billing", "team"] as const;
export type PermissionArea = (typeof PERMISSION_AREAS)[number];

export const PERMISSION_LEVELS = ["none", "read", "write"] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export const PERMISSIONS: readonly { key: PermissionArea; label: string }[] = [
  { key: "clients", label: "Leads & clients" },
  { key: "pipeline", label: "Pipeline" },
  { key: "website", label: "Website content" },
  { key: "reviews", label: "Reviews" },
  { key: "billing", label: "Billing & payments" },
  { key: "team", label: "Team" },
];

export type Perms = Partial<Record<PermissionArea, PermissionLevel>>;

/** Default grants when a Manager / Advisor is invited without an explicit grid. */
export const DEFAULT_PERMS: Record<"manager" | "advisor", Perms> = {
  manager: { clients: "write", pipeline: "write", website: "read", reviews: "write", billing: "read", team: "read" },
  advisor: { clients: "write", pipeline: "write", website: "none", reviews: "none", billing: "none", team: "none" },
};

const LEVEL_RANK: Record<PermissionLevel, number> = { none: 0, read: 1, write: 2 };

/**
 * Whether a user may act on an area at a level. Super admins and Admins
 * implicitly have `write` everywhere; clients have nothing in the console.
 */
export function hasPermission(user: { role: string; perms?: Perms | null }, area: PermissionArea, level: Exclude<PermissionLevel, "none"> = "read"): boolean {
  if (user.role === "super_admin" || user.role === "admin") return true;
  if (user.role === "client") return false;
  const granted = user.perms?.[area] ?? "none";
  return LEVEL_RANK[granted] >= LEVEL_RANK[level];
}

export function normalizePerms(input: unknown, role: string): Perms {
  const base: Perms = role === "manager" ? { ...DEFAULT_PERMS.manager } : role === "advisor" ? { ...DEFAULT_PERMS.advisor } : {};
  if (!input || typeof input !== "object") return base;
  for (const area of PERMISSION_AREAS) {
    const v = (input as Record<string, unknown>)[area];
    if (v === "none" || v === "read" || v === "write") base[area] = v;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Company status / integrations
// ---------------------------------------------------------------------------

export const COMPANY_STATUSES = ["trial", "active", "comp", "suspended"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const INTEGRATION_PROVIDERS = ["sendgrid", "twilio", "stripe", "calendly"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const INTEGRATION_STATUSES = ["not_connected", "pending", "connected", "error"] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export const INTEGRATION_META: Record<IntegrationProvider, { label: string; required: boolean; featureKey: FeatureKey | null; desc: string }> = {
  sendgrid: { label: "SendGrid", required: true, featureKey: "sendgrid", desc: "Transactional email from your own domain" },
  twilio: { label: "Twilio", required: false, featureKey: "twilio_sms", desc: "Reminders, new-lead alerts, company number" },
  stripe: { label: "Stripe Connect", required: false, featureKey: "stripe_checkout", desc: "On-brand checkout and payment plans" },
  calendly: { label: "Calendly", required: false, featureKey: "calendly", desc: "Inline booking with prefill and webhooks" },
};

export const DNS_PROVIDERS = ["godaddy", "cloudflare", "namecheap", "squarespace", "other"] as const;
export type DnsProvider = (typeof DNS_PROVIDERS)[number];

export const DNS_PROVIDER_LABELS: Record<DnsProvider, string> = {
  godaddy: "GoDaddy",
  cloudflare: "Cloudflare",
  namecheap: "Namecheap",
  squarespace: "Squarespace",
  other: "Other",
};
