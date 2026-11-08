/**
 * Profile Grader — rubric + scoring engine.
 *
 * Ported from agilityengineers/LinkedIn-Profile-Grader `server/scoring.ts`
 * (hand-coded category evaluators) into the data-driven rubric shape of
 * design_handoff/grader.js, so each company Admin can tune weights,
 * thresholds, and recommendation copy, and publish versions.
 *
 * Every category: { key, name, group, weight, checks: [{ key, label, share, tiers: [{ min, pct, finding, rec }] }] }
 * A check's points = weight * share * tier.pct, where tier = first tier whose `min` <= value.
 */

export type RubricGroup = "Core" | "Additional";

export interface RubricTier {
  min: number;
  pct: number;
  finding?: string;
  rec?: string;
}

export interface RubricCheck {
  key: string;
  label: string;
  share: number;
  tiers: RubricTier[];
}

export interface RubricCategory {
  key: string;
  name: string;
  group: RubricGroup;
  weight: number;
  checks: RubricCheck[];
}

export interface RubricGrade {
  grade: string;
  label: string;
  min: number;
  message: string;
}

export interface RubricTip {
  key: string;
  label: string;
  max: number;
  text: string;
}

export interface Rubric {
  version: number;
  grades: RubricGrade[];
  categories: RubricCategory[];
  tips: RubricTip[];
}

/** Normalized profile metrics (Bright Data field shape, flattened). */
export interface GraderProfile {
  name?: string;
  headline?: string;
  about?: string;
  location?: string;
  profileUrl?: string;
  photoPresent: number;
  bannerPresent: number;
  connectionsCount: number;
  followersCount: number;
  recommendationsCount: number;
  /** 3 daily · 2 weekly · 1 monthly · 0 rare */
  activityScore: number;
  profileWordCount: number;
  aboutWordCount: number;
  projectsCount: number;
  certificationsCount: number;
  organizationsCount: number;
  coursesCount: number;
  honorsCount: number;
  publicationsCount: number;
  languagesCount: number;
  featuredCount: number;
  volunteerCount: number;
  /** 0–3: service + outcome language (3 = "I help" pattern + 2 outcome words) */
  serviceLanguageScore: number;
  /** 0–1: service vs accomplishment balance */
  balanceScore: number;
  skillsCount: number;
  groupsCount: number;
  [key: string]: string | number | undefined;
}

