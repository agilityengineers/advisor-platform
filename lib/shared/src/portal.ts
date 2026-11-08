/**
 * The client portal tracker — seven stages per client, from Buying Flow.dc.html.
 * Seeded when an order is paid; staff advance them from the console.
 */
export const PORTAL_STAGE_KEYS = ["payment", "intake", "interview", "blueprint", "draft", "revisions", "published"] as const;
export type PortalStageKey = (typeof PORTAL_STAGE_KEYS)[number];

export interface PortalStageDef {
  key: PortalStageKey;
  label: string;
  /** Default meta line shown while the stage is pending. */
  meta: string;
}

export const PORTAL_STAGES: readonly PortalStageDef[] = [
  { key: "payment", label: "Payment received", meta: "Stripe" },
  { key: "intake", label: "Intake complete", meta: "3 minutes · tells {ownerFirst} what to focus on" },
  { key: "interview", label: "Brand Voice Interview", meta: "90 min · pick a time" },
  { key: "blueprint", label: "Brand Voice Blueprint delivered", meta: "Within 5 business days of the interview" },
  { key: "draft", label: "Profile draft v1", meta: "All 22 sections · you review" },
  { key: "revisions", label: "Revisions", meta: "Up to 2 rounds" },
  { key: "published", label: "Published + 30-day check-in", meta: "15-min screen-share upload" },
];

export const INTAKE_ACCESS = ["upload", "self"] as const;
export type IntakeAccess = (typeof INTAKE_ACCESS)[number];

export interface IntakeData {
  phone: string;
  linkedin: string;
  knownFor: string;
  audience: string;
  access: IntakeAccess;
}

export type ClientStageStatus = "pending" | "current" | "done" | "scheduled";

export const ORDER_STATUSES = ["pending", "paid", "refunded", "canceled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const INSTALLMENT_STATUSES = ["scheduled", "paid", "failed", "canceled"] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];
