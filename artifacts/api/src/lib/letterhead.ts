import { eq } from "drizzle-orm";
import { db, companyBrandingTable, companiesTable } from "@workspace/db";
import { PLATFORM_LETTERHEAD, type Letterhead } from "./email";

/** The company's letterhead for mail it sends, or the platform's when there is no company. */
export async function letterheadFor(companyId: number | null | undefined): Promise<Letterhead> {
  if (!companyId) return PLATFORM_LETTERHEAD;
  const [company] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  const [branding] = await db.select().from(companyBrandingTable).where(eq(companyBrandingTable.companyId, companyId)).limit(1);
  return {
    name: branding?.companyName || company?.name || PLATFORM_LETTERHEAD.name,
    primaryColor: branding?.primaryColor || "#1668F0",
    logoUrl: branding?.logoUrl || null,
  };
}
