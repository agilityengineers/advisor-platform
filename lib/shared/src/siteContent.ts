/**
 * Landing-page content model — ported from design_handoff/site-content.js.
 *
 * `SITE_CONTENT_DEFAULTS` is the My Target Client page. Each company stores
 * overrides in `site_content.content` (draft and published rows); the public
 * page renders `mergeContent(defaults, overrides)`.
 */

export type HeroMedia = { kind: "audit_card" } | { kind: "video"; url: string };

export interface SiteContent {
  brand: {
    companyName: string;
    legalLine: string;
    logoUrl: string;
    footerLogoUrl: string;
    ownerName: string;
    ownerPhoto: string;
  };
  visibility: {
    journey: boolean;
    cost: boolean;
    guide: boolean;
    plan: boolean;
    process: boolean;
    testimonials: boolean;
  };
  hero: {
    eyebrow: string;
    headline: string;
    subhead: string;
    primaryCta: string;
    secondaryCta: string;
    stat1Value: string;
    stat1Label: string;
    stat2Value: string;
    stat2Label: string;
    stat3Value: string;
    stat3Label: string;
  };
  heroMedia: HeroMedia;
  journey: { eyebrow: string; headline: string; intro: string };
  cost: {
    eyebrow: string;
    headline: string;
    intro: string;
    card1Title: string;
    card1Body: string;
    card2Title: string;
    card2Body: string;
    card3Title: string;
    card3Body: string;
    card4Title: string;
    card4Body: string;
    banner: string;
  };
  guide: {
    eyebrow: string;
    headline: string;
    p1: string;
    p2: string;
    bullet1: string;
    bullet2: string;
    bullet3: string;
    photo: string;
    name: string;
    title: string;
  };
  plan: {
    eyebrow: string;
    headline: string;
    intro: string;
    card1Title: string;
    card1Kicker: string;
    card1Body: string;
    card2Title: string;
    card2Kicker: string;
    card2Body: string;
    card3Title: string;
    card3Kicker: string;
    card3Body: string;
  };
  testimonials: { eyebrow: string; headline: string; intro: string };
  apply: { eyebrow: string; headline: string; intro: string };
}

export type SiteContentSection = keyof SiteContent;

/** A partial override: any subset of sections, each with any subset of fields. */
export type SiteContentOverrides = { [K in SiteContentSection]?: Partial<SiteContent[K]> };

