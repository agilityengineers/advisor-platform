import { and, eq } from "drizzle-orm";
import { db, customDomainsTable, type Company } from "@workspace/db";
import { env } from "../env";

export function platformBaseUrl(): string {
  return env.appUrl;
}

/**
 * Where a company's public pages live: its active custom domain, else its
 * platform subdomain, else the /t/:slug path on the platform host (dev).
 */
export async function companyBaseUrl(company: Pick<Company, "id" | "slug">): Promise<string> {
  const [domain] = await db
    .select({ domain: customDomainsTable.domain })
    .from(customDomainsTable)
    .where(and(eq(customDomainsTable.companyId, company.id), eq(customDomainsTable.active, true), eq(customDomainsTable.verified, true)))
    .limit(1);
  if (domain) return `https://${domain.domain}`;
  if (env.isProduction) return `https://${company.slug}.${env.platformSubdomainBase}`;
  return `${env.appUrl}/t/${company.slug}`;
}