export const GRADER_DEFAULT: Rubric = {
  version: 1,
  grades: [
    { grade: "A", label: "Exceptional", min: 75, message: "Your profile is optimized for maximum visibility and impact." },
    { grade: "B", label: "Strong", min: 55, message: "You're ahead of most professionals. A few tweaks will make you stand out even more." },
    { grade: "C", label: "On Track", min: 40, message: "You have a solid foundation. Focus on the quick wins to level up." },
    { grade: "D", label: "Getting Started", min: 25, message: "You're just getting started. The recommendations will help you build momentum." },
    { grade: "F", label: "Needs Work", min: 0, message: "Every expert was once a beginner. Let's focus on the essentials first." },
  ],
  categories: [
    {
      key: "network", name: "Network & Followers", group: "Core", weight: 15,
      checks: [
        {
          key: "connectionsCount", label: "Connections", share: 0.6,
          tiers: [
            { min: 500, pct: 1, finding: "500+ connections — establishes credibility and network reach" },
            { min: 300, pct: 0.6, finding: "{v} connections — approaching credibility threshold", rec: "Build your network to 500+ connections. The '500+' badge signals professional credibility to profile visitors." },
            { min: 100, pct: 0.3, finding: "{v} connections — below professional threshold", rec: "Actively grow your network. Connect with colleagues, industry peers, and strategic contacts." },
            { min: 0, pct: 0, finding: "Only {v} connections — appears inactive or new", rec: "Critical: build your network immediately. Low connection counts signal inexperience or inactivity." },
          ],
        },
        {
          key: "followersCount", label: "Followers", share: 0.4,
          tiers: [
            { min: 5000, pct: 1, finding: "{v} followers — strong audience reach" },
            { min: 1000, pct: 0.7, finding: "{v} followers — growing audience", rec: "Keep building your follower base. Post valuable content regularly to attract followers beyond your connections." },
            { min: 500, pct: 0.4, finding: "{v} followers", rec: "Grow your followers by posting consistently." },
            { min: 1, pct: 0.2, finding: "{v} followers — limited audience reach" },
            { min: 0, pct: 0, finding: "No followers yet" },
          ],
        },
      ],
    },
    {
      key: "presence", name: "Professional Presence", group: "Core", weight: 15,
      checks: [
        { key: "photoPresent", label: "Photo", share: 0.35, tiers: [{ min: 1, pct: 1, finding: "Professional photo present" }, { min: 0, pct: 0, finding: "No profile photo", rec: "Add a professional headshot. Profiles with photos get 21× more views and 36× more messages." }] },
        { key: "bannerPresent", label: "Banner", share: 0.25, tiers: [{ min: 1, pct: 1, finding: "Custom banner image in place" }, { min: 0, pct: 0, finding: "Default banner", rec: "Add a custom banner that reflects your expertise or brand. This is prime visual real estate." }] },
        {
          key: "headlineLength", label: "Headline length", share: 0.25,
          tiers: [
            { min: 80, pct: 1, finding: "Headline uses available character space effectively" },
            { min: 40, pct: 0.6, finding: "Headline is {v} characters", rec: "Expand your headline. You have 220 characters — use them to say WHO you help and WHAT results you deliver." },
            { min: 0, pct: 0, finding: "Headline is only {v} characters", rec: "Your headline is too short. Use the full 220 characters for keywords and your value proposition." },
          ],
        },
        { key: "locationPresent", label: "Location", share: 0.15, tiers: [{ min: 1, pct: 1, finding: "Location is visible" }, { min: 0, pct: 0, finding: "No location", rec: "Add your location to improve local search visibility and trust." }] },
      ],
    },
    {
      key: "recommendations", name: "Recommendations & Social Proof", group: "Core", weight: 15,
      checks: [
        {
          key: "recommendationsCount", label: "Recommendations", share: 1,
          tiers: [
            { min: 10, pct: 1, finding: "Strong social proof with {v} recommendations" },
            { min: 5, pct: 0.7, finding: "{v} recommendations provide good credibility", rec: "Aim for one new recommendation a month. Ask recent clients while the work is fresh." },
            { min: 1, pct: 0.4, finding: "Only {v} recommendation(s) — limited social proof", rec: "Ask 3–5 satisfied clients or colleagues for recommendations this week." },
            { min: 0, pct: 0, finding: "No recommendations — missing crucial social proof", rec: "Critical: get recommendations immediately. Start by giving them — many reciprocate." },
          ],
        },
      ],
    },
    {
      key: "content", name: "Content & Activity", group: "Core", weight: 10,
      checks: [
        {
          key: "activityScore", label: "Posting frequency (3 daily · 2 weekly · 1 monthly · 0 rare)", share: 1,
          tiers: [
            { min: 3, pct: 1, finding: "Excellent posting frequency — high visibility" },
            { min: 2, pct: 0.7, finding: "Good posting cadence — consistent presence" },
            { min: 1, pct: 0.4, finding: "Infrequent posting — limited visibility", rec: "Increase posting to 2–3 times per week to stay visible in connections' feeds." },
            { min: 0, pct: 0.1, finding: "Rare or no posting activity", rec: "Start posting regularly. Even 1–2 posts a week dramatically increases visibility." },
          ],
        },
      ],
    },
    {
      key: "depth", name: "Profile Depth (Trust Scroll)", group: "Core", weight: 5,
      checks: [
        {
          key: "profileWordCount", label: "Total words", share: 0.6,
          tiers: [
            { min: 800, pct: 1, finding: "Comprehensive profile content ({v} words)" },
            { min: 500, pct: 0.67, finding: "Good content depth ({v} words)", rec: "Add more detail throughout. Visitors should scroll for 8+ seconds." },
            { min: 200, pct: 0.33, finding: "Profile is brief ({v} words)", rec: "Add comprehensive descriptions to experience, expand About, detail projects." },
            { min: 0, pct: 0, finding: "Profile lacks substance ({v} words)", rec: "Critical: add 500+ words across About, Experience, and Projects." },
          ],
        },
        {
          key: "aboutWordCount", label: "About words", share: 0.4,
          tiers: [
            { min: 300, pct: 1, finding: "About section has strong depth for storytelling" },
            { min: 150, pct: 0.6, finding: "About is {v} words", rec: "Expand About to 300+ words: your story, methodology, and social proof." },
            { min: 50, pct: 0.25, finding: "About is only {v} words", rec: "Your About is too short. Explain who you help, how, and why you're credible." },
            { min: 0, pct: 0, finding: "About is nearly empty", rec: "Write a comprehensive About section." },
          ],
        },
      ],
    },
    {
      key: "projects", name: "Projects", group: "Additional", weight: 12,
      checks: [
        {
          key: "projectsCount", label: "Projects", share: 1,
          tiers: [
            { min: 5, pct: 1, finding: "{v} projects showcased — excellent for keyword indexing" },
            { min: 3, pct: 0.7, finding: "{v} projects listed", rec: "Add more projects. Each one indexes additional skills and keywords." },
            { min: 1, pct: 0.4, finding: "{v} project(s) listed", rec: "Expand your Projects section." },
            { min: 0, pct: 0, finding: "No projects listed", rec: "Add projects — the most underused section for showcasing work and indexing keywords." },
          ],
        },
      ],
    },
    {
      key: "certifications", name: "Certifications & Licenses", group: "Additional", weight: 10,
      checks: [
        {
          key: "certificationsCount", label: "Certifications", share: 1,
          tiers: [
            { min: 5, pct: 1, finding: "{v} certifications demonstrate ongoing development" },
            { min: 3, pct: 0.7, finding: "{v} certifications listed", rec: "Add more certifications for keyword opportunities and expertise." },
            { min: 1, pct: 0.4, finding: "{v} certification(s) listed", rec: "Expand your certifications section." },
            { min: 0, pct: 0, finding: "No certifications listed", rec: "Add relevant certifications. Even free ones add credibility and search visibility." },
          ],
        },
      ],
    },
    {
      key: "sections", name: "Additional Sections", group: "Additional", weight: 10,
      checks: [
        { key: "organizationsCount", label: "Organizations", share: 0.15, tiers: [{ min: 1, pct: 1, finding: "Organizations populated" }, { min: 0, pct: 0, finding: "No organizations", rec: "Add Organizations." }] },
        { key: "coursesCount", label: "Courses", share: 0.1, tiers: [{ min: 1, pct: 1, finding: "Courses populated" }, { min: 0, pct: 0, finding: "No courses", rec: "Add Courses." }] },
        { key: "honorsCount", label: "Honors & Awards", share: 0.15, tiers: [{ min: 1, pct: 1, finding: "Honors populated" }, { min: 0, pct: 0, finding: "No honors", rec: "Add Honors & Awards." }] },
        { key: "publicationsCount", label: "Publications", share: 0.15, tiers: [{ min: 1, pct: 1, finding: "Publications populated" }, { min: 0, pct: 0, finding: "No publications", rec: "Add Publications." }] },
        { key: "languagesCount", label: "Languages", share: 0.15, tiers: [{ min: 1, pct: 1, finding: "Languages populated" }, { min: 0, pct: 0, finding: "No languages", rec: "Add Languages." }] },
        { key: "featuredCount", label: "Featured", share: 0.15, tiers: [{ min: 1, pct: 1, finding: "Featured section highlights key content" }, { min: 0, pct: 0, finding: "No Featured section", rec: "Add a Featured section with your best proof and a clear next step." }] },
        { key: "volunteerCount", label: "Volunteer", share: 0.15, tiers: [{ min: 1, pct: 1, finding: "Volunteer experience populated" }, { min: 0, pct: 0, finding: "No volunteer experience", rec: "Add Volunteer experience." }] },
      ],
    },
    {
      key: "value", name: "Value & Service Focus", group: "Additional", weight: 8,
      checks: [
        {
          key: "serviceLanguageScore", label: "Service + outcome language (0–3)", share: 0.6,
          tiers: [
            { min: 3, pct: 1, finding: "Profile clearly says who you help and what outcomes you deliver" },
            { min: 2, pct: 0.6, finding: "Mentions services but light on client outcomes", rec: "Lead with 'I help [audience] achieve [outcome]' in your headline and About." },
            { min: 0, pct: 0, finding: "Accomplishment-heavy, not service-focused", rec: "Reframe around who you help and the transformation you provide." },
          ],
        },
        {
          key: "balanceScore", label: "Service vs. accomplishment balance (0–1)", share: 0.4,
          tiers: [
            { min: 1, pct: 1, finding: "Good balance of service focus and outcome language" },
            { min: 0, pct: 0, finding: "Accomplishments outweigh service language", rec: "Visitors care how you can help THEM. Lead with benefits; add accomplishments as proof." },
          ],
        },
      ],
    },
  ],
  tips: [
    { key: "skillsCount", label: "Skills", max: 100, text: "LinkedIn allows up to 100 skills — each is a potential search keyword match. You have {v}." },
    { key: "groupsCount", label: "Groups", max: 100, text: "You can join up to 100 LinkedIn groups for reach and networking. You're in {v}." },
  ],
};

