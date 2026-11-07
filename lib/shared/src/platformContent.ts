/**
 * Advisor Platform landing content — the copy in design_handoff/Advisor Platform.dc.html,
 * editable by the super admin in Platform Admin → Platform landing (draft → publish).
 * Every text block, the AI now/roadmap tags, FAQ items, testimonials and founder note live here.
 */

export type AiTag = "now" | "roadmap";
export type TemplateCardStyle = "cream" | "green" | "blue";

export interface PlatformContent {
  hero: {
    eyebrow: string;
    headline: string;
    headlineEm: string;
    sub: string;
    primaryCta: string;
    secondaryCta: string;
    note: string;
    chipValue: string;
    chipUnit: string;
    chipLabel: string;
    domainChip: string;
    aiLineStrong: string;
    aiLine: string;
  };
  trust: { items: string[] };
  how: { eyebrow: string; headline: string; headlineEm: string; steps: { label: string; title: string; body: string }[] };
  tour: { eyebrow: string; headline: string; headlineEm: string; intro: string; cells: { n: string; title: string; body: string }[] };
  ai: { eyebrow: string; headline: string; headlineEm: string; intro: string; items: { letter: string; title: string; body: string; tag: AiTag }[] };
  whiteLabel: { eyebrow: string; headline: string; headlineEm: string; body: string; bullets: string[]; brands: { name: string; domain: string; color: string; accent: string }[]; note: string };
  integrations: { eyebrow: string; headline: string; aside: string; items: { name: string; body: string }[] };
  templates: { eyebrow: string; headline: string; intro: string; showcase: { name: string; audience: string; tag: string; style: TemplateCardStyle }[] };
  testimonials: { eyebrow: string; quotes: { text: string; name: string; role: string }[]; note: string };
  faq: { eyebrow: string; headline: string; items: { q: string; a: string }[] };
  founder: { eyebrow: string; headline: string; headlineEm: string; body: string; name: string; title: string; calendlyUrl: string; calendlyLabel: string };
  form: { title: string; sub: string; demoLabel: string; trialLabel: string; demoSubmit: string; trialSubmit: string; footnote: string; successTitle: string; successBody: string; successCta: string };
  footer: { tagline: string };
}

export type PlatformContentSection = keyof PlatformContent;

