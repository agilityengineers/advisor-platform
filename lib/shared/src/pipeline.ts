export type StageKind = "open" | "won" | "lost";

export interface StageDefinition {
  key: string;
  name: string;
  kind: StageKind;
  color: string;
}

/** Default pipeline for a new company. The first `open` stage receives new leads. */
export const DEFAULT_STAGES: readonly StageDefinition[] = [
  { key: "new", name: "New lead", kind: "open", color: "#1668F0" },
  { key: "graded", name: "Graded", kind: "open", color: "#7C5CFF" },
  { key: "call", name: "Call booked", kind: "open", color: "#E39A2B" },
  { key: "proposal", name: "Proposal sent", kind: "open", color: "#F26B3A" },
  { key: "won", name: "Won", kind: "won", color: "#2FBF71" },
  { key: "lost", name: "Lost", kind: "lost", color: "#8A99AD" },
];

export const LEAD_CATEGORIES = ["Consultant", "Author", "Coach", "Executive", "Speaker", "Other"] as const;
export type LeadCategory = (typeof LEAD_CATEGORIES)[number];

export const LEAD_SOURCES = ["landing_form", "platform_form", "grader", "manual", "import", "test"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
