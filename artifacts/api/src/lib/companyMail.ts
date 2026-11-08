import { eq } from "drizzle-orm";
import { db, companiesTable, type Company } from "@workspace/db";
import { senderFooter, type SenderKind } from "@workspace/shared";
import { sendEmail, renderEmail, PLATFORM_LETTERHEAD, type SendEmailParams, type SendEmailResult } from "./email";
import { companySender } from "./integrations";
import { letterheadFor } from "./letterhead";
import { env } from "../env";

type CompanyMailParams = Omit<SendEmailParams, "html" | "sender" | "from" | "companyId"> & {
  body: string;
  footer?: string;
  /**
   * `personal` (default): from the owner / admin, e.g. brian@mytargetclient.com;
   * replies reach the owner. `system`: from the company's no-reply address,
   * e.g. no-reply@mytargetclient.com, for mail nobody needs to answer.
   */
  kind?: SenderKind;
};

/**
 * Mail a company sends, always wearing the company's letterhead and name.
 *
 * - With the company's SendGrid connected it leaves from the company's own
 *   domain: the personal identity or the no-reply identity, per `kind`.
 * - Otherwise the platform key sends it with the company's name on the From
 *   line (and, for personal mail, the owner as Reply-To), so a firm halfway
 *   through setup still reaches its buyers.
 *
 * The log row records which identity and kind were used.
 */
export async function sendCompanyMail(company: Company, params: CompanyMailParams): Promise<SendEmailResult & { via: "company" | "platform" | "none" }> {
  const { kind = "personal", body, footer, ...rest } = params;
  const letterhead = await letterheadFor(company.id);
  const html = renderEmail(letterhead, body, footer ?? senderFooter(kind, letterhead.name, company.ownerName));
  // Personal mail sends replies to the owner; system mail only carries a Reply-To when the caller asks (e.g. an owner alert replying to the buyer).
  const replyTo = rest.replyTo ?? (kind === "personal" ? company.ownerEmail || undefined : undefined);
  const metadata = (via: string) => ({ ...(rest.metadata ?? {}), via, kind });
  const own = await companySender(company, kind);
  if (own) {
    const r = await sendEmail({ ...rest, html, replyTo, companyId: company.id, sender: "company", from: own, metadata: metadata("company") });
    return { ...r, via: "company" };
  }
  if (env.sendgridApiKey) {
    const r = await sendEmail({ ...rest, html, replyTo, companyId: company.id, sender: "platform", from: { email: env.platformFromEmail, name: letterhead.name, apiKey: env.sendgridApiKey }, metadata: metadata("platform_fallback") });
    return { ...r, via: "platform" };
  }
  const r = await sendEmail({ ...rest, html, companyId: company.id, sender: "company", metadata: metadata("none") });
  return { ...r, via: "none" };
}

/**
 * Account mail (password resets, sign-in links, invites) for a user who may or
 * may not belong to a company. A company user gets it from that company's
 * no-reply address and letterhead; a platform user (super admin) gets it from
 * the platform sender.
 */
export async function sendAccountMail(companyId: number | null | undefined, params: Omit<CompanyMailParams, "kind">): Promise<SendEmailResult> {
  if (companyId) {
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
    if (company) return sendCompanyMail(company, { ...params, kind: "system" });
  }
  const { body, footer, ...rest } = params;
  return sendEmail({ ...rest, companyId: null, sender: "platform", html: renderEmail(PLATFORM_LETTERHEAD, body, footer) });
}