export const PLATFORM_CONTENT_DEFAULTS: PlatformContent = {
  hero: {
    eyebrow: "For LinkedIn professionals, consultants & coaches",
    headline: "Your clients come to you for authority.",
    headlineEm: "Now run it like a business.",
    sub: "An AI-driven, multi-touch strategy platform for advisors who build authority for their clients. Your own branded site, a lead-to-close console, Brand Voice capture, and automated follow-up — on your domain, under your name.",
    primaryCta: "Book a demo →",
    secondaryCta: "Start a 14-day trial",
    note: "Launch with a proven landing-page template — live on your subdomain the same day.",
    chipValue: "1",
    chipUnit: "day",
    chipLabel: "From signup to live site",
    domainChip: "yourname.advisor-platform.com · or your own domain",
    aiLineStrong: "Lead scored 82 · hot.",
    aiLine: "Brand Voice captured. Intro email + SMS reminder queued.",
  },
  trust: { items: ["Your brand, your domain", "Lead-to-close pipeline", "AI Brand Voice capture", "Email + SMS follow-up", "Stripe checkout built in"] },
  how: {
    eyebrow: "How it works",
    headline: "Three steps.",
    headlineEm: "Then it compounds.",
    steps: [
      { label: "Step 01", title: "Choose a template, claim your subdomain", body: "Pick a proven landing page, add your logo and colors, connect your own domain when you're ready. Your site is live the same day." },
      { label: "Step 02", title: "Connect your stack", body: "Bring your SendGrid, Twilio, Stripe, and Calendly. Leads flow from your form into your pipeline; receipts, reminders, and bookings run on your accounts." },
      { label: "Step 03", title: "Work the pipeline, publish the proof", body: "Drag leads from new to closed, capture each client's Brand Voice, and let the AI draft what comes next. Your portal keeps clients in the loop." },
    ],
  },
  tour: {
    eyebrow: "The console",
    headline: "Everything an advisory practice needs.",
    headlineEm: "Nothing a software company needs.",
    intro: "One login. Your site, your leads, your clients, your billing — and the admin who runs your team.",
    cells: [
      { n: "01", title: "Branded landing page", body: "A proven template with your logo, copy, and domain. Edit everything in the CMS; publish when ready." },
      { n: "02", title: "Lead capture + audit form", body: "Your form writes straight into the pipeline with phone, LinkedIn URL, and goals attached." },
      { n: "03", title: "Lead-to-close pipeline", body: "Kanban stages you define. Drag a lead from new to signed; every move is logged." },
      { n: "04", title: "Brand Voice capture", body: "Record one interview; the platform turns it into an AI-ready voice document you reuse everywhere." },
      { n: "05", title: "Checkout + payment plans", body: "Stripe-powered checkout on your brand, with order bumps and 2–3 pay plans." },
      { n: "06", title: "Email + SMS follow-up", body: "Receipts, reminders, and alerts from your SendGrid and Twilio — never a shared sender." },
      { n: "07", title: "Client portal", body: "Clients see stage, files, and payments. Fewer “where are we?” emails." },
      { n: "08", title: "Team + permissions", body: "Managers and advisors with read/write per area. You stay the admin." },
    ],
  },
  ai: {
    eyebrow: "AI-driven · multi-touch",
    headline: "AI that captures the voice,",
    headlineEm: "then does the follow-through.",
    intro: "Authority is built in many small touches. The platform records each client's voice once, then uses it everywhere — drafts, sequences, scoring — so your team spends its time on conversations, not copy.",
    items: [
      { letter: "A.", title: "Brand Voice capture", body: "One recorded interview becomes a structured voice document — tone, proof points, ideal client — that every later touch is written from.", tag: "now" },
      { letter: "B.", title: "AI-drafted profile and content", body: "Headlines, About sections, and posts drafted in the client's captured voice. You edit and approve; nothing publishes on its own.", tag: "now" },
      { letter: "C.", title: "AI lead scoring in the pipeline", body: "Each lead gets a readiness score from form answers, profile signals, and engagement, so your team calls the right person first.", tag: "roadmap" },
      { letter: "D.", title: "AI-generated landing copy per advisor", body: "Point it at your LinkedIn and your Brand Voice; it drafts your landing page in your words, into the template you chose.", tag: "roadmap" },
      { letter: "E.", title: "Multi-touch sequences", body: "Email, SMS, and LinkedIn touches orchestrated on one timeline per lead — paced, personalized, and paused the moment they reply.", tag: "roadmap" },
    ],
  },
  whiteLabel: {
    eyebrow: "White label",
    headline: "Your logo. Your colors. Your domain.",
    headlineEm: "Our name never appears.",
    body: "Every company on the platform is its own tenant. Clients see you — on yourfirm.com, with your sending domain on every email and your number on every text. Point your DNS at us from GoDaddy, Cloudflare, or wherever it lives; we handle SSL.",
    bullets: [
      "Logo, palette, tagline, and copy — all editable in your CMS",
      "Custom domain with guided DNS and automatic SSL",
      "Your SendGrid, Twilio, Stripe, and Calendly — never shared",
      "Managers and advisors with per-area permissions",
    ],
    brands: [
      { name: "My Target Client", domain: "mytargetclient.com", color: "#1668F0", accent: "#0A1626" },
      { name: "Northstar Advisory", domain: "northstar.advisor-platform.com", color: "#1F5D4C", accent: "#B07C2E" },
      { name: "Career Pro Guider", domain: "careerproguider.com", color: "#7A2E2E", accent: "#34506E" },
    ],
    note: "Illustrative tenants — each with its own brand, domain, and integrations.",
  },
  integrations: {
    eyebrow: "Bring your own stack",
    headline: "Connect the tools you already pay for.",
    aside: "Keys stay encrypted per company. Disconnect any time and the data stays yours.",
    items: [
      { name: "SendGrid", body: "Transactional email from your verified sending domain. Receipts, welcome sequences, reminders." },
      { name: "Twilio", body: "A number per company. Interview and intake reminders to clients; new-lead alerts to you." },
      { name: "Stripe", body: "Stripe Connect — checkout, payment plans, and payouts straight to your account." },
      { name: "Calendly", body: "Prefilled booking embedded in your flow; bookings post back to the pipeline and portal." },
    ],
  },
  templates: {
    eyebrow: "Templates",
    headline: "Start from a page that already converts.",
    intro: "Every template began as a real advisor's live site. Pick one, make it yours, publish.",
    showcase: [
      { name: "Profile Authority", audience: "Consultants, authors & writers", tag: "Live on 1 company", style: "cream" },
      { name: "Sales Team Accelerator", audience: "Sales leaders & B2B teams", tag: "Coming soon", style: "green" },
      { name: "Author Platform", audience: "Authors & speakers", tag: "Coming soon", style: "blue" },
    ],
  },
  testimonials: {
    eyebrow: "From advisors on the platform",
    quotes: [
      { text: "[Advisor testimonial — a LinkedIn strategist on going from spreadsheet to pipeline.]", name: "Name TBD", role: "LinkedIn strategist" },
      { text: "[Advisor testimonial — a consultant on launching a white-label site in a day.]", name: "Name TBD", role: "Executive coach" },
      { text: "[Advisor testimonial — a team lead on managers and advisors sharing one pipeline.]", name: "Name TBD", role: "Sales trainer" },
    ],
    note: "Placeholders — replaced with named advisor testimonials as companies go live.",
  },
  faq: {
    eyebrow: "Questions",
    headline: "The honest answers.",
    items: [
      { q: "Is this software I have to learn?", a: "It's a console, not a toolbox. You edit copy, drag leads, and approve drafts. Everything technical — DNS, SSL, webhooks, payment plans — is handled or guided step by step." },
      { q: "Do my clients ever see Advisor Platform?", a: "No. Your site runs on your domain, emails come from your sending domain, texts from your number, and the portal carries your brand. We're the infrastructure." },
      { q: "Do I need my own SendGrid, Twilio, and Stripe accounts?", a: "Yes — deliberately. Your sender reputation, your phone number, and your revenue belong to you. We make connecting them a ten-minute job." },
      { q: "What does the AI actually do today?", a: "Brand Voice capture and voice-matched drafting are live. Lead scoring, AI-written landing copy, and orchestrated multi-touch sequences are on the roadmap and labeled as such above." },
      { q: "Can I bring my team?", a: "On plans with team management, yes. Invite managers and client advisors and set read or write access per area — leads, pipeline, website, reviews, billing, team." },
      { q: "What does it cost?", a: "Plans are scoped on the demo based on team size, white-label needs, and volume. Trials are free for 14 days with no card." },
    ],
  },
  founder: {
    eyebrow: "A note from the founder",
    headline: "You've spent years building other people's authority.",
    headlineEm: "This is the business around it.",
    body: "I built Advisor Platform with the first company on it — a LinkedIn strategist who was running leads out of a spreadsheet and a profile out of a Word doc. Every feature here exists because an advisor needed it. If that sounds like you, let's talk.",
    name: "Clarence Williams",
    title: "Founder, Advisor Platform",
    calendlyUrl: "https://calendly.com/clarencewilliams/advisor-platform-demo",
    calendlyLabel: "Or pick a time on my calendar →",
  },
  form: {
    title: "Book a demo or start your trial",
    sub: "Four fields. We'll set up your subdomain before the call.",
    demoLabel: "Book a demo",
    trialLabel: "Start a 14-day trial",
    demoSubmit: "Request my demo →",
    trialSubmit: "Start my trial →",
    footnote: "Lands in the platform pipeline · No credit card for the trial",
    successTitle: "Got it, {firstName}.",
    successBody: "You're in the platform pipeline. Clarence will reach out within one business day — or grab a time on the calendar now.",
    successCta: "Book the demo →",
  },
  footer: { tagline: "AI-driven, multi-touch strategy for authority-building advisors." },
};

