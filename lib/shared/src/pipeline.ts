export type StageKind = "open" | "won" | "lost";

/** Stage colour palette from CRM Dashboard.dc.html; `pipeline_stages.color` stores the key. */
export const STAGE_COLORS = {
  blue: { dot: "#1668F0", bg: "#EAF2FD", fg: "#0B4FD0" },
  green: { dot: "#2FBF71", bg: "#EDF7F1", fg: "#1E7A4C" },
  amber: { dot: "#E39A2B", bg: "#FFF8F0", fg: "#8A6320" },
  violet: { dot: "#7C5CFF", bg: "#F1EDFF", fg: "#4F2FD6" },
  teal: { dot: "#14A3A3", bg: "#E8F7F7", fg: "#0D7272" },
  navy: { dot: "#0A1626", bg: "#0A1626", fg: "#FFFFFF" },
  grey: { dot: "#9AAABF", bg: "#F1F4F8", fg: "#6A809A" },
} as const;
export type StageColorKey = keyof typeof STAGE_COLORS;
export const STAGE_PALETTE: readonly StageColorKey[] = ["blue", "green", "amber", "violet", "teal"];

export function stageColor(key: string | null | undefined): { dot: string; bg: string; fg: string } {
  if (key && key in STAGE_COLORS) return STAGE_COLORS[key as StageColorKey];
  if (key && /^#[0-9a-fA-F]{6}$/.test(key)) return { dot: key, bg: "#EAF2FD", fg: "#0B4FD0" };
  return STAGE_COLORS.blue;
}

export interface StageDefinition {
  name: string;
  kind: StageKind;
  color: StageColorKey;
}

/** Default pipeline for a new company (from the prototype). The first `open` stage receives new leads. */
export const DEFAULT_STAGES: readonly StageDefinition[] = [
  { name: "New", kind: "open", color: "blue" },
  { name: "Contacted", kind: "open", color: "green" },
  { name: "Audit sent", kind: "open", color: "amber" },
  { name: "Call booked", kind: "open", color: "violet" },
  { name: "Pricing shared", kind: "open", color: "teal" },
  { name: "Client", kind: "won", color: "navy" },
  { name: "Not a fit", kind: "lost", color: "grey" },
];

export const LEAD_CATEGORIES = ["Consultant", "Author", "Professional writer", "Executive", "Coach", "Speaker", "Other"] as const;
export type LeadCategory = (typeof LEAD_CATEGORIES)[number];

export const LEAD_SOURCES = ["landing_form", "platform_form", "grader", "checkout", "manual", "import", "test"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const ACTIVITY_TYPES = ["form_submitted", "created", "stage_changed", "note", "email_sent", "sms_sent", "sms_received", "booking", "grade", "order", "system"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
