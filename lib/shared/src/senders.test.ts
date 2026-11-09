import { describe, expect, it } from "vitest";
import { defaultNoReplyAddress, emailDomain, resolveSenders, senderFooter, validateSenderConfig } from "./senders";

const mtc = { name: "My Target Client", ownerName: "Brian Traichel" };

describe("white-label senders", () => {
  it("resolves a personal and a system identity on the company domain", () => {
    const s = resolveSenders({ fromName: "Brian Traichel", fromAddress: "brian@mytargetclient.com", noReplyName: "My Target Client", noReplyAddress: "no-reply@mytargetclient.com" }, mtc);
    expect(s.personal).toEqual({ email: "brian@mytargetclient.com", name: "Brian Traichel" });
    expect(s.system).toEqual({ email: "no-reply@mytargetclient.com", name: "My Target Client" });
  });

  it("derives no-reply@ from the personal address when none is given", () => {
    const s = resolveSenders({ fromAddress: "Brian@MyTargetClient.com" }, mtc);
    expect(s.personal).toEqual({ email: "brian@mytargetclient.com", name: "Brian Traichel" });
    expect(s.system).toEqual({ email: "no-reply@mytargetclient.com", name: "My Target Client" });
    expect(defaultNoReplyAddress("not an email")).toBeNull();
  });

  it("falls back to the company name when there is no owner name", () => {
    const s = resolveSenders({ fromAddress: "hello@acme.com" }, { name: "Acme", ownerName: "" });
    expect(s.personal?.name).toBe("Acme");
  });

  it("returns nulls when no usable address is configured", () => {
    expect(resolveSenders({}, mtc)).toEqual({ personal: null, system: null });
    expect(resolveSenders({ fromAddress: "nope" }, mtc)).toEqual({ personal: null, system: null });
  });

  it("keeps a system sender even without a personal address", () => {
    const s = resolveSenders({ noReplyAddress: "no-reply@mytargetclient.com" }, mtc);
    expect(s.personal).toBeNull();
    expect(s.system?.email).toBe("no-reply@mytargetclient.com");
  });

  it("validates addresses and requires a shared sending domain", () => {
    expect(validateSenderConfig({ fromAddress: "brian@mytargetclient.com", noReplyAddress: "no-reply@mytargetclient.com" })).toBeNull();
    expect(validateSenderConfig({ fromAddress: "brian@mytargetclient.com", noReplyAddress: "no-reply@mail.mytargetclient.com" })).toBeNull();
    expect(validateSenderConfig({ fromAddress: "brian@mytargetclient.com", noReplyAddress: "no-reply@gmail.com" })).toContain("same domain");
    expect(validateSenderConfig({ fromAddress: "brian" })).toContain("not a valid");
    expect(validateSenderConfig({ noReplyAddress: "no-reply@" })).toContain("not a valid");
    expect(validateSenderConfig({})).toBeNull();
    expect(emailDomain("x@Example.COM")).toBe("example.com");
  });

  it("tells the reader whether a reply reaches anyone", () => {
    expect(senderFooter("personal", "MTC", "Brian")).toContain("reach Brian directly");
    expect(senderFooter("system", "MTC")).toContain("not monitored");
  });
});