export const SITE_CONTENT_DEFAULTS: SiteContent = {
  brand: {
    companyName: "My Target Client",
    legalLine: "My Target Client LLC · Find a Business Pro · Brian Traichel",
    logoUrl: "/uploads/ptc-simple-flat2.png",
    footerLogoUrl: "/uploads/ptc-simple-flat.png",
    ownerName: "Brian",
    ownerPhoto: "/uploads/BTLIpic.jpg",
  },
  visibility: { journey: true, cost: true, guide: true, plan: true, process: true, testimonials: true },
  hero: {
    eyebrow: "For consultants, authors & writers",
    headline: "Your expertise is real. Your profile makes it look optional.",
    subhead:
      "Right now the people who should be hiring you, booking you, or buying your book are reading a profile that sounds like everyone else's. We rebuild it around a proven 22-section framework — so you are found, believed, and approached as the authority in your niche.",
    primaryCta: "Get my profile audit",
    secondaryCta: "Book a 15-min call",
    stat1Value: "28+ years",
    stat1Label: "B2B sales experience",
    stat2Value: "22 sections",
    stat2Label: "Optimization framework",
    stat3Value: "1 hour",
    stat3Label: "Brand Voice Blueprint interview",
  },
  heroMedia: { kind: "audit_card" },
  journey: {
    eyebrow: "Your journey",
    headline: "Start with a grade. Leave with a profile that gets you hired.",
    intro: "Every step is a real conversation with Brian and the team — no self-serve software, no guessing where you stand.",
  },
  cost: {
    eyebrow: "The villain: invisibility",
    headline: "Every month a generic profile stays up, it quietly costs you.",
    intro:
      "Nobody sends an email to tell you they passed. The decision happens in eight seconds, on a screen you never see, and you find out by way of a pipeline that stays too quiet.",
    card1Title: "The engagement that went elsewhere",
    card1Body: "A buyer with budget compared three profiles. Yours read like a résumé, so they short-listed the two that read like specialists.",
    card2Title: "The stage you weren't offered",
    card2Body: "Event programmers vet speakers online first. If your niche isn't obvious in one glance, you're not a credible fit for their theme.",
    card3Title: "The book that stayed a secret",
    card3Body: "Readers buy the author before the book. A profile that doesn't say what you stand for gives them no reason to start.",
    card4Title: "The searches you never appeared in",
    card4Body: "Without the right keywords in the right sections, the algorithm can't surface you to the people already looking for what you do.",
    banner: "You don't have a talent problem. You have a translation problem — and it's fixable in weeks, not years.",
  },
  guide: {
    eyebrow: "Your guide",
    headline: "28+ years of B2B sales, pointed at your profile.",
    p1: "I've spent 28+ years in B2B sales — reading how buyers evaluate, hesitate, and decide. That's the lens I bring to a profile. Not copywriting flourish, not template filler: positioning that answers the question a serious buyer is actually asking.",
    p2: "Every profile is built by hand against the 22-section framework, and it's built with you — done-for-you if you'd rather hand it over, done-with-you if you want to learn the mechanics as we go.",
    bullet1: "Expert-managed, not one-size-fits-all templates",
    bullet2: "Algorithm-aware structure, written for humans first",
    bullet3: "Sales training available when visibility needs to become booked work",
    photo: "/uploads/SectaAI_00018_.png",
    name: "Brian Traichel",
    title: "My Target Client LLC · Find a Business Pro",
  },
  plan: {
    eyebrow: "The plan",
    headline: "Three moving parts. One recognizable authority.",
    intro: "Positioning, voice, and conversion — handled in order, so each one makes the next easier.",
    card1Title: "Profile optimization",
    card1Kicker: "22-SECTION FRAMEWORK",
    card1Body:
      "Every section of your profile rebuilt in sequence — headline, about, experience, skills, proof, and the next step you want a buyer to take. Done-for-you, or done-with-you.",
    card2Title: "The Brand Voice Blueprint",
    card2Kicker: "ONE-HOUR INTERVIEW",
    card2Body:
      "One hour on a call captures how you actually talk, what makes you different, and who you're for. It becomes an AI-ready reference document — so every post, email, and page you write from here sounds like you, not like generic AI output.",
    card3Title: "Sales training",
    card3Kicker: "VISIBILITY → ENGAGEMENTS",
    card3Body:
      "Inbound interest is only useful if you can hold the conversation. Optional coaching for consultants who want to convert attention into signed work.",
  },
  testimonials: {
    eyebrow: "In their words",
    headline: "What clients say",
    intro: "LinkedIn recommendations from consultants, authors, and executives who've been through the Brand Voice Interview.",
  },
  apply: {
    eyebrow: "The call to action",
    headline: "Let's make your profile the reason they call you.",
    intro:
      "Tell me where you are and what you want to be known for. I'll come back with a 22-section read on your current profile and where the biggest gains are.",
  },
};

export type FieldKind = "text" | "textarea" | "image";

export interface SectionField {
  key: string;
  label: string;
  kind: FieldKind;
}

/** CMS rail keys: every content section plus "process", which only has a Show-on-site toggle. */
export type CmsSectionKey = SiteContentSection | "process";

export interface SectionMeta {
  key: CmsSectionKey;
  label: string;
  /** Whether the section has a Show-on-site toggle (`visibility[key]`). */
  toggle: boolean;
  fields: SectionField[];
}

const f = (key: string, label: string, kind: FieldKind = "text"): SectionField => ({ key, label, kind });

