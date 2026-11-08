import { describe, expect, it } from "vitest";
import { extractPathSlug, extractSubdomain, isPlatformHost } from "./tenant";

describe("tenant helpers", () => {
  it("extracts a company subdomain only under the configured base", () => {
    expect(extractSubdomain("mytargetclient.advisor-platform.findabusinesspro.com", "advisor-platform.findabusinesspro.com")).toBe("mytargetclient");
    expect(extractSubdomain("www.advisor-platform.findabusinesspro.com", "advisor-platform.findabusinesspro.com")).toBeNull();
    expect(extractSubdomain("advisor-platform.findabusinesspro.com", "advisor-platform.findabusinesspro.com")).toBeNull();
    expect(extractSubdomain("a.b.advisor-platform.findabusinesspro.com", "advisor-platform.findabusinesspro.com")).toBeNull();
    expect(extractSubdomain("mytargetclient.com", "advisor-platform.findabusinesspro.com")).toBeNull();
  });
  it("extracts /t/:slug from page and api paths", () => {
    expect(extractPathSlug("/t/mytargetclient")).toBe("mytargetclient");
    expect(extractPathSlug("/t/MyTargetClient/pricing?x=1")).toBe("mytargetclient");
    expect(extractPathSlug("/api/t/northstar/leads")).toBe("northstar");
    expect(extractPathSlug("/tea/time")).toBeNull();
    expect(extractPathSlug("/admin")).toBeNull();
  });
  it("treats platform, localhost and replit hosts as the platform", () => {
    expect(isPlatformHost("advisor-platform.com")).toBe(true);
    expect(isPlatformHost("advisor-platform.authority-desk.com")).toBe(true);
    expect(isPlatformHost("localhost")).toBe(true);
    expect(isPlatformHost("something.replit.dev")).toBe(true);
    expect(isPlatformHost("mytargetclient.com")).toBe(false);
  });
});
