import { describe, expect, it } from "vitest";
import { fetchLinkedInProfile, httpFailure, interpretSnapshot } from "./brightData";

const URL_ = "https://www.linkedin.com/in/danawhitfield/";
const json = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fetch stub answering the trigger, then each snapshot poll in turn. */
function stub(trigger: Response, ...polls: Response[]): typeof fetch {
  let i = 0;
  return (async (input: string | URL | Request) => (String(input).includes("/trigger") ? trigger : (polls[Math.min(i++, polls.length - 1)] ?? json(202, {})))) as typeof fetch;
}
const run = (f: typeof fetch) => fetchLinkedInProfile(URL_, { apiKey: "k", fetchImpl: f, pollIntervalMs: 1, pollAttempts: 3 });

describe("Bright Data client", () => {
  it("returns a real profile after polling past 202 and status objects", async () => {
    const out = await run(stub(json(200, { snapshot_id: "s_1" }), json(202, { status: "running" }), json(200, { status: "building" }), json(200, [{ name: "Dana", headline: "Fractional CMO", about: "I help founders grow.", connections: "500+", followers: 900 }])));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.source).toBe("brightdata");
      expect(out.profile).toMatchObject({ name: "Dana", connectionsCount: 500, followersCount: 900 });
    }
  });

  it("names an unconfigured key, a rejected key, an empty balance and rate limits", async () => {
    expect(await fetchLinkedInProfile(URL_, { apiKey: "" })).toMatchObject({ ok: false, message: "Bright Data is not configured", retryable: false });
    expect(await run(stub(json(401, "Unauthorized")))).toMatchObject({ ok: false, message: expect.stringContaining("rejected the API key"), retryable: false });
    expect(await run(stub(json(400, "Customer is not active")))).toMatchObject({ ok: false, message: expect.stringContaining("account is not active"), retryable: false });
    expect(httpFailure("start", 402, "")).toMatchObject({ message: expect.stringContaining("balance"), retryable: false });
    expect(httpFailure("status", 429, "")).toMatchObject({ retryable: true });
    expect(httpFailure("status", 503, "")).toMatchObject({ message: expect.stringContaining("unavailable"), retryable: true });
  });

  it("reports a private / missing profile from the provider's error record, with the snapshot id", async () => {
    const out = await run(stub(json(200, { snapshot_id: "s_2" }), json(200, [{ url: URL_, error: "Page does not exist", error_code: "dead_page" }])));
    expect(out).toMatchObject({ ok: false, message: "LinkedIn profile not found or not public", retryable: false });
    if (!out.ok) expect(out.details).toContain("s_2");
  });

  it("times out cleanly and surfaces network errors instead of substituting data", async () => {
    expect(await run(stub(json(200, { snapshot_id: "s_3" }), json(202, {})))).toMatchObject({ ok: false, message: "Request timed out", retryable: true });
    const boom = (async () => {
      throw new Error("getaddrinfo ENOTFOUND api.brightdata.com");
    }) as typeof fetch;
    expect(await run(boom)).toMatchObject({ ok: false, message: expect.stringContaining("Network"), details: expect.stringContaining("ENOTFOUND") });
    expect(interpretSnapshot([], URL_)).toMatchObject({ ok: false, message: "Bright Data returned no profile for this URL" });
    expect(interpretSnapshot({ status: "failed" }, URL_)).toMatchObject({ ok: false, retryable: true });
  });
});
