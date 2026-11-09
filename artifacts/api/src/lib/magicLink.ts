import { and, eq, isNull } from "drizzle-orm";
import { db, magicLinksTable, companiesTable, type User } from "@workspace/db";
import { newToken } from "./tokens";
import { heading, paragraph, button, escapeHtml } from "./email";
import { sendAccountMail } from "./companyMail";
import { letterheadFor } from "./letterhead";
import { companyBaseUrl, platformBaseUrl } from "./urls";
import { env } from "../env";

export const MAGIC_TTL_MS = 15 * 60 * 1000;

/** Mint a one-time portal sign-in link for a client and email it. Earlier unused links are retired. */
export async function issueMagicLink(user: User, requestedIp: string | null): Promise<{ url: string; sent: boolean; devLink?: string }> {
  await db.update(magicLinksTable).set({ usedAt: new Date() }).where(and(eq(magicLinksTable.userId, user.id), isNull(magicLinksTable.usedAt)));
  const { token, hash } = newToken();
  await db.insert(magicLinksTable).values({ userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + MAGIC_TTL_MS), requestedIp });
  let base = platformBaseUrl();
  if (user.companyId) {
    const [c] = await db.select().from(companiesTable).where(eq(companiesTable.id, user.companyId)).limit(1);
    if (c) base = await companyBaseUrl(c);
  }
  const url = `${base}/client/verify?token=${token}`;
  const lh = await letterheadFor(user.companyId);
  const r = await sendAccountMail(user.companyId, {
    to: user.email,
    subject: `Your ${lh.name} sign-in link`,
    template: "magic_link",
    actionUrl: url,
    body: heading("Sign in to your portal") + paragraph(`Hi ${escapeHtml(user.name)}, tap the button to open your client portal. The link works once and expires in 15 minutes.`) + button(url, "Open my portal", lh.primaryColor),
  });
  return { url, sent: r.success, ...(!env.isProduction && !env.sendgridApiKey ? { devLink: url } : {}) };
}
