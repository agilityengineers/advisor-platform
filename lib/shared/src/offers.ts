/**
 * The offer catalogue behind Standard Pricing, Commercial Pricing and the buying
 * flow (design_handoff/Standard Pricing.dc.html, Commercial Pricing.dc.html,
 * Buying Flow.dc.html). Prices are USD. The buying flow (Phase 5) reads the same
 * keys from `?offer=` / `?plan=`.
 */

export const OFFER_KEYS = ["audit", "blueprint", "lab", "live", "voice", "exec"] as const;
export type OfferKey = (typeof OFFER_KEYS)[number];
export type PaymentPlan = "full" | "split";

export interface Offer {
  key: OfferKey;
  name: string;
  sub: string;
  price: number;
  splittable: boolean;
  split?: { n: number; each: number };
  includes: string[];
}

export const OFFERS: Record<OfferKey, Offer> = {
  audit: { key: "audit", name: "Profile Audit", sub: "Expert review — you make the edits", price: 197, splittable: false, includes: ["30-minute call", "Recorded video walkthrough", "Top 10 fixes + two headline options", "$100 credit toward Voice-Built for 14 days"] },
  blueprint: { key: "blueprint", name: "Brand Voice Blueprint", sub: "Interview-based voice document", price: 347, splittable: false, includes: ["90-minute recorded interview", "AI-ready voice PDF", "Credited in full toward any profile tier for 30 days"] },
  lab: { key: "lab", name: "Group Profile Lab", sub: "Live group workshop seat", price: 197, splittable: false, includes: ["90-minute live session", "Edit your profile as we go", "VIP upgrade available"] },
  live: { key: "live", name: "Live Profile Session", sub: "Done with you", price: 697, splittable: false, includes: ["Brand Voice Interview first", "90-minute live rewrite on screen", "Banner copy + recording", "14-day follow-up review"] },
  voice: { key: "voice", name: "Voice-Built Profile", sub: "Done for you", price: 997, splittable: true, split: { n: 2, each: 499 }, includes: ["Brand Voice Blueprint included", "Full rewrite — headline, About, up to 5 roles, Featured, skills", "Custom banner + 2 revision rounds", "We upload it, then a 30-day check-in"] },
  exec: { key: "exec", name: "Executive Authority Profile", sub: "Done for you · white glove", price: 1997, splittable: true, split: { n: 3, each: 699 }, includes: ["Everything in Voice-Built Profile", "Two strategy sessions", "30 days of posts from your Blueprint", "Connection + follow-up scripts"] },
};

export function isOfferKey(value: unknown): value is OfferKey {
  return typeof value === "string" && (OFFER_KEYS as readonly string[]).includes(value);
}

export const money = (n: number): string => `$${n.toLocaleString("en-US")}`;

/** "$997" / "2 × $499" depending on the selected plan. */
export function offerPriceLabel(offer: Offer, plan: PaymentPlan): string {
  if (plan === "split" && offer.splittable && offer.split) return `${offer.split.n} × ${money(offer.split.each)}`;
  return money(offer.price);
}

export function offerTermLabel(offer: Offer, plan: PaymentPlan): string {
  if (plan === "split" && offer.splittable && offer.split) return offer.split.n === 2 ? "two payments" : `${offer.split.n} payments`;
  return "one time";
}

/** In-app checkout path; the buying flow owns `/buy`. */
export function checkoutPath(offer: OfferKey, plan: PaymentPlan = "full"): string {
  const params = new URLSearchParams({ offer });
  if (plan === "split") params.set("plan", "split");
  return `/buy?${params.toString()}`;
}

/** Standard Pricing — the three core tiers, in display order. */
export const STANDARD_CORE_TIERS: { key: OfferKey; kicker: string; body: string; bullets: string[]; cta: (price: string) => string; dark: boolean; recommended: boolean; bookInstead?: boolean }[] = [
  {
    key: "live",
    kicker: "DONE WITH YOU",
    body: "We rebuild the sections that matter most, live on screen, with you in the room.",
    bullets: ["Brand Voice Interview first", "90-minute live rewrite of headline, About, and current role", "Banner copy and session recording", "14-day follow-up review"],
    cta: (price) => `Book My Live Profile Session – ${price}`,
    dark: false,
    recommended: false,
  },
  {
    key: "voice",
    kicker: "DONE FOR YOU",
    body: "The full rebuild. Hand it over and get back a profile that reads like the specialist you are.",
    bullets: ["Brand Voice Blueprint included ($347 value)", "Full rewrite: headline, About, up to 5 roles, Featured, skills", "Custom banner and 2 revision rounds", "We upload it, then a 30-day check-in"],
    cta: (price) => `Build My Profile in My Voice – ${price}`,
    dark: true,
    recommended: true,
  },
  {
    key: "exec",
    kicker: "DONE FOR YOU · WHITE GLOVE",
    body: "For leaders who need the profile and the first month of visibility handled.",
    bullets: ["Everything in Voice-Built Profile", "Two strategy sessions: positioning and visibility", "All roles, Featured assets, 30 days of posts drafted from your Blueprint", "Connection and follow-up scripts"],
    cta: () => "Book an Intro Call",
    dark: false,
    recommended: false,
    bookInstead: true,
  },
];

