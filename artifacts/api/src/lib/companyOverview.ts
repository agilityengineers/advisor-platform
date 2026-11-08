import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, companiesTable, companyBrandingTable, customDomainsTable, companyIntegrationsTable, usersTable, type Company } from "@workspace/db";
import { FEATURE_REGISTRY, type IntegrationProvider, type IntegrationStatus } from "@workspace/shared";
import { companyFeatureDetail, getPlans } from "./features";
import { companyBaseUrl } from "./urls";
import { env } from "../env";

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

export async function listCompanyRows(): Promise<CompanyRow[]> {
  const [companies, plans, brandings, domains, integrations, staff] = await Promise.all([
    db.select().from(companiesTable).orderBy(companiesTable.createdAt),
    getPlans(),
    db.select().from(companyBrandingTable),
    db.select().from(customDomainsTable),
    db.select().from(companyIntegrationsTable),
    db.select({ companyId: usersTable.companyId }).from(usersTable).where(and(ne(usersTable.role, "client"), isNull(usersTable.deactivatedAt))),
  ]);
  void brandings;
  const teamCounts = new Map<number, number>();
  for (const s of staff) if (s.companyId) teamCounts.set(s.companyId, (teamCounts.get(s.companyId) ?? 0) + 1);
  const rows: CompanyRow[] = [];
  for (const c of companies) {
    const plan = plans.find((p) => p.key === c.plan);
    const features = await companyFeatureDetail(c);
    const domain = domains.find((d) => d.companyId === c.id) ?? null;
    const ints = Object.fromEntries(["sendgrid", "twilio", "stripe", "calendly"].map((p) => [p, integrations.find((i) => i.companyId === c.id && i.provider === p)?.status ?? "not_connected"])) as Record<IntegrationProvider, IntegrationStatus>;
    rows.push({
      id: c.id,
      name: c.name,
      slug: c.slug,
      subdomain: `${c.slug}.${env.platformSubdomainBase}`,
      ownerName: c.ownerName,
      ownerEmail: c.ownerEmail,
      plan: c.plan,
      planName: plan?.name ?? c.plan,
      planPrice: plan?.price ?? null,
      status: c.status,
      trialEndsAt: c.trialEndsAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      domain: domain
        ? { label: domain.domain, custom: domain.domain, verified: domain.verified, active: domain.active, sslStatus: domain.sslStatus, provider: domain.provider }
        : { label: `${c.slug}.${env.platformSubdomainBase}`, custom: null, verified: false, active: false, sslStatus: null, provider: null },
      integrations: ints,
      featureCount: Object.values(features).filter((f) => f.enabled).length,
      featureTotal: FEATURE_REGISTRY.length,
      teamCount: teamCounts.get(c.id) ?? 0,
    });
  }
  return rows;
}

export async function companyDetail(company: Company) {
  const [branding] = await db.select().from(companyBrandingTable).where(eq(companyBrandingTable.companyId, company.id)).limit(1);
  const [domain] = await db.select().from(customDomainsTable).where(eq(customDomainsTable.companyId, company.id)).limit(1);
  const integrations = await db.select().from(companyIntegrationsTable).where(eq(companyIntegrationsTable.companyId, company.id));
  const team = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, perms: usersTable.perms, hasPassword: usersTable.passwordHash, deactivatedAt: usersTable.deactivatedAt, lastLoginAt: usersTable.lastLoginAt })
    .from(usersTable)
    .where(and(eq(usersTable.companyId, company.id), inArray(usersTable.role, ["admin", "manager", "advisor"])))
    .orderBy(usersTable.createdAt);
  const plans = await getPlans();
  const plan = plans.find((p) => p.key === company.plan) ?? null;
  const features = await companyFeatureDetail(company);
  return {
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      subdomain: `${company.slug}.${env.platformSubdomainBase}`,
      ownerName: company.ownerName,
      ownerEmail: company.ownerEmail,
      plan: company.plan,
      planName: plan?.name ?? company.plan,
      status: company.status,
      trialEndsAt: company.trialEndsAt?.toISOString() ?? null,
      overrides: company.overrides,
      createdAt: company.createdAt.toISOString(),
      suspendedAt: company.suspendedAt?.toISOString() ?? null,
    },
    branding: branding ?? null,
    domain: domain ? { domain: domain.domain, verified: domain.verified, active: domain.active, sslStatus: domain.sslStatus, provider: domain.provider, verifiedAt: domain.verifiedAt?.toISOString() ?? null } : null,
    integrations: Object.fromEntries(integrations.map((i) => [i.provider, { status: i.status, config: i.config, connectedAt: i.connectedAt?.toISOString() ?? null }])),
    team: team.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role, perms: m.perms, hasPassword: Boolean(m.hasPassword), active: !m.deactivatedAt, lastLoginAt: m.lastLoginAt?.toISOString() ?? null })),
    features,
    plan: plan ? { key: plan.key, name: plan.name, price: plan.price, featureKeys: plan.featureKeys } : null,
    publicUrl: await companyBaseUrl(company),
  };
}
