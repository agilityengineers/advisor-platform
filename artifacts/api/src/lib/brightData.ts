import { normalizeBrightDataProfile, type GraderProfile } from "@workspace/shared";

/**
 * Bright Data client for the Profile Grader: trigger the LinkedIn profile
 * dataset job, poll the snapshot every 2 s for up to 120 s. The caller
 * (lib/grader.ts) retries the whole fetch once when the failure is retryable.
 *
 * Deliberately free of `env` and the database so `scripts/checkGrader.ts` can
 * exercise the real provider with nothing but BRIGHTDATA_API_KEY set.
 *
 * Every failure carries a plain-English `message` (shown on the lead's
 * activity and in the drawer) and the provider's own words in `details`.
 * There is no fallback here: a failed fetch is a failed assessment, never
 * sample data.
 */
export const BRIGHTDATA_DATASET_ID = "gd_l1viktl72bvl7bjuj0";
const API = "https://api.brightdata.com/datasets/v3";
const POLL_INTERVAL_MS = 2000;
// A fresh collection (discover_new) was measured at ~66 s, so allow 2 minutes before calling it a timeout.
const POLL_ATTEMPTS = 60;

export type FetchFailure = { ok: false; message: string; details: string; retryable: boolean };
export type FetchOutcome = { ok: true; profile: GraderProfile; raw: Record<string, unknown>; source: "brightdata" | "sample" } | FetchFailure;

export interface FetchOptions {
  apiKey: string;
  pollIntervalMs?: number;
  pollAttempts?: number;
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clip = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Map a non-2xx Bright Data answer to something an owner can act on. */
export function httpFailure(stage: "start" | "status", status: number, body: string): FetchFailure {
  const details = `Bright Data ${stage === "start" ? "trigger" : "snapshot"} answered ${status}: ${clip(body) || "(empty body)"}`;
  if (status === 401 || status === 403) return { ok: false, message: "Bright Data rejected the API key (check BRIGHTDATA_API_KEY and its dataset permissions)", details, retryable: false };
  if (/customer is not active|account (is )?(not active|inactive|suspended)/i.test(body)) return { ok: false, message: "Bright Data account is not active (activate it or add billing in the Bright Data control panel)", details, retryable: false };
  if (status === 402) return { ok: false, message: "Bright Data account has no remaining balance", details, retryable: false };
  if (status === 404 && stage === "start") return { ok: false, message: "Bright Data dataset not found for this account", details, retryable: false };
  if (status === 429) return { ok: false, message: "Bright Data rate limit reached", details, retryable: true };
  if (status >= 500) return { ok: false, message: stage === "start" ? "Bright Data is unavailable (could not start the profile fetch)" : "Bright Data is unavailable (could not read the profile fetch)", details, retryable: true };
  return { ok: false, message: stage === "start" ? "Failed to start profile fetch" : "Error checking fetch status", details, retryable: false };
}

/**
 * Interpret a 200 snapshot body. Bright Data returns the profile record(s), a
 * status object while the snapshot is still building, or (with
 * include_errors=true) a record describing why the profile could not be read.
 */
export function interpretSnapshot(raw: unknown, linkedinUrl: string): FetchOutcome | "pending" {
  if (raw && !Array.isArray(raw) && typeof raw === "object") {
    const status = String((raw as Record<string, unknown>).status ?? "").toLowerCase();
    if (["running", "building", "starting", "collecting", "digesting"].includes(status)) return "pending";
    if (status === "failed" || status === "error") return { ok: false, message: "Bright Data could not collect the profile", details: clip(JSON.stringify(raw)), retryable: true };
  }
  const record = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
  if (!record || typeof record !== "object") return { ok: false, message: "Bright Data returned no profile for this URL", details: clip(JSON.stringify(raw) ?? "null"), retryable: false };
  if (record.error || record.errors || record.error_code) {
    const reason = String(record.error ?? record.error_code ?? JSON.stringify(record.errors));
    const unavailable = /not.?found|private|dead.?page|does not exist|unavailable|404/i.test(reason);
    return {
      ok: false,
      message: unavailable ? "LinkedIn profile not found or not public" : "Bright Data could not read this profile",
      details: clip(`${reason}${record.error_code && record.error ? ` (${String(record.error_code)})` : ""}`),
      retryable: false,
    };
  }
  const profile = normalizeBrightDataProfile(raw, linkedinUrl);
  if (!profile) return { ok: false, message: "Profile data could not be processed", details: `Bright Data returned ${clip(JSON.stringify(raw))}`, retryable: false };
  return { ok: true, profile, raw: trimRaw(record), source: "brightdata" };
}

export async function fetchLinkedInProfile(linkedinUrl: string, opts: FetchOptions): Promise<FetchOutcome> {
  const { apiKey, pollIntervalMs = POLL_INTERVAL_MS, pollAttempts = POLL_ATTEMPTS, fetchImpl = fetch } = opts;
  if (!apiKey) return { ok: false, message: "Bright Data is not configured", details: "BRIGHTDATA_API_KEY is unset", retryable: false };
  try {
    const trigger = await fetchImpl(`${API}/trigger?dataset_id=${BRIGHTDATA_DATASET_ID}&include_errors=true&discover_new=true`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify([{ url: linkedinUrl }]),
    });
    if (!trigger.ok) return httpFailure("start", trigger.status, await trigger.text());
    const snapshotId = ((await trigger.json()) as { snapshot_id?: string }).snapshot_id;
    if (!snapshotId) return { ok: false, message: "No snapshot id returned", details: "Bright Data answered without a snapshot_id", retryable: true };
    for (let attempt = 0; attempt < pollAttempts; attempt++) {
      await sleep(pollIntervalMs);
      const res = await fetchImpl(`${API}/snapshot/${snapshotId}?format=json`, { headers: { authorization: `Bearer ${apiKey}` } });
      if (res.status === 202) continue;
      if (res.status !== 200) return httpFailure("status", res.status, await res.text());
      const outcome = interpretSnapshot(await res.json(), linkedinUrl);
      if (outcome === "pending") continue;
      if (!outcome.ok) outcome.details = `${outcome.details} [snapshot ${snapshotId}]`;
      return outcome;
    }
    return {
      ok: false,
      message: "Request timed out",
      details: `Profile fetch did not complete within ${(pollAttempts * pollIntervalMs) / 1000} seconds (snapshot ${snapshotId}). The profile may be private or LinkedIn slow to respond.`,
      retryable: true,
    };
  } catch (err) {
    return { ok: false, message: "Network or system error reaching Bright Data", details: err instanceof Error ? err.message : String(err), retryable: true };
  }
}

/** Keep the snapshot small: scalar fields plus the counts; long arrays are summarised. */
function trimRaw(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (Array.isArray(v)) out[k] = { count: v.length };
    else if (typeof v === "string") out[k] = v.slice(0, 2000);
    else if (v === null || typeof v !== "object") out[k] = v;
  }
  return out;
}
