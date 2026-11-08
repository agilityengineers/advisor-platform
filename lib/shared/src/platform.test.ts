import { describe, expect, it } from "vitest";
import { DEFAULT_PLANS, effectiveFeatures, featureSources, hasPermission, normalizePerms, plansWithFeature, FEATURE_KEYS } from "./platform";

const plan = (key: string) => DEFAULT_PLANS.find((p) => p.key === key)!;

describe("effectiveFeatures", () => {
  it("uses plan keys when there are no overrides", () => {
    const f = effectiveFeatures(plan("starter").featureKeys, {});
    expect(f.website_cms).toBe(true);
    expect(f.sendgrid).toBe(false);
    expect(f.white_label).toBe(false);
  });
  it("lets super-admin overrides win in both directions", () => {
    const f = effectiveFeatures(plan("white_label").featureKeys, { authority_desk: true, twilio_sms: false });
    expect(f.authority_desk).toBe(true);
    expect(f.twilio_sms).toBe(false);
    expect(featureSources(plan("white_label").featureKeys, { authority_desk: true }).authority_desk).toEqual({ enabled: true, source: "override_on", inPlan: false });
  });
  it("enterprise has every feature", () => {
    expect(plan("enterprise").featureKeys).toHaveLength(FEATURE_KEYS.length);
  });
  it("lists plans that include a feature, lowest first", () => {
    expect(plansWithFeature(DEFAULT_PLANS, "sendgrid").map((p) => p.key)).toEqual(["professional", "white_label", "enterprise"]);
  });
});

describe("permissions", () => {
  it("admins have write everywhere; clients nothing", () => {
    expect(hasPermission({ role: "admin" }, "team", "write")).toBe(true);
    expect(hasPermission({ role: "client", perms: { clients: "write" } }, "clients")).toBe(false);
  });
  it("managers and advisors follow their grid", () => {
    const perms = normalizePerms({ website: "read", bogus: "write" }, "manager");
    expect(perms.website).toBe("read");
    expect((perms as Record<string, unknown>).bogus).toBeUndefined();
    expect(hasPermission({ role: "manager", perms }, "website", "read")).toBe(true);
    expect(hasPermission({ role: "manager", perms }, "website", "write")).toBe(false);
    expect(hasPermission({ role: "advisor", perms: normalizePerms(undefined, "advisor") }, "website")).toBe(false);
  });
});
