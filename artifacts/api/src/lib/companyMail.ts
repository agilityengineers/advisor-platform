import type { Company } from "@workspace/db";
import { sendEmail, renderEmail, type SendEmailParams, type SendEmailResult } from "./email";
import { companySender } from "./integrations";
import { letterheadFor } from "./letterhead";
import { env } from "../env";

/**
 * Mail a company sends to its own leads and clients. The company's SendGrid
 * identity when it is connected; otherwise the platform key sends it with the
 * company's name on the From line and the owner's address as Reply-To, so a
 * firm halfway through setup still reaches its buyers. The log row records
 * which identity was used.
 */
export async function sendCompanyMail(company: Company, params: Omit<SendEmailParams, "html" | "sender" | "from" | "companyId"> & { body: string; footer?: string }): Promise<SendEmailResult & { via: "company" | "platform" | "none" }> {
  const letterhead = await letterheadFor(company.id);
  const html = renderEmail(letterhead, params.body, params.footer ?? `Sent by ${letterhead.name}. Reply to this email to reach ${company.ownerName || "the team"} directly.`);
  const own = await companySender(company);
  if (own) {
    const r = await sendEmail({ ...params, html, companyId: company.id, sender: "company", from: own, replyTo: params.replyTo ?? company.ownerEmail ?? undefined, metadata: { ...(params.metadata ?? {}), via: "company" } });
    return { ...r, via: "company" };
  }
  if (env.sendgridApiKey) {
    const r = await sendEmail({ ...params, html, companyId: company.id, sender: "platform", from: { email: env.platformFromEmail, name: letterhead.name, apiKey: env.sendgridApiKey }, replyTo: params.replyTo ?? company.ownerEmail ?? undefined, metadata: { ...(params.metadata ?? {}), via: "platform_fallback" } });
    return { ...r, via: "platform" };
  }
  const r = await sendEmail({ ...params, html, companyId: company.id, sender: "company", metadata: { ...(params.metadata ?? {}), via: "none" } });
  return { ...r, via: "none" };
}
