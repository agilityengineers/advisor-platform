import { activityScoreFrom, deriveValueScores, type GraderProfile } from "./grader";

/**
 * Bright Data → GraderProfile. A faithful port of `normalizeBrightDataResponse`
 * in LinkedIn-Profile-Grader/server/routes.ts (dataset gd_l1viktl72bvl7bjuj0):
 * the same field-name fallbacks, the same counting rules, the same activity
 * buckets (8+ posts daily · 4+ weekly · 2+ monthly · else rare) — flattened into
 * the metrics the rubric scores, with the Value & Service inputs derived from
 * headline + About the way the source repo's evaluateValueFocus did.
 */

type Raw = Record<string, unknown>;
const arr = (v: unknown): Raw[] | string[] => (Array.isArray(v) ? (v as Raw[] | string[]) : []);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const words = (s: string): number => s.split(/\s+/).filter((w) => w.length > 0).length;

function names(list: unknown, ...keys: string[]): string[] {
  const out: string[] = [];
  for (const item of arr(list)) {
    if (typeof item === "string") {
      if (item) out.push(item);
      continue;
    }
    for (const k of keys) {
      const v = (item as Raw)[k];
      if (typeof v === "string" && v) {
        out.push(v);
        break;
      }
    }
    if (!keys.some((k) => typeof (item as Raw)[k] === "string") && Object.keys(item as Raw).length) out.push("");
  }
  return out;
}

function parseCount(value: unknown, plusDefault = 500): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    if (value.includes("+")) return parseInt(value.replace(/\D/g, ""), 10) || plusDefault;
    return parseInt(value.replace(/,/g, ""), 10) || 0;
  }
  return 0;
}

export interface BrightDataNormalized extends GraderProfile {
  postsCount: number;
  activityFrequency: "daily" | "weekly" | "monthly" | "rare";
  hasCleanUrl: number;
  hasSchedulingLinks: number;
  hasCLevelTitle: number;
  hasContactInfo: number;
}

/** Null when the snapshot carries an error instead of a profile. */
export function normalizeBrightDataProfile(data: unknown, linkedinUrl: string): BrightDataNormalized | null {
  const profile = (Array.isArray(data) ? data[0] : data) as Raw | undefined;
  if (!profile || typeof profile !== "object" || profile.error || profile.errors) return null;

  const skills = names(profile.skills ?? profile.member_skills, "name", "skill").filter(Boolean);
  const experiences = arr(profile.experience ?? profile.positions) as Raw[];
  const recommendations = arr(profile.recommendations ?? profile.recommendations_received);
  const projects = arr(profile.projects);
  const groups = names(profile.groups ?? profile.member_groups ?? profile.group_memberships, "name", "group_name", "title").filter(Boolean);
  const certifications = names(profile.certifications ?? profile.licenses, "name", "title").filter(Boolean);
  const organizations = arr(profile.organizations ?? profile.volunteer_experience ?? profile.causes);
  const courses = arr(profile.courses);
  const honors = arr(profile.honors_and_awards ?? profile.honors ?? profile.awards);
  const publications = arr(profile.publications);
  const languages = arr(profile.languages);
  const featured = arr(profile.featured ?? profile.featured_items);
  const volunteer = arr(profile.volunteer ?? profile.volunteer_experience ?? profile.volunteering);

  const postsData = profile.posts ?? profile.activity ?? [];
  const postsCount = typeof profile.posts === "number" ? profile.posts : Array.isArray(postsData) ? postsData.length : 0;
  const activityFrequency: BrightDataNormalized["activityFrequency"] = postsCount >= 8 ? "daily" : postsCount >= 4 ? "weekly" : postsCount >= 2 ? "monthly" : "rare";

  const urlPath = linkedinUrl.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "").replace(/\/$/, "");
  const hasCleanUrl = !/[0-9]{4,}/.test(urlPath) && !/[a-f0-9]{8,}/i.test(urlPath);

  const about = str(profile.about);
  const headline = str(profile.position ?? profile.headline);
  const combined = `${about} ${headline}`.toLowerCase();
  const hasSchedulingLinks = /calendly|acuity|hubspot\.meeting|book.*call|schedule.*meeting|booking\.page|cal\.com|tidycal|savvycal/.test(combined);
  const hasCLevelTitle = /\bceo\b|\bcfo\b|\bcto\b|\bcoo\b|\bcmo\b|\bchief\b/i.test(headline);

  const aboutWordCount = words(about);
  let profileWordCount = aboutWordCount;
  for (const exp of experiences) profileWordCount += words(str(exp.description));

  const { serviceLanguageScore, balanceScore } = deriveValueScores(headline, about);
  const city = str(profile.city);
  const location = city ? `${city}, ${str(profile.country_code)}`.trim().replace(/,$/, "") : str(profile.location ?? profile.country_code);

  return {
    name: str(profile.name),
    headline,
    about,
    location,
    profileUrl: linkedinUrl,
    photoPresent: profile.avatar || profile.profile_image || profile.photo_url || profile.profile_photo_url ? 1 : 0,
    bannerPresent: profile.banner_image || profile.background_image || profile.background_cover_image_url ? 1 : 0,
    connectionsCount: parseCount(profile.connections),
    followersCount: parseCount(profile.followers, 0),
    recommendationsCount: typeof profile.recommendations_count === "number" ? profile.recommendations_count : recommendations.length,
    activityScore: activityScoreFrom(activityFrequency),
    profileWordCount,
    aboutWordCount,
    projectsCount: projects.length,
    certificationsCount: certifications.length,
    organizationsCount: organizations.length,
    coursesCount: courses.length,
    honorsCount: honors.length,
    publicationsCount: publications.length,
    languagesCount: languages.length,
    featuredCount: featured.length,
    volunteerCount: volunteer.length,
    serviceLanguageScore,
    balanceScore,
    skillsCount: skills.length,
    groupsCount: groups.length,
    postsCount,
    activityFrequency,
    hasCleanUrl: hasCleanUrl ? 1 : 0,
    hasSchedulingLinks: hasSchedulingLinks ? 1 : 0,
    hasCLevelTitle: hasCLevelTitle ? 1 : 0,
    hasContactInfo: profile.email || profile.phone || profile.contact_info ? 1 : 0,
  };
}

/** The public URL forms Bright Data accepts; anything else is refused before a job is paid for. */
export function normalizeLinkedinProfileUrl(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/(in|pub)\/([^/?#]+)/i);
    if (!m) return null;
    return `https://www.linkedin.com/${m[1].toLowerCase()}/${m[2]}/`;
  } catch {
    return null;
  }
}
