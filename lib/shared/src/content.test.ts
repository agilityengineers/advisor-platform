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
