import dns from "node:dns";
import { randomBytes } from "node:crypto";
import { and, eq, gt, lte, or, isNull } from "drizzle-orm";
import { db, customDomainsTable } from "@workspace/db";
import { env } from "../env";
import { logger } from "./logger";
import { invalidateTenantCache } from "./tenant";

export const VERIFY_HOST_PREFIX = "_advisor-verify";

export function newVerificationToken(): string {
  return `advisor-verify-${randomBytes(16).toString("hex")}`;
}

export interface DnsInstructions {
  txt: { host: string; value: string };
  cname: { host: string; value: string };
  apex: { host: string; note: string };
}

export function dnsInstructions(domain: string, slug: string, token: string): DnsInstructions {
  return {
    txt: { host: `${VERIFY_HOST_PREFIX}.${domain}`, value: token },
    cname: { host: `www.${domain}`, value: `${slug}.${env.platformSubdomainBase}` },
    apex: { host: domain, note: "Point the apex at the Replit deployment (A/ALIAS record from the deployment's custom-domain panel)." },
  };
}

export type DnsCheck = { verified: true; found: string[] } | { verified: false; found: string[]; transient: boolean };

export async function checkTxtRecord(domain: string, token: string): Promise<DnsCheck> {
  const hosts = [`${VERIFY_HOST_PREFIX}.${domain}`, domain];
  const found: string[] = [];
  let transient = false;
  for (const host of hosts) {
    try {
      const records = await dns.promises.resolveTxt(host);
      for (const record of records) {
        const joined = record.join("");
        found.push(joined);
        if (joined === token) return { verified: true, found };
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENODATA" && code !== "ENOTFOUND") transient = true;
    }
  }
  return { verified: false, found, transient };
}

/** Re-check pending domains every 10 minutes for 48h after they were added. */
const RECHECK_INTERVAL_MS = 10 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

export async function recheckPendingDomains(): Promise<void> {
  const now = new Date();
  const pending = await db
    .select()
    .from(customDomainsTable)
    .where(and(eq(customDomainsTable.verified, false), or(isNull(customDomainsTable.recheckUntil), gt(customDomainsTable.recheckUntil, now)), or(isNull(customDomainsTable.lastCheckedAt), lte(customDomainsTable.lastCheckedAt, new Date(now.getTime() - RECHECK_INTERVAL_MS + 1000)))));
  for (const d of pending) {
    const result = await checkTxtRecord(d.domain, d.verificationToken);
    if (result.verified) {
      await db.update(customDomainsTable).set({ verified: true, verifiedAt: now, active: true, sslStatus: "provisioning", lastCheckedAt: now, lastError: null, updatedAt: now }).where(eq(customDomainsTable.id, d.id));
      invalidateTenantCache({ domain: d.domain });
      logger.info({ domain: d.domain }, "Custom domain verified by scheduler");
    } else {
      await db.update(customDomainsTable).set({ lastCheckedAt: now, lastError: result.transient ? "DNS lookup temporarily unavailable" : "TXT record not found yet", updatedAt: now }).where(eq(customDomainsTable.id, d.id));
    }
  }
}

export function startDomainRecheckScheduler(): void {
  if (timer || env.isTest) return;
  timer = setInterval(() => {
    recheckPendingDomains().catch((err) => logger.error({ err }, "Domain recheck failed"));
  }, RECHECK_INTERVAL_MS);
  timer.unref();
}