export type PlatformFieldKind = "text" | "textarea" | "url" | "color" | "select";

export interface PlatformField {
  key: string;
  label: string;
  kind: PlatformFieldKind;
  options?: { value: string; label: string }[];
}

export interface PlatformListMeta {
  key: string;
  label: string;
  /** Empty = list of plain strings. */
  itemFields: PlatformField[];
  itemLabel: string;
}

export interface PlatformSectionMeta {
  key: PlatformContentSection;
  label: string;
  fields: PlatformField[];
  lists: PlatformListMeta[];
}

const t = (key: string, label: string, kind: PlatformFieldKind = "text", options?: PlatformField["options"]): PlatformField => ({ key, label, kind, options });

export const PLATFORM_SECTION_META: readonly PlatformSectionMeta[] = [
  {
    key: "hero", label: "Hero",
    fields: [t("eyebrow", "Eyebrow"), t("headline", "Headline", "textarea"), t("headlineEm", "Headline (brass line)", "textarea"), t("sub", "Subhead", "textarea"), t("primaryCta", "Primary button"), t("secondaryCta", "Secondary link"), t("note", "Note under buttons", "textarea"), t("chipValue", "Floating chip value"), t("chipUnit", "Floating chip unit"), t("chipLabel", "Floating chip label"), t("domainChip", "Domain chip"), t("aiLineStrong", "Console AI line (bold)"), t("aiLine", "Console AI line")],
    lists: [],
  },
  { key: "trust", label: "Trust strip", fields: [], lists: [{ key: "items", label: "Strip items", itemFields: [], itemLabel: "Item" }] },
  { key: "how", label: "How it works", fields: [t("eyebrow", "Eyebrow"), t("headline", "Headline"), t("headlineEm", "Headline (brass)")], lists: [{ key: "steps", label: "Steps", itemLabel: "Step", itemFields: [t("label", "Label"), t("title", "Title"), t("body", "Body", "textarea")] }] },
  { key: "tour", label: "The console", fields: [t("eyebrow", "Eyebrow"), t("headline", "Headline"), t("headlineEm", "Headline (brass)"), t("intro", "Intro", "textarea")], lists: [{ key: "cells", label: "Grid cells", itemLabel: "Cell", itemFields: [t("n", "Number"), t("title", "Title"), t("body", "Body", "textarea")] }] },
  {
    key: "ai", label: "AI",
    fields: [t("eyebrow", "Eyebrow"), t("headline", "Headline", "textarea"), t("headlineEm", "Headline (brass)", "textarea"), t("intro", "Intro", "textarea")],
    lists: [{ key: "items", label: "AI items", itemLabel: "Item", itemFields: [t("letter", "Letter"), t("title", "Title"), t("body", "Body", "textarea"), t("tag", "Status tag", "select", [{ value: "now", label: "Available now" }, { value: "roadmap", label: "Roadmap" }])] }],
  },
  {
    key: "whiteLabel", label: "White label",
    fields: [t("eyebrow", "Eyebrow"), t("headline", "Headline", "textarea"), t("headlineEm", "Headline (brass)"), t("body", "Body", "textarea"), t("note", "Note under brands")],
    lists: [
      { key: "bullets", label: "Bullets", itemFields: [], itemLabel: "Bullet" },
      { key: "brands", label: "Illustrative tenants", itemLabel: "Tenant", itemFields: [t("name", "Name"), t("domain", "Domain"), t("color", "Primary", "color"), t("accent", "Accent", "color")] },
    ],
  },
  { key: "integrations", label: "Integrations", fields: [t("eyebrow", "Eyebrow"), t("headline", "Headline"), t("aside", "Aside", "textarea")], lists: [{ key: "items", label: "Integrations", itemLabel: "Integration", itemFields: [t("name", "Name"), t("body", "Body", "textarea")] }] },
  {
    key: "templates", label: "Template gallery",
    fields: [t("eyebrow", "Eyebrow"), t("headline", "Headline"), t("intro", "Intro", "textarea")],
    lists: [{ key: "showcase", label: "Cards", itemLabel: "Card", itemFields: [t("name", "Name"), t("audience", "Audience"), t("tag", "Tag"), t("style", "Style", "select", [{ value: "cream", label: "Cream" }, { value: "green", label: "Deep green" }, { value: "blue", label: "Pale blue" }])] }],
  },
  { key: "testimonials", label: "Testimonials", fields: [t("eyebrow", "Eyebrow"), t("note", "Note")], lists: [{ key: "quotes", label: "Quotes", itemLabel: "Quote", itemFields: [t("text", "Quote", "textarea"), t("name", "Name"), t("role", "Role")] }] },
  { key: "faq", label: "FAQ", fields: [t("eyebrow", "Eyebrow"), t("headline", "Headline")], lists: [{ key: "items", label: "Questions", itemLabel: "Question", itemFields: [t("q", "Question"), t("a", "Answer", "textarea")] }] },
  { key: "founder", label: "Founder note", fields: [t("eyebrow", "Eyebrow"), t("headline", "Headline", "textarea"), t("headlineEm", "Headline (brass)"), t("body", "Body", "textarea"), t("name", "Name"), t("title", "Title"), t("calendlyUrl", "Calendly URL", "url"), t("calendlyLabel", "Calendly link label")], lists: [] },
  { key: "form", label: "Demo / trial form", fields: [t("title", "Title"), t("sub", "Subtitle"), t("demoLabel", "Intent: demo"), t("trialLabel", "Intent: trial"), t("demoSubmit", "Submit (demo)"), t("trialSubmit", "Submit (trial)"), t("footnote", "Footnote"), t("successTitle", "Success title ({firstName})"), t("successBody", "Success body", "textarea"), t("successCta", "Success button")], lists: [] },
  { key: "footer", label: "Footer", fields: [t("tagline", "Tagline")], lists: [] },
];

