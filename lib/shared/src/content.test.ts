import { describe, expect, it } from "vitest";
import { SITE_CONTENT_DEFAULTS, mergeContent, sanitizeOverrides } from "./siteContent";
import { DEFAULT_TEMPLATES, fillTemplate, templateFromContent } from "./templates";

describe("mergeContent", () => {
  it("keeps every default field and applies overrides per section", () => {
    const merged = mergeContent(SITE_CONTENT_DEFAULTS, { hero: { headline: "New" }, visibility: { cost: false } });
    expect(merged.hero.headline).toBe("New");
    expect(merged.hero.subhead).toBe(SITE_CONTENT_DEFAULTS.hero.subhead);
    expect(merged.visibility.cost).toBe(false);
    expect(merged.visibility.journey).toBe(true);
    expect(merged.heroMedia).toEqual({ kind: "audit_card" });
  });
  it("replaces heroMedia whole", () => {
    expect(mergeContent(SITE_CONTENT_DEFAULTS, { heroMedia: { kind: "video", url: "https://v" } }).heroMedia).toEqual({ kind: "video", url: "https://v" });
  });
  it("sanitizes unknown sections, fields and types", () => {
    const clean = sanitizeOverrides({ hero: { headline: "ok", evil: "<script>", stat1Value: 5 }, nope: { a: 1 }, visibility: { cost: "no", guide: false }, heroMedia: { kind: "video", url: "u" } });
    expect(clean).toEqual({ hero: { headline: "ok" }, visibility: { guide: false }, heroMedia: { kind: "video", url: "u" } });
  });
});

describe("templates", () => {
  const company = { name: "Northstar Advisory", owner: "Dana Whitfield", branding: { companyName: "Northstar Advisory", logoUrl: "" } };
  it("fills tokens from the company", () => {
    const filled = fillTemplate(DEFAULT_TEMPLATES[0].content, company);
    expect(filled.brand?.companyName).toBe("Northstar Advisory");
    expect(filled.brand?.ownerName).toBe("Dana");
    expect(filled.journey?.intro).toContain("Dana and the team");
    expect(filled.guide?.name).toBe("Dana Whitfield");
  });
  it("strips a live page back into tokens", () => {
    const stripped = templateFromContent(fillTemplate(DEFAULT_TEMPLATES[0].content, company), company);
    expect(stripped.brand?.companyName).toBe("{company}");
    expect(stripped.journey?.intro).toContain("{ownerFirst} and the team");
    expect(stripped.guide?.title).toBe("{company}");
    expect(stripped.visibility?.testimonials).toBe(false);
  });
});

describe("about page content", () => {
  it("ships the About defaults, merges them and keeps the toggle", async () => {
    const { SITE_CONTENT_DEFAULTS, mergeContent, sanitizeOverrides, parseCriteria, ownerFirstName } = await import("./siteContent");
    expect(SITE_CONTENT_DEFAULTS.about.headline).toContain("Knowing how LinkedIn works");
    expect(SITE_CONTENT_DEFAULTS.visibility.about).toBe(true);
    const merged = mergeContent(SITE_CONTENT_DEFAULTS, sanitizeOverrides({ about: { headline: "Hi", bogus: "x" }, visibility: { about: false } }));
    expect(merged.about.headline).toBe("Hi");
    expect(merged.about.intro).toBe(SITE_CONTENT_DEFAULTS.about.intro);
    expect(merged.visibility.about).toBe(false);
    expect((merged.about as Record<string, unknown>).bogus).toBeUndefined();
    const criteria = parseCriteria(SITE_CONTENT_DEFAULTS.about.criteria);
    expect(criteria).toHaveLength(10);
    expect(criteria[0]).toEqual({ rank: "01", label: "Proven business results and ROI", weight: 20 });
    expect(criteria.reduce((s, c) => s + c.weight, 0)).toBe(100);
    expect(parseCriteria("Only a label\n | 5\n\n")).toEqual([{ rank: "01", label: "Only a label", weight: 0 }]);
    expect(ownerFirstName(SITE_CONTENT_DEFAULTS.brand)).toBe("Brian");
    expect(ownerFirstName({ ownerName: "", ownerFullName: "Dana Whitfield" })).toBe("Dana");
  });

  it("fills owner tokens on the About section of the default template", async () => {
    const { DEFAULT_TEMPLATES, fillTemplate } = await import("./templates");
    const filled = fillTemplate(DEFAULT_TEMPLATES[0].content, { name: "Acme Advisory", owner: "Pat Example" });
    expect(filled.about?.eyebrow).toBe("About Pat Example");
    expect(filled.brand?.ownerFullName).toBe("Pat Example");
    expect(filled.brand?.ownerTitle).toBe("Acme Advisory");
  });
});

describe("offer catalogue", () => {
  it("prices and checkout paths agree with the pricing pages", async () => {
    const { OFFERS, offerPriceLabel, offerTermLabel, checkoutPath, isOfferKey, STANDARD_CORE_TIERS, COMMERCIAL_SECTIONS } = await import("./offers");
    expect(offerPriceLabel(OFFERS.voice, "full")).toBe("$997");
    expect(offerPriceLabel(OFFERS.voice, "split")).toBe("2 × $499");
    expect(offerTermLabel(OFFERS.exec, "split")).toBe("3 payments");
    expect(offerPriceLabel(OFFERS.exec, "full")).toBe("$1,997");
    // Non-splittable offers ignore the plan.
    expect(offerPriceLabel(OFFERS.audit, "split")).toBe("$197");
    expect(checkoutPath("voice", "split")).toBe("/buy?offer=voice&plan=split");
    expect(checkoutPath("audit")).toBe("/buy?offer=audit");
    expect(isOfferKey("voice")).toBe(true);
    expect(isOfferKey("nope")).toBe(false);
    expect(STANDARD_CORE_TIERS.map((t) => t.key)).toEqual(["live", "voice", "exec"]);
    expect(COMMERCIAL_SECTIONS.flatMap((s) => s.rows).some((r) => r.featured)).toBe(true);
  });
});
