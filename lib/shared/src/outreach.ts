/**
 * Built-in SendGrid follow-up templates (CRM Dashboard → Outreach templates).
 * Tokens: {firstName} {name} {company} {owner} {ownerFirst} {note}
 */
export interface OutreachTemplate {
  key: string;
  label: string;
  timing: string;
  subject: string;
  body: string;
}

export const OUTREACH_TEMPLATES: readonly OutreachTemplate[] = [
  {
    key: "received",
    label: "Audit request received",
    timing: "AUTO · 0h",
    subject: "Got your profile audit request, {firstName}",
    body: "Hi {firstName},\n\nThanks for sending your LinkedIn profile over. I'm reading it against the 22-section framework now and will come back with where the biggest gains are.\n\n{note}\n\n— {ownerFirst}\n{company}",
  },
  {
    key: "ready",
    label: "Your 22-section read is ready",
    timing: "MANUAL",
    subject: "{firstName}, your 22-section profile read is ready",
    body: "Hi {firstName},\n\nYour profile read is ready. I've flagged the sections that are costing you the most visibility and the quick wins you can fix this week.\n\n{note}\n\nWant to walk through it together? Reply to this email or grab a time on my calendar.\n\n— {ownerFirst}\n{company}",
  },
  {
    key: "blueprint",
    label: "Book the Brand Voice interview",
    timing: "DRAFT",
    subject: "Let's capture your Brand Voice, {firstName}",
    body: "Hi {firstName},\n\nThe next step is a one-hour Brand Voice interview. One conversation captures how you actually talk, what makes you different, and who you're for — and it becomes the reference every section of your profile is written from.\n\n{note}\n\n— {ownerFirst}\n{company}",
  },
];

export function fillOutreach(text: string, vars: { name: string; company: string; owner: string; note?: string }): string {
  const firstName = vars.name.split(/\s+/)[0] || "there";
  const ownerFirst = vars.owner.split(/\s+/)[0] || vars.owner;
  return text
    .replace(/\{firstName\}/g, firstName)
    .replace(/\{name\}/g, vars.name)
    .replace(/\{company\}/g, vars.company)
    .replace(/\{ownerFirst\}/g, ownerFirst)
    .replace(/\{owner\}/g, vars.owner)
    .replace(/\{note\}/g, (vars.note ?? "").trim())
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