/** Drives the Website (CMS) section rail and field editor. Ported from MTC_SECTION_META. */
export const SECTION_META: readonly SectionMeta[] = [
  {
    key: "brand",
    label: "Brand",
    toggle: false,
    fields: [
      f("companyName", "Company name"),
      f("legalLine", "Footer legal line"),
      f("logoUrl", "Header logo URL", "image"),
      f("footerLogoUrl", "Footer logo URL", "image"),
      f("ownerName", "Owner first name (used in copy)"),
      f("ownerPhoto", "Owner headshot URL", "image"),
    ],
  },
  {
    key: "hero",
    label: "Hero",
    toggle: false,
    fields: [
      f("eyebrow", "Eyebrow"),
      f("headline", "Headline", "textarea"),
      f("subhead", "Subhead", "textarea"),
      f("primaryCta", "Primary button"),
      f("secondaryCta", "Secondary button"),
      f("stat1Value", "Stat 1 value"),
      f("stat1Label", "Stat 1 label"),
      f("stat2Value", "Stat 2 value"),
      f("stat2Label", "Stat 2 label"),
      f("stat3Value", "Stat 3 value"),
      f("stat3Label", "Stat 3 label"),
    ],
  },
  { key: "journey", label: "Your journey", toggle: true, fields: [f("eyebrow", "Eyebrow"), f("headline", "Headline", "textarea"), f("intro", "Intro", "textarea")] },
  {
    key: "cost",
    label: "The cost",
    toggle: true,
    fields: [
      f("eyebrow", "Eyebrow"),
      f("headline", "Headline", "textarea"),
      f("intro", "Intro", "textarea"),
      f("card1Title", "Card 1 title"),
      f("card1Body", "Card 1 body", "textarea"),
      f("card2Title", "Card 2 title"),
      f("card2Body", "Card 2 body", "textarea"),
      f("card3Title", "Card 3 title"),
      f("card3Body", "Card 3 body", "textarea"),
      f("card4Title", "Card 4 title"),
      f("card4Body", "Card 4 body", "textarea"),
      f("banner", "Banner statement", "textarea"),
    ],
  },
  {
    key: "guide",
    label: "About the guide",
    toggle: true,
    fields: [
      f("eyebrow", "Eyebrow"),
      f("headline", "Headline", "textarea"),
      f("p1", "Paragraph 1", "textarea"),
      f("p2", "Paragraph 2", "textarea"),
      f("bullet1", "Bullet 1"),
      f("bullet2", "Bullet 2"),
      f("bullet3", "Bullet 3"),
      f("photo", "Portrait URL", "image"),
      f("name", "Name"),
      f("title", "Title line"),
    ],
  },
  {
    key: "plan",
    label: "The plan",
    toggle: true,
    fields: [
      f("eyebrow", "Eyebrow"),
      f("headline", "Headline", "textarea"),
      f("intro", "Intro", "textarea"),
      f("card1Title", "Card 1 title"),
      f("card1Kicker", "Card 1 kicker"),
      f("card1Body", "Card 1 body", "textarea"),
      f("card2Title", "Card 2 title"),
      f("card2Kicker", "Card 2 kicker"),
      f("card2Body", "Card 2 body", "textarea"),
      f("card3Title", "Card 3 title"),
      f("card3Kicker", "Card 3 kicker"),
      f("card3Body", "Card 3 body", "textarea"),
    ],
  },
  { key: "process", label: "How it runs", toggle: true, fields: [] },
  { key: "testimonials", label: "What clients say", toggle: true, fields: [f("eyebrow", "Eyebrow"), f("headline", "Headline"), f("intro", "Intro", "textarea")] },
  { key: "apply", label: "Call to action + form", toggle: false, fields: [f("eyebrow", "Eyebrow"), f("headline", "Headline", "textarea"), f("intro", "Intro", "textarea")] },
];

/**
 * Section-wise merge: every key of `base` survives, overrides replace fields.
 * `heroMedia` is replaced whole (it is a tagged union, not a flat record).
 */
export function mergeContent(base: SiteContent, over: SiteContentOverrides | null | undefined): SiteContent {
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(base) as SiteContentSection[]) {
    const baseSection = base[key];
    const overSection = over?.[key];
    if (key === "heroMedia") {
      out[key] = overSection && typeof overSection === "object" && "kind" in overSection ? overSection : baseSection;
    } else {
      out[key] = Object.assign({}, baseSection, overSection ?? {});
    }
  }
  return out as unknown as SiteContent;
}

/** Keep only keys the model knows, so a stray field can never reach the page. */
export function sanitizeOverrides(input: unknown): SiteContentOverrides {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, Record<string, unknown> | HeroMedia> = {};
  const src = input as Record<string, unknown>;
  for (const key of Object.keys(SITE_CONTENT_DEFAULTS) as SiteContentSection[]) {
    const section = src[key];
    if (!section || typeof section !== "object") continue;
    if (key === "heroMedia") {
      const hm = section as Record<string, unknown>;
      if (hm.kind === "audit_card") out[key] = { kind: "audit_card" };
      else if (hm.kind === "video" && typeof hm.url === "string") out[key] = { kind: "video", url: hm.url.slice(0, 2000) };
      continue;
    }
    const allowed = SITE_CONTENT_DEFAULTS[key] as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    for (const [fk, fv] of Object.entries(section as Record<string, unknown>)) {
      if (!(fk in allowed)) continue;
      const expected = typeof allowed[fk];
      if (expected === "boolean" && typeof fv === "boolean") clean[fk] = fv;
      else if (expected === "string" && typeof fv === "string") clean[fk] = fv.slice(0, 5000);
    }
    if (Object.keys(clean).length) out[key] = clean;
  }
  return out as SiteContentOverrides;
}