/** Sample profile for the demo scorer (Bright Data field shape, normalized). */
export const GRADER_SAMPLE: GraderProfile = {
  name: "Dana Whitfield",
  headline: "Senior Director, Global Events & Field Marketing | Operations",
  location: "Chicago, IL",
  photoPresent: 1,
  bannerPresent: 0,
  connectionsCount: 1240,
  followersCount: 1310,
  recommendationsCount: 3,
  activityScore: 1,
  profileWordCount: 410,
  aboutWordCount: 120,
  projectsCount: 0,
  certificationsCount: 2,
  organizationsCount: 1,
  coursesCount: 0,
  honorsCount: 1,
  publicationsCount: 0,
  languagesCount: 1,
  featuredCount: 0,
  volunteerCount: 0,
  serviceLanguageScore: 1,
  balanceScore: 0,
  skillsCount: 38,
  groupsCount: 6,
};

export type CategoryStatus = "excellent" | "good" | "needs_work" | "critical";

export interface ScoredRecommendation {
  text: string;
  check: string;
}

export interface ScoredCategory {
  key: string;
  name: string;
  group: RubricGroup;
  score: number;
  max: number;
  pct: number;
  status: CategoryStatus;
  findings: string[];
  recs: ScoredRecommendation[];
}

export interface PrioritizedRecommendation {
  action: string;
  category: string;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  priority: number;
}

