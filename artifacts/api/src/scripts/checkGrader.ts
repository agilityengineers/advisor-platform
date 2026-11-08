/**
 * Live Profile Grader check: fetch one real LinkedIn profile from Bright Data
 * and score it on the platform default rubric. No database, no demo fallback:
 * it either prints a real grade or the provider's failure and exits non-zero.
 *
 *   BRIGHTDATA_API_KEY=… pnpm --filter @workspace/api run grader:check https://www.linkedin.com/in/<handle>/
 */
import { GRADER_DEFAULT, normalizeLinkedinProfileUrl, scoreProfile } from "@workspace/shared";
import { BRIGHTDATA_DATASET_ID, fetchLinkedInProfile } from "../lib/brightData";

async function main(): Promise<number> {
  const input = process.argv[2] ?? "";
  const url = normalizeLinkedinProfileUrl(input);
  if (!url) {
    console.error(`Usage: grader:check <linkedin.com/in/… URL>${input ? ` (got "${input}")` : ""}`);
    return 2;
  }
  const apiKey = process.env.BRIGHTDATA_API_KEY ?? "";
  if (!apiKey) {
    console.error("BRIGHTDATA_API_KEY is not set — add it as a Secret first.");
    return 2;
  }
  console.log(`Fetching ${url} via Bright Data dataset ${BRIGHTDATA_DATASET_ID} (up to ~60 s)…`);
  const started = Date.now();
  const outcome = await fetchLinkedInProfile(url, { apiKey });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (!outcome.ok) {
    console.error(`FAILED after ${secs}s — ${outcome.message}\n  ${outcome.details}\n  retryable: ${outcome.retryable}`);
    return 1;
  }
  const s = scoreProfile(GRADER_DEFAULT, outcome.profile);
  console.log(`OK after ${secs}s — source: ${outcome.source}`);
  console.log(`  ${outcome.profile.name || "(no name)"} · ${outcome.profile.headline || "(no headline)"}`);
  console.log(`  connections ${outcome.profile.connectionsCount} · followers ${outcome.profile.followersCount} · skills ${outcome.profile.skillsCount} · about ${outcome.profile.aboutWordCount} words`);
  console.log(`  Grade ${s.grade} · ${s.pctTotal}% (${s.total}/${s.maxTotal}) · strongest: ${s.strongest?.name ?? "—"} · biggest gap: ${s.biggestGap?.name ?? "—"}`);
  return 0;
}

main().then((code) => process.exit(code), (err) => {
  console.error(err);
  process.exit(1);
});
