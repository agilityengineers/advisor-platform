import { describe, expect, it } from "vitest";
import { PLATFORM_CONTENT_DEFAULTS, PLATFORM_SECTION_META, sanitizePlatformContent } from "./platformContent";

describe("platform content", () => {
  it("keeps the AI now/roadmap tags honest by default", () => {
    expect(PLATFORM_CONTENT_DEFAULTS.ai.items.map((i) => i.tag)).toEqual(["now", "now", "roadmap", "roadmap", "roadmap"]);
  });
  it("round-trips the defaults unchanged", () => {
    expect(sanitizePlatformContent(PLATFORM_CONTENT_DEFAULTS)).toEqual(PLATFORM_CONTENT_DEFAULTS);
  });
  it("drops unknown keys, fills gaps, and validates list items", () => {
    const out = sanitizePlatformContent({ hero: { headline: "New", evil: 1 }, ai: { items: [{ letter: "Z.", title: "T", body: "B", tag: "bogus" }, "junk"] }, nope: {} });
    expect(out.hero.headline).toBe("New");
    expect(out.hero.sub).toBe(PLATFORM_CONTENT_DEFAULTS.hero.sub);
    expect((out.hero as Record<string, unknown>).evil).toBeUndefined();
    expect(out.ai.items).toEqual([{ letter: "Z.", title: "T", body: "B", tag: "now" }]);
    expect(out.faq.items.length).toBe(6);
  });
  it("every meta field exists on the defaults", () => {
    for (const meta of PLATFORM_SECTION_META) {
      const section = PLATFORM_CONTENT_DEFAULTS[meta.key] as unknown as Record<string, unknown>;
      for (const f of meta.fields) expect(typeof section[f.key], `${meta.key}.${f.key}`).toBe("string");
      for (const l of meta.lists) expect(Array.isArray(section[l.key]), `${meta.key}.${l.key}`).toBe(true);
    }
  });
});
