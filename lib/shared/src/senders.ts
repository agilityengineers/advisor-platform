/**
 * White-label email senders.
 *
 * Every company sends from two identities on its own domain:
 *
 * - **personal** — the owner / admin (e.g. `Brian Traichel <brian@mytargetclient.com>`).
 *   Mail a person would write: welcome notes, outreach, grade summaries,
 *   stage updates, reminders. Replies land in the owner's inbox.
 * - **system** — a no-reply address (e.g. `My Target Client <no-reply@mytargetclient.com>`).
 *   Mail the software sends on its own: password resets, sign-in links,
 *   team invites, receipts, and alerts to the owner. Nobody reads replies.
 *
 * The no-reply address defaults to `no-reply@<domain of the personal address>`,
 * so a company that only fills in its personal address still gets a sensible
 * system sender on the same authenticated SendGrid domain.
 */

export type SenderKind = "personal" | "system";

export interface SenderIdentity {
  email: string;
  name: string;
}

export interface SenderConfig {
  fromName?: unknown;
  fromAddress?: unknown;
  noReplyName?: unknown;
  noReplyAddress?: unknown;
}

const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function isEmailAddress(v: string): boolean {
  return EMAIL_RE.test(v);
}

/** The part after `@`, lower-cased, or null for anything that isn't an address. */
export function emailDomain(address: string): string | null {
  const a = address.trim().toLowerCase();
  return isEmailAddress(a) ? a.slice(a.lastIndexOf("@") + 1) : null;
}

export function defaultNoReplyAddress(personalAddress: string): string | null {
  const domain = emailDomain(personalAddress);
  return domain ? `no-reply@${domain}` : null;
}

/** True when the two domains are the same or one is a subdomain of the other (SendGrid domain auth covers both). */
function sameSendingDomain(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/**
 * Checks the sender fields before they are saved. Returns a message for the
 * first problem, or null when the config is usable. Empty optional fields are fine.
 */
export function validateSenderConfig(cfg: SenderConfig): string | null {
  const from = str(cfg.fromAddress);
  const noReply = str(cfg.noReplyAddress);
  if (from && !isEmailAddress(from)) return "Personal sender address is not a valid email address";
  if (noReply && !isEmailAddress(noReply)) return "No-reply address is not a valid email address";
  if (from && noReply) {
    const a = emailDomain(from)!;
    const b = emailDomain(noReply)!;
    if (!sameSendingDomain(a, b)) return `No-reply address must be on the same domain as your personal address (${a}) so SendGrid can send it`;
  }
  return null;
}

/** Resolve both identities from a SendGrid config. Either may be null when the config lacks a usable address. */
export function resolveSenders(cfg: SenderConfig, company: { name: string; ownerName?: string | null }): Record<SenderKind, SenderIdentity | null> {
  const from = str(cfg.fromAddress).toLowerCase();
  const personal = isEmailAddress(from) ? { email: from, name: str(cfg.fromName) || str(company.ownerName) || company.name } : null;
  const explicit = str(cfg.noReplyAddress).toLowerCase();
  const systemEmail = isEmailAddress(explicit) ? explicit : defaultNoReplyAddress(from);
  const system = systemEmail ? { email: systemEmail, name: str(cfg.noReplyName) || company.name } : null;
  return { personal, system };
}

/** Footer line under a message, so the reader knows whether replying reaches anyone. */
export function senderFooter(kind: SenderKind, companyName: string, ownerName?: string | null): string {
  return kind === "personal"
    ? `Sent by ${companyName}. Reply to this email to reach ${ownerName || "the team"} directly.`
    : `This is an automated message from ${companyName}. Replies to this address are not monitored.`;
}
