import { describe, expect, it } from "vitest";
import { GRADER_DEFAULT, GRADER_SAMPLE, scoreProfile, validateRubric, deriveValueScores, activityScoreFrom } from "./grader";

describe("scoreProfile", () => {
  it("scores the sample profile the same way the prototype does", () => {
    const r = scoreProfile(GRADER_DEFAULT, GRADER_SAMPLE);
    // network: 15*(0.6*1 + 0.4*0.7)=13.2→13 · presence: headline 61 chars → 15*(0.35+0+0.25*0.6+0.15)=9.75→10
    // recs: 15*0.4=6 · content: 10*0.4=4 · depth: 5*(0.6*0.33+0.4*0.25)=1.49→1
    // projects 0 · certs 12*... no: certs 10*0.4=4 · sections 10*(0.15+0.15+0.15)=4.5→5 · value 8*(0.6*0 + 0)=0
    expect(r.categories.map((c) => [c.key, c.score])).toEqual([
      ["network", 13],
      ["presence", 10],
      ["recommendations", 6],
      ["content", 4],
      ["depth", 1],
      ["projects", 0],
      ["certifications", 4],
      ["sections", 5],
      ["value", 0],
    ]);
    expect(r.total).toBe(43);
    expect(r.maxTotal).toBe(100);
    expect(r.pctTotal).toBe(43);
    expect(r.grade).toBe("C");
    expect(r.gradeLabel).toBe("On Track");
    expect(r.coreMax).toBe(60);
    expect(r.additionalMax).toBe(40);
    expect(r.strongest?.name).toBe("Network & Followers");
    expect(r.biggestGap?.pct).toBe(0);
    expect(r.tips.map((t) => t.label)).toEqual(["Skills", "Groups"]);
    expect(r.tips[0].text).toContain("38");
  });

  it("gives an A to a complete profile and an F to an empty one", () => {
    const full = scoreProfile(GRADER_DEFAULT, {
      headline: "x".repeat(100), location: "NYC", photoPresent: 1, bannerPresent: 1, connectionsCount: 900, followersCount: 6000,
      recommendationsCount: 12, activityScore: 3, profileWordCount: 1000, aboutWordCount: 400, projectsCount: 6, certificationsCount: 6,
      organizationsCount: 1, coursesCount: 1, honorsCount: 1, publicationsCount: 1, languagesCount: 1, featuredCount: 1, volunteerCount: 1,
      serviceLanguageScore: 3, balanceScore: 1, skillsCount: 100, groupsCount: 100,
    });
    expect(full.total).toBe(100);
    expect(full.grade).toBe("A");
    expect(full.tips).toEqual([]);
    expect(full.immediate).toEqual([]);

    const empty = scoreProfile(GRADER_DEFAULT, {
      photoPresent: 0, bannerPresent: 0, connectionsCount: 0, followersCount: 0, recommendationsCount: 0, activityScore: 0, profileWordCount: 0,
      aboutWordCount: 0, projectsCount: 0, certificationsCount: 0, organizationsCount: 0, coursesCount: 0, honorsCount: 0, publicationsCount: 0,
      languagesCount: 0, featuredCount: 0, volunteerCount: 0, serviceLanguageScore: 0, balanceScore: 0, skillsCount: 0, groupsCount: 0,
    });
    expect(empty.grade).toBe("F");
    expect(empty.total).toBe(1); // content floor: 10 * 0.1
    expect(empty.quickWins.length).toBeGreaterThan(0);
    expect(empty.quickWins.every((q) => q.impact === "high" && q.effort === "low")).toBe(true);
  });

  it("formats {v} with thousands separators", () => {
    const r = scoreProfile(GRADER_DEFAULT, { ...GRADER_SAMPLE, followersCount: 1310 });
    expect(r.categories[0].findings[1]).toBe("1,310 followers — growing audience");
  });
});

describe("validateRubric", () => {
  it("accepts the default rubric", () => {
    expect(validateRubric(GRADER_DEFAULT)).toEqual([]);
  });
  it("flags weights that do not total 100 and shares that do not total 1", () => {
    const bad = structuredClone(GRADER_DEFAULT);
    bad.categories[0].weight = 20;
    bad.categories[1].checks[0].share = 0.5;
    const problems = validateRubric(bad);
    expect(problems.some((p) => p.message.includes("total 100"))).toBe(true);
    expect(problems.some((p) => p.message.includes("total 1.00"))).toBe(true);
  });
});

describe("derived inputs", () => {
  it("maps activity frequency", () => {
    expect(activityScoreFrom("daily")).toBe(3);
    expect(activityScoreFrom("weekly")).toBe(2);
    expect(activityScoreFrom("monthly")).toBe(1);
    expect(activityScoreFrom("rare")).toBe(0);
  });
  it("detects service and outcome language like the source scorer", () => {
    expect(deriveValueScores("I help founders grow and scale", "We deliver and support teams to improve results")).toEqual({ serviceLanguageScore: 3, balanceScore: 1 });
    expect(deriveValueScores("Awarded, recognized, promoted leader", "Led teams and managed budgets")).toEqual({ serviceLanguageScore: 0, balanceScore: 0 });
  });
});