export interface ScoredTip {
  label: string;
  text: string;
}

export interface GraderResult {
  total: number;
  maxTotal: number;
  pctTotal: number;
  grade: string;
  gradeLabel: string;
  gradeMessage: string;
  categories: ScoredCategory[];
  quickWins: PrioritizedRecommendation[];
  immediate: PrioritizedRecommendation[];
  shortTerm: PrioritizedRecommendation[];
  ongoing: PrioritizedRecommendation[];
  tips: ScoredTip[];
  coreScore: number;
  coreMax: number;
  additionalScore: number;
  additionalMax: number;
  strongest: { name: string; pct: number } | null;
  biggestGap: { name: string; pct: number } | null;
  rubricVersion: number;
}

function fmt(s: string | undefined, v: number): string {
  return (s ?? "").replace(/\{v\}/g, Number.isFinite(v) ? v.toLocaleString("en-US") : String(v));
}

export function categoryStatus(pct: number): CategoryStatus {
  return pct >= 0.8 ? "excellent" : pct >= 0.6 ? "good" : pct >= 0.4 ? "needs_work" : "critical";
}

/** Effort heuristic from the source repo's generateRecommendations. */
function estimateEffort(text: string): "low" | "medium" | "high" {
  const t = text.toLowerCase();
  if (/photo|banner|location|join|url/.test(t)) return "low";
  if (/about|experience|comprehensive|reframe/.test(t)) return "high";
  return "medium";
}

/**
 * Score a normalized profile against a rubric. Pure and deterministic —
 * identical to GRADER_score in grader.js, with the derived fields
 * `headlineLength` and `locationPresent` computed here.
 */
