import type { IntegrationProvider } from "./platform";

export interface IntegrationFieldDef {
  key: string;
  label: string;
  type: "text" | "password" | "email" | "tel" | "url";
  placeholder?: string;
  /** Secrets are encrypted at rest and never returned; the UI shows last-4 only. */
  secret?: boolean;
  required?: boolean;
  /** One line under the input explaining what the field is for. */
  hint?: string;
}

export interface IntegrationToggleDef {
  key: string;
  label: string;
}

export interface IntegrationDef {
  provider: IntegrationProvider;
  abbr: string;
  name: string;
  purpose: string;
  fields: IntegrationFieldDef[];
  toggles: IntegrationToggleDef[];
  connectLabel: string;
  note: string;
}

/** CRM Dashboard → Company settings → Integrations. Field keys are the `config` / `company_secrets` names. */
export const INTEGRATION_DEFS: readonly IntegrationDef[] = [
  {
    provider: "sendgrid", abbr: "SG", name: "SendGrid", purpose: "Personal mail from you, account mail from no-reply@ — all from your domain",
    fields: [
      { key: "apiKey", label: "API key", type: "password", placeholder: "SG.xxxxxxxx", secret: true, required: true },
      { key: "fromName", label: "Personal sender name", type: "text", placeholder: "Brian Traichel", required: true, hint: "The owner or admin your clients know." },
      { key: "fromAddress", label: "Personal sender address", type: "email", placeholder: "you@yourcompany.com", required: true, hint: "Welcome notes, outreach, grades and progress updates. Replies come to this inbox." },
      { key: "noReplyName", label: "No-reply sender name", type: "text", placeholder: "Your Company", hint: "Defaults to your company name." },
      { key: "noReplyAddress", label: "No-reply address", type: "email", placeholder: "no-reply@yourcompany.com", hint: "Password resets, sign-in links, team invites, receipts and alerts. Defaults to no-reply@ on your personal address's domain." },
      { key: "sendingDomain", label: "Sending domain", type: "text", placeholder: "mail.yourcompany.com" },
      { key: "eventWebhookPublicKey", label: "Event Webhook verification key (SendGrid → Mail Settings → Event Webhook → Signed)", type: "text", placeholder: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE…" },
    ],
    toggles: [],
    connectLabel: "Save & verify domain",
    note: "Required — every company sends from its own SendGrid.",
  },
  {
    provider: "twilio", abbr: "TW", name: "Twilio", purpose: "SMS reminders to clients and new-lead alerts to you",
    fields: [
      { key: "accountSid", label: "Account SID", type: "text", placeholder: "ACxxxxxxxx", required: true },
      { key: "authToken", label: "Auth token", type: "password", secret: true, required: true },
      { key: "number", label: "Company number", type: "tel", placeholder: "+1 (555) 000-0000" },
      { key: "alertTo", label: "Send lead alerts to", type: "tel" },
    ],
    toggles: [
      { key: "reminders", label: "Text clients interview and intake reminders" },
      { key: "leadAlerts", label: "Text me when a new lead arrives" },
    ],
    connectLabel: "Connect Twilio",
    note: "A dedicated number is provisioned per company.",
  },
  {
    provider: "stripe", abbr: "ST", name: "Stripe", purpose: "Checkout, payment plans, and receipts",
    fields: [
      { key: "accountId", label: "Connected account", type: "text", placeholder: "acct_…", required: true },
      { key: "mode", label: "Mode (test / live)", type: "text", placeholder: "test" },
    ],
    toggles: [],
    connectLabel: "Connect with Stripe",
    note: "Stripe Connect — payouts go to your account.",
  },
  {
    provider: "calendly", abbr: "CA", name: "Calendly", purpose: "Interview and discovery-call booking",
    fields: [
      { key: "url", label: "Event type URL", type: "url", placeholder: "https://calendly.com/you/intro-call", required: true },
      { key: "token", label: "Personal access token (webhooks)", type: "password", secret: true },
    ],
    toggles: [],
    connectLabel: "Connect Calendly",
    note: "invitee.created updates the pipeline and portal.",
  },
];

export function integrationDef(provider: string): IntegrationDef | undefined {
  return INTEGRATION_DEFS.find((d) => d.provider === provider);
}

/** Provider-specific DNS steps shown beside the generated records. */
export const DNS_PROVIDER_STEPS: Record<string, string> = {
  godaddy: "GoDaddy → My Products → DNS → Add record. Paste each row above. Propagation 5–30 min.",
  cloudflare: "Cloudflare → DNS → Records → Add. Set the CNAME to DNS only (grey cloud) so our SSL can issue; you can turn the proxy on after verification.",
  namecheap: "Namecheap → Domain List → Manage → Advanced DNS → Add new record.",
  squarespace: "Squarespace Domains → DNS settings → Custom records → Add record.",
  other: "Add the records at your DNS host, then click Verify. We check every 10 minutes for 48 hours.",
};
