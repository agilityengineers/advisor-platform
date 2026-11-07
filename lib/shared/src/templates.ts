import type { SiteContentOverrides } from "./siteContent";

/**
 * Landing-page templates — ported from design_handoff/templates.js.
 * Tokens: {company} {owner} {ownerFirst}. Applying a template to a company
 * writes a CMS *draft*; the super admin can also strip a live page into a template.
 */

export interface LandingTemplate {
  slug: string;
  name: string;
  source: string;
  audience: string;
  summary: string;
  content: SiteContentOverrides;
}

export const TEMPLATE_TOKENS = ["{company}", "{owner}", "{ownerFirst}"] as const;

export const DEFAULT_TEMPLATES: readonly LandingTemplate[] = [
  {
    slug: "profile-authority",
    name: "Profile Authority",
    source: "Derived from My Target Client",
    audience: "Consultants, authors & writers",
    summary: "Grade → call → Brand Voice → rebuilt profile. Journey map, cost-of-invisibility, guide section, plan cards, audit form.",
    content: {
      brand: { companyName: "{company}", legalLine: "{company} · {owner}", logoUrl: "", footerLogoUrl: "", ownerName: "{ownerFirst}", ownerPhoto: "", iconUrl: "", ownerFullName: "{owner}", ownerTitle: "{company}", ownerEmail: "", ownerPhone: "", ownerLinkedin: "", authorityDeskUrl: "" },
      visibility: { journey: true, cost: true, guide: true, plan: true, process: true, testimonials: false, about: true },
      hero: {
        eyebrow: "For consultants, authors & writers",
        headline: "Your expertise is real. Your profile makes it look optional.",
        subhead:
          "Right now the people who should be hiring you, booking you, or buying your book are reading a profile that sounds like everyone else's. We rebuild it around a proven 22-section framework — so you are found, believed, and approached as the authority in your niche.",
        primaryCta: "Get my profile audit",
        secondaryCta: "Book a 15-min call",
        stat1Value: "15+ years",
        stat1Label: "B2B experience",
        stat2Value: "22 sections",
        stat2Label: "Optimization framework",
        stat3Value: "1 hour",
        stat3Label: "Brand Voice Blueprint interview",
      },
      journey: {
        eyebrow: "Your journey",
        headline: "Start with a grade. Leave with a profile that gets you hired.",
        intro: "Every step is a real conversation with {ownerFirst} and the team — no self-serve software, no guessing where you stand.",
      },
      guide: {
        eyebrow: "Your guide",
        headline: "Years of B2B sales, pointed at your profile.",
        p1: "I've spent my career in B2B sales — reading how buyers evaluate, hesitate, and decide. That's the lens I bring to a profile. Not copywriting flourish, not template filler: positioning that answers the question a serious buyer is actually asking.",
        p2: "Every profile is built by hand against the 22-section framework, and it's built with you — done-for-you if you'd rather hand it over, done-with-you if you want to learn the mechanics as we go.",
        bullet1: "Expert-managed, not one-size-fits-all templates",
        bullet2: "Algorithm-aware structure, written for humans first",
        bullet3: "Sales training available when visibility needs to become booked work",
        photo: "",
        name: "{owner}",
        title: "{company}",
      },
      apply: {
        eyebrow: "The call to action",
        headline: "Let's make your profile the reason they call you.",
        intro: "Tell me where you are and what you want to be known for. I'll come back with a 22-section read on your current profile and where the biggest gains are.",
      },
      about: {
        eyebrow: "About {owner}",
        headline: "Knowing how LinkedIn works isn't expertise. Making it work toward a business objective is.",
        intro: "I've spent my career in B2B sales watching how buyers evaluate, hesitate, and decide. That lens — not copywriting flourish — is what I bring to every profile, every campaign, and every client conversation.",
        heroPhoto: "",
        workPhoto: "",
      },
    },
  },
];

export interface TemplateCompany {
  name: string;
  owner: string;
  branding?: { companyName?: string | null; logoUrl?: string | null } | null;
}

function mapStrings(content: SiteContentOverrides, fn: (s: string) => string): SiteContentOverrides {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [sec, fields] of Object.entries(content)) {
    if (!fields || typeof fields !== "object") continue;
    out[sec] = {};
    for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
      out[sec][k] = typeof v === "string" ? fn(v) : v;
    }
  }
  return out as SiteContentOverrides;
}

/** Fill tokens from the company record; company branding wins where it exists. */
export function fillTemplate(content: SiteContentOverrides, company: TemplateCompany): SiteContentOverrides {
  const first = (company.owner || "").split(" ")[0] || "me";
  const out = mapStrings(content, (s) =>
    s.replace(/\{company\}/g, company.name || "").replace(/\{ownerFirst\}/g, first).replace(/\{owner\}/g, company.owner || ""),
  );
  if (company.branding) {
    out.brand = {
      ...(out.brand ?? {}),
      companyName: company.branding.companyName || out.brand?.companyName || company.name,
      logoUrl: company.branding.logoUrl || "",
      footerLogoUrl: company.branding.logoUrl || "",
    };
  }
  return out;
}

/** Strip company-specific material so a live page can become a template. */
export function templateFromContent(merged: SiteContentOverrides, company: TemplateCompany): SiteContentOverrides {
  const first = (company.owner || "").split(" ")[0];
  const tok = (s: string) => {
    let v = s;
    if (company.name) v = v.split(company.name).join("{company}");
    if (company.owner) v = v.split(company.owner).join("{owner}");
    if (first) v = v.split(first).join("{ownerFirst}");
    return v;
  };
  const c = mapStrings(JSON.parse(JSON.stringify(merged)) as SiteContentOverrides, tok);
  c.brand = { companyName: "{company}", legalLine: "{company} · {owner}", logoUrl: "", footerLogoUrl: "", ownerName: "{ownerFirst}", ownerPhoto: "" };
  if (c.guide) {
    c.guide.photo = "";
    c.guide.name = "{owner}";
    c.guide.title = "{company}";
  }
  c.visibility = { ...(c.visibility ?? {}), testimonials: false };
  delete (c as Record<string, unknown>).heroMedia;
  return c;
}