/** Standard Pricing — entry offers. */
export const STANDARD_ENTRY_OFFERS: { key: OfferKey; sub: string; bullets: string[]; credit: string; cta: string }[] = [
  { key: "audit", sub: "Expert review — you make the edits", bullets: ["30-minute call", "Recorded video walkthrough of your profile", "Top 10 fixes in priority order, plus two headline options"], credit: "$100 credit toward a Voice-Built Profile for 14 days", cta: "Get My Profile Audit – $197" },
  { key: "blueprint", sub: "Interview-based voice document", bullets: ["90-minute recorded interview with {ownerFirst}", "AI-ready voice PDF — how you talk, what sets you apart, who you're for", "Reusable across posts, emails, and your site"], credit: "Credited in full toward any profile tier for 30 days", cta: "Book My Brand Voice Interview – $347" },
  { key: "lab", sub: "Live group workshop · VIP seat $497", bullets: ["90-minute live session; you edit your profile as we go", "VIP adds a private 30-minute session and written feedback", "Available for partner groups, associations, and peer networks"], credit: "Next lab date shared by {ownerFirst}", cta: "Save My Seat – $197" },
];

export const STANDARD_TEAM_TILES = [
  { value: "$797", label: "per profile · 5–9 people" },
  { value: "$697", label: "per profile · 10+ people" },
  { value: "+", label: "optional company page review" },
] as const;

export const STANDARD_ADDONS = [
  { title: "Banner design", sub: "Custom LinkedIn header, 3 options", price: "$150" },
  { title: "72-hour rush", sub: "Any profile tier, delivered in three days", price: "+30%" },
  { title: "Payment plans", sub: "Split on Voice-Built and Executive tiers", price: "2–3 pay" },
  { title: "Managed LinkedIn after the rewrite", sub: "Weekly activity and a standing call, scoped on request", price: "Monthly" },
] as const;

export const STANDARD_CREDITS = [
  { title: "Audit → Voice-Built Profile", body: "$100 of your $197 audit comes off the $997 build if you upgrade within 14 days." },
  { title: "Blueprint → any profile tier", body: "The full $347 is credited toward Live, Voice-Built, or Executive within 30 days. The interview is already done, so we move straight to writing." },
] as const;

/** Commercial Pricing — the services menu. */
export interface CommercialRow {
  title: string;
  /** Rendered with the emphasised word in brand colour, e.g. "Done-WITH-You Profile". */
  titleEm?: string;
  meta: string;
  body: string;
  price: string;
  priceNote?: string;
  cta: string;
  featured?: boolean;
  badge?: string;
}

export const COMMERCIAL_SECTIONS: { id: string; n: string; title: string; rows: CommercialRow[] }[] = [
  {
    id: "profile",
    n: "01",
    title: "Profile & Brand Voice",
    rows: [
      { title: "Brand Voice Blueprint", meta: "Recorded interview · AI-ready document", body: "We capture your ideal client, USP, tone, and proof points in one AI-ready document, so every post and message sounds like you, not generic AI.", price: "$347", cta: "Book it →" },
      { title: "Done-WITH-You Profile", titleEm: "WITH", meta: "1 week · 1 revision round", body: "Guided optimization: a strategy session, templates for the content you write, keyword SEO, and a 2-hour one-on-one training on best practices.", price: "$750", cta: "Book it →" },
      { title: "Done-FOR-You All-Star Profile", titleEm: "FOR", meta: "2–4 weeks · 2 revision rounds", body: "We write every section with SEO keywords and coach you in a 1.5-hour lead-gen training. Company page setup or update included ($175 value).", price: "$1,500", cta: "Book it →", featured: true, badge: "MOST CHOSEN" },
    ],
  },
  {
    id: "team",
    n: "02",
    title: "Team Workshops & Training",
    rows: [
      { title: "Team Profile-Building Workshop", meta: "2–2.5 hours · live · recorded", body: "Your team builds their profiles live from a company template with real-time coaching, for consistent branding and stronger search visibility.", price: "$650", cta: "Schedule →" },
      { title: "Advanced LinkedIn Sales Webinar", meta: "2.5 hours · up to 30 people", body: "Fast-paced training on prospecting, list building, advanced search, endorsements and referrals, and reading profiles to win appointments.", price: "$600", cta: "Schedule →" },
      { title: "4-Week LinkedIn Sales Training Program", meta: "Weekly sessions · recorded", body: "Group coaching tailored to your industry: lead generation, posting habits, groups and competitor research, with an activity plan and accountability.", price: "$1,850", priceNote: "avg. · $1,000–$2,500", cta: "Scope it →" },
    ],
  },
];

export const COMMERCIAL_PROGRAMS = [
  { title: "Company-Wide LinkedIn Program", price: "$3,650", meta: "4–6 weeks · flat fee", body: "The full build-out: one done-for-you profile as the model, a company profile template, a live team workshop, and a multi-week sales training series.", cta: "Scope the program", dark: true },
  { title: "Lead Generation Campaign", price: "Quoted monthly", meta: "Monthly · fully managed", body: "Managed outreach: Sales Navigator targeting, 100 connection requests a week, multi-step follow-up, a content calendar, and weekly strategy calls.", cta: "Request a quote", dark: false },
] as const;

export const COMMERCIAL_STATS = [
  { value: "28+", label: "years in B2B sales" },
  { value: "1,000+", label: "clients served" },
  { value: "500+", label: "client testimonials" },
] as const;