export function scoreProfile(rubric: Rubric, p: GraderProfile): GraderResult {
  const profile: Record<string, string | number | undefined> = {
    ...p,
    headlineLength: (p.headline ?? "").length,
    locationPresent: p.location ? 1 : 0,
  };

  const categories: ScoredCategory[] = rubric.categories.map((cat) => {
    let score = 0;
    const findings: string[] = [];
    const recs: ScoredRecommendation[] = [];
    for (const ch of cat.checks) {
      const v = Number(profile[ch.key] ?? 0) || 0;
      const sorted = [...ch.tiers].sort((a, b) => b.min - a.min);
      const tier = sorted.find((t) => v >= t.min) ?? sorted[sorted.length - 1];
      if (!tier) continue;
      score += cat.weight * ch.share * tier.pct;
      if (tier.finding) findings.push(fmt(tier.finding, v));
      if (tier.rec) recs.push({ text: fmt(tier.rec, v), check: ch.label });
    }
    score = Math.round(score);
    const pct = cat.weight ? score / cat.weight : 0;
    return { key: cat.key, name: cat.name, group: cat.group, score, max: cat.weight, pct, status: categoryStatus(pct), findings, recs };
  });

  const total = categories.reduce((s, c) => s + c.score, 0);
  const maxTotal = categories.reduce((s, c) => s + c.max, 0);
  const pctTotal = maxTotal ? Math.round((total / maxTotal) * 100) : 0;
  const grades = [...rubric.grades].sort((a, b) => b.min - a.min);
  const g = grades.find((x) => pctTotal >= x.min) ?? grades[grades.length - 1] ?? { grade: "F", label: "Needs Work", min: 0, message: "" };

  // Prioritized recs: lower-scoring categories first.
  const all: PrioritizedRecommendation[] = [];
  categories.forEach((c) =>
    c.recs.forEach((r, i) => {
      const impact: PrioritizedRecommendation["impact"] = c.pct < 0.3 ? "high" : c.pct < 0.6 ? "medium" : "low";
      all.push({ action: r.text, category: c.name, impact, effort: estimateEffort(r.text), priority: c.pct * 10 + i });
    }),
  );
  all.sort((a, b) => a.priority - b.priority);

  const tips: ScoredTip[] = (rubric.tips ?? [])
    .map((t) => {
      const v = Number(profile[t.key] ?? 0) || 0;
      return { label: t.label, text: fmt(t.text, v), done: v >= t.max };
    })
    .filter((t) => !t.done)
    .map(({ label, text }) => ({ label, text }));

  const core = categories.filter((c) => c.group === "Core");
  const additional = categories.filter((c) => c.group === "Additional");
  const byPct = [...categories].sort((a, b) => b.pct - a.pct);
  const strongest = byPct[0] ? { name: byPct[0].name, pct: byPct[0].pct } : null;
  const weakest = byPct[byPct.length - 1];
  const biggestGap = weakest ? { name: weakest.name, pct: weakest.pct } : null;

  return {
    total,
    maxTotal,
    pctTotal,
    grade: g.grade,
    gradeLabel: g.label,
    gradeMessage: g.message,
    categories,
    quickWins: all.filter((r) => r.impact === "high" && r.effort === "low").slice(0, 3),
    immediate: all.slice(0, 5),
    shortTerm: all.slice(5, 10),
    ongoing: all.slice(10, 15),
    tips,
    coreScore: core.reduce((s, c) => s + c.score, 0),
    coreMax: core.reduce((s, c) => s + c.max, 0),
    additionalScore: additional.reduce((s, c) => s + c.score, 0),
    additionalMax: additional.reduce((s, c) => s + c.max, 0),
    strongest,
    biggestGap,
    rubricVersion: rubric.version,
  };
}

export interface RubricProblem {
  path: string;
  message: string;
}

/**
 * Structural validation for the rubric editor: weights must total 100,
 * check shares must total 1 per category (±0.01), tiers need a min-0 floor,
 * grades must include a 0 floor and be unique.
 */