function cloneDefaults(): PlatformContent {
  return JSON.parse(JSON.stringify(PLATFORM_CONTENT_DEFAULTS)) as PlatformContent;
}

/**
 * Coerce stored JSON into a complete PlatformContent: unknown keys dropped,
 * missing keys filled from defaults, list items validated field by field.
 */
export function sanitizePlatformContent(input: unknown): PlatformContent {
  const out = cloneDefaults();
  if (!input || typeof input !== "object") return out;
  const src = input as Record<string, unknown>;
  for (const meta of PLATFORM_SECTION_META) {
    const section = src[meta.key];
    if (!section || typeof section !== "object") continue;
    const target = out[meta.key] as unknown as Record<string, unknown>;
    const s = section as Record<string, unknown>;
    for (const f of meta.fields) {
      const v = s[f.key];
      if (typeof v === "string") target[f.key] = v.slice(0, 4000);
    }
    for (const list of meta.lists) {
      const raw = s[list.key];
      if (!Array.isArray(raw)) continue;
      if (list.itemFields.length === 0) {
        target[list.key] = raw.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 400)).slice(0, 30);
      } else {
        const defaultsList = (PLATFORM_CONTENT_DEFAULTS[meta.key] as unknown as Record<string, unknown>)[list.key] as Record<string, unknown>[];
        const proto = defaultsList[0] ?? {};
        target[list.key] = raw
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .map((item) => {
            const clean: Record<string, unknown> = {};
            for (const f of list.itemFields) {
              const v = item[f.key];
              if (f.kind === "select" && f.options) clean[f.key] = f.options.some((o) => o.value === v) ? v : f.options[0].value;
              else clean[f.key] = typeof v === "string" ? v.slice(0, 4000) : (proto[f.key] ?? "");
            }
            return clean;
          })
          .slice(0, 30);
      }
    }
  }
  return out;
}

export const PLATFORM_FORM_INTENTS = ["demo", "trial"] as const;
export type PlatformFormIntent = (typeof PLATFORM_FORM_INTENTS)[number];