export function validateRubric(rubric: Rubric): RubricProblem[] {
  const problems: RubricProblem[] = [];
  if (!Array.isArray(rubric.categories) || rubric.categories.length === 0) {
    problems.push({ path: "categories", message: "At least one category is required." });
    return problems;
  }
  const totalWeight = rubric.categories.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  if (Math.round(totalWeight) !== 100) problems.push({ path: "categories", message: `Category weights must total 100 (currently ${totalWeight}).` });

  const seenCat = new Set<string>();
  rubric.categories.forEach((c, ci) => {
    if (!c.key) problems.push({ path: `categories[${ci}].key`, message: "Category key is required." });
    if (seenCat.has(c.key)) problems.push({ path: `categories[${ci}].key`, message: `Duplicate category key "${c.key}".` });
    seenCat.add(c.key);
    if (!c.name) problems.push({ path: `categories[${ci}].name`, message: "Category name is required." });
    if (c.group !== "Core" && c.group !== "Additional") problems.push({ path: `categories[${ci}].group`, message: "Group must be Core or Additional." });
    if (!(Number(c.weight) > 0)) problems.push({ path: `categories[${ci}].weight`, message: "Weight must be greater than 0." });
    if (!Array.isArray(c.checks) || c.checks.length === 0) {
      problems.push({ path: `categories[${ci}].checks`, message: "Each category needs at least one check." });
      return;
    }
    const shareTotal = c.checks.reduce((s, ch) => s + (Number(ch.share) || 0), 0);
    if (Math.abs(shareTotal - 1) > 0.011) problems.push({ path: `categories[${ci}].checks`, message: `Check shares in "${c.name}" must total 1.00 (currently ${shareTotal.toFixed(2)}).` });
    c.checks.forEach((ch, ki) => {
      if (!ch.key) problems.push({ path: `categories[${ci}].checks[${ki}].key`, message: "Check key is required." });
      if (!Array.isArray(ch.tiers) || ch.tiers.length === 0) {
        problems.push({ path: `categories[${ci}].checks[${ki}].tiers`, message: "Each check needs at least one tier." });
        return;
      }
      if (!ch.tiers.some((t) => Number(t.min) === 0)) problems.push({ path: `categories[${ci}].checks[${ki}].tiers`, message: `Check "${ch.label}" needs a tier with threshold 0.` });
      ch.tiers.forEach((t, ti) => {
        if (!(Number(t.pct) >= 0 && Number(t.pct) <= 1)) problems.push({ path: `categories[${ci}].checks[${ki}].tiers[${ti}].pct`, message: "% earned must be between 0 and 1." });
        if (!(Number(t.min) >= 0)) problems.push({ path: `categories[${ci}].checks[${ki}].tiers[${ti}].min`, message: "Threshold must be 0 or more." });
      });
    });
  });

  if (!Array.isArray(rubric.grades) || rubric.grades.length === 0) problems.push({ path: "grades", message: "At least one grade is required." });
  else {
    if (!rubric.grades.some((g) => Number(g.min) === 0)) problems.push({ path: "grades", message: "One grade must start at 0." });
    const seen = new Set<string>();
    rubric.grades.forEach((g, gi) => {
      if (seen.has(g.grade)) problems.push({ path: `grades[${gi}]`, message: `Duplicate grade "${g.grade}".` });
      seen.add(g.grade);
    });
  }
  return problems;
}

/** Map the source repo's activity frequency onto the rubric's 0–3 score. */
export function activityScoreFrom(frequency: "daily" | "weekly" | "monthly" | "rare" | string | undefined): number {
  switch (frequency) {
    case "daily": return 3;
    case "weekly": return 2;
    case "monthly": return 1;
    default: return 0;
  }
}

const SERVICE_KEYWORDS = ["help", "helping", "work with", "partner with", "specialize in", "offer", "provide", "deliver", "serve", "support", "guide", "coach", "consult", "advise"];
const OUTCOME_KEYWORDS = ["grow", "scale", "increase", "improve", "transform", "achieve", "build", "create", "develop", "solve", "fix", "optimize", "maximize", "accelerate"];
const ACCOMPLISHMENT_KEYWORDS = ["awarded", "recognized", "achieved", "graduated", "promoted", "won", "led", "managed", "responsible for", "in charge of"];

/**
 * Derive the two Value & Service Focus inputs from headline + about text,
 * mirroring evaluateValueFocus in the source repo:
 *   serviceLanguageScore: 3 = "I help" pattern + ≥2 outcome words · 2 = ≥2 service words · 0 otherwise
 *   balanceScore:         1 = service ≥2 and outcome ≥2 and not accomplishment-heavy · 0 otherwise
 */
export function deriveValueScores(headline: string | undefined, about: string | undefined): { serviceLanguageScore: number; balanceScore: number } {
  const text = `${(headline ?? "").toLowerCase()} ${(about ?? "").toLowerCase()}`;
  const serviceCount = SERVICE_KEYWORDS.filter((kw) => text.includes(kw)).length;
  const outcomeCount = OUTCOME_KEYWORDS.filter((kw) => text.includes(kw)).length;
  const accomplishmentCount = ACCOMPLISHMENT_KEYWORDS.filter((kw) => text.includes(kw)).length;
  const hasHelpPattern = /i help|helping|we help/.test(text);
  const serviceLanguageScore = hasHelpPattern && outcomeCount >= 2 ? 3 : serviceCount >= 2 ? 2 : 0;
  const balanceScore = accomplishmentCount > serviceCount + outcomeCount ? 0 : serviceCount >= 2 && outcomeCount >= 2 ? 1 : 0;
  return { serviceLanguageScore, balanceScore };
}
