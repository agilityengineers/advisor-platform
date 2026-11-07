// Profile Grader rubric — ported from agilityengineers/LinkedIn-Profile-Grader (server/scoring.ts) and made data-driven
// so each company Admin can tune weights, thresholds, and recommendation copy. Production: grader_rubrics (per company, versioned).
// Every category: { key, name, weight, checks: [{ key, label, share, kind, tiers: [{ min, pct, finding, rec }] }] }
// A check's points = weight * share * tier.pct, where tier = first tier whose `min` <= value.
window.GRADER_DEFAULT = {
  version: 1,
  grades: [
    { grade: "A", label: "Exceptional", min: 75, message: "Your profile is optimized for maximum visibility and impact." },
    { grade: "B", label: "Strong", min: 55, message: "You're ahead of most professionals. A few tweaks will make you stand out even more." },
    { grade: "C", label: "On Track", min: 40, message: "You have a solid foundation. Focus on the quick wins to level up." },
    { grade: "D", label: "Getting Started", min: 25, message: "You're just getting started. The recommendations will help you build momentum." },
    { grade: "F", label: "Needs Work", min: 0, message: "Every expert was once a beginner. Let's focus on the essentials first." }
  ],
  categories: [
    { key: "network", name: "Network & Followers", group: "Core", weight: 15, checks: [
      { key: "connectionsCount", label: "Connections", share: 0.6, tiers: [
        { min: 500, pct: 1, finding: "500+ connections — establishes credibility and network reach" },
        { min: 300, pct: 0.6, finding: "{v} connections — approaching credibility threshold", rec: "Build your network to 500+ connections. The '500+' badge signals professional credibility to profile visitors." },
        { min: 100, pct: 0.3, finding: "{v} connections — below professional threshold", rec: "Actively grow your network. Connect with colleagues, industry peers, and strategic contacts." },
        { min: 0, pct: 0, finding: "Only {v} connections — appears inactive or new", rec: "Critical: build your network immediately. Low connection counts signal inexperience or inactivity." } ] },
      { key: "followersCount", label: "Followers", share: 0.4, tiers: [
        { min: 5000, pct: 1, finding: "{v} followers — strong audience reach" },
        { min: 1000, pct: 0.7, finding: "{v} followers — growing audience", rec: "Keep building your follower base. Post valuable content regularly to attract followers beyond your connections." },
        { min: 500, pct: 0.4, finding: "{v} followers", rec: "Grow your followers by posting consistently." },
        { min: 1, pct: 0.2, finding: "{v} followers — limited audience reach" },
        { min: 0, pct: 0, finding: "No followers yet" } ] } ] },
    { key: "presence", name: "Professional Presence", group: "Core", weight: 15, checks: [
      { key: "photoPresent", label: "Photo", share: 0.35, tiers: [ { min: 1, pct: 1, finding: "Professional photo present" }, { min: 0, pct: 0, finding: "No profile photo", rec: "Add a professional headshot. Profiles with photos get 21× more views and 36× more messages." } ] },
      { key: "bannerPresent", label: "Banner", share: 0.25, tiers: [ { min: 1, pct: 1, finding: "Custom banner image in place" }, { min: 0, pct: 0, finding: "Default banner", rec: "Add a custom banner that reflects your expertise or brand. This is prime visual real estate." } ] },
      { key: "headlineLength", label: "Headline length", share: 0.25, tiers: [ { min: 80, pct: 1, finding: "Headline uses available character space effectively" }, { min: 40, pct: 0.6, finding: "Headline is {v} characters", rec: "Expand your headline. You have 220 characters — use them to say WHO you help and WHAT results you deliver." }, { min: 0, pct: 0, finding: "Headline is only {v} characters", rec: "Your headline is too short. Use the full 220 characters for keywords and your value proposition." } ] },
      { key: "locationPresent", label: "Location", share: 0.15, tiers: [ { min: 1, pct: 1, finding: "Location is visible" }, { min: 0, pct: 0, finding: "No location", rec: "Add your location to improve local search visibility and trust." } ] } ] },
    { key: "recommendations", name: "Recommendations & Social Proof", group: "Core", weight: 15, checks: [
      { key: "recommendationsCount", label: "Recommendations", share: 1, tiers: [
        { min: 10, pct: 1, finding: "Strong social proof with {v} recommendations" },
        { min: 5, pct: 0.7, finding: "{v} recommendations provide good credibility", rec: "Aim for one new recommendation a month. Ask recent clients while the work is fresh." },
        { min: 1, pct: 0.4, finding: "Only {v} recommendation(s) — limited social proof", rec: "Ask 3–5 satisfied clients or colleagues for recommendations this week." },
        { min: 0, pct: 0, finding: "No recommendations — missing crucial social proof", rec: "Critical: get recommendations immediately. Start by giving them — many reciprocate." } ] } ] },
    { key: "content", name: "Content & Activity", group: "Core", weight: 10, checks: [
      { key: "activityScore", label: "Posting frequency (3 daily · 2 weekly · 1 monthly · 0 rare)", share: 1, tiers: [
        { min: 3, pct: 1, finding: "Excellent posting frequency — high visibility" },
        { min: 2, pct: 0.7, finding: "Good posting cadence — consistent presence" },
        { min: 1, pct: 0.4, finding: "Infrequent posting — limited visibility", rec: "Increase posting to 2–3 times per week to stay visible in connections' feeds." },
        { min: 0, pct: 0.1, finding: "Rare or no posting activity", rec: "Start posting regularly. Even 1–2 posts a week dramatically increases visibility." } ] } ] },
    { key: "depth", name: "Profile Depth (Trust Scroll)", group: "Core", weight: 5, checks: [
      { key: "profileWordCount", label: "Total words", share: 0.6, tiers: [ { min: 800, pct: 1, finding: "Comprehensive profile content ({v} words)" }, { min: 500, pct: 0.67, finding: "Good content depth ({v} words)", rec: "Add more detail throughout. Visitors should scroll for 8+ seconds." }, { min: 200, pct: 0.33, finding: "Profile is brief ({v} words)", rec: "Add comprehensive descriptions to experience, expand About, detail projects." }, { min: 0, pct: 0, finding: "Profile lacks substance ({v} words)", rec: "Critical: add 500+ words across About, Experience, and Projects." } ] },
      { key: "aboutWordCount", label: "About words", share: 0.4, tiers: [ { min: 300, pct: 1, finding: "About section has strong depth for storytelling" }, { min: 150, pct: 0.6, finding: "About is {v} words", rec: "Expand About to 300+ words: your story, methodology, and social proof." }, { min: 50, pct: 0.25, finding: "About is only {v} words", rec: "Your About is too short. Explain who you help, how, and why you're credible." }, { min: 0, pct: 0, finding: "About is nearly empty", rec: "Write a comprehensive About section." } ] } ] },
    { key: "projects", name: "Projects", group: "Additional", weight: 12, checks: [
      { key: "projectsCount", label: "Projects", share: 1, tiers: [ { min: 5, pct: 1, finding: "{v} projects showcased — excellent for keyword indexing" }, { min: 3, pct: 0.7, finding: "{v} projects listed", rec: "Add more projects. Each one indexes additional skills and keywords." }, { min: 1, pct: 0.4, finding: "{v} project(s) listed", rec: "Expand your Projects section." }, { min: 0, pct: 0, finding: "No projects listed", rec: "Add projects — the most underused section for showcasing work and indexing keywords." } ] } ] },
    { key: "certifications", name: "Certifications & Licenses", group: "Additional", weight: 10, checks: [
      { key: "certificationsCount", label: "Certifications", share: 1, tiers: [ { min: 5, pct: 1, finding: "{v} certifications demonstrate ongoing development" }, { min: 3, pct: 0.7, finding: "{v} certifications listed", rec: "Add more certifications for keyword opportunities and expertise." }, { min: 1, pct: 0.4, finding: "{v} certification(s) listed", rec: "Expand your certifications section." }, { min: 0, pct: 0, finding: "No certifications listed", rec: "Add relevant certifications. Even free ones add credibility and search visibility." } ] } ] },
    { key: "sections", name: "Additional Sections", group: "Additional", weight: 10, checks: [
      { key: "organizationsCount", label: "Organizations", share: 0.15, tiers: [ { min: 1, pct: 1, finding: "Organizations populated" }, { min: 0, pct: 0, finding: "No organizations", rec: "Add Organizations." } ] },
      { key: "coursesCount", label: "Courses", share: 0.10, tiers: [ { min: 1, pct: 1, finding: "Courses populated" }, { min: 0, pct: 0, finding: "No courses", rec: "Add Courses." } ] },
      { key: "honorsCount", label: "Honors & Awards", share: 0.15, tiers: [ { min: 1, pct: 1, finding: "Honors populated" }, { min: 0, pct: 0, finding: "No honors", rec: "Add Honors & Awards." } ] },
      { key: "publicationsCount", label: "Publications", share: 0.15, tiers: [ { min: 1, pct: 1, finding: "Publications populated" }, { min: 0, pct: 0, finding: "No publications", rec: "Add Publications." } ] },
      { key: "languagesCount", label: "Languages", share: 0.15, tiers: [ { min: 1, pct: 1, finding: "Languages populated" }, { min: 0, pct: 0, finding: "No languages", rec: "Add Languages." } ] },
      { key: "featuredCount", label: "Featured", share: 0.15, tiers: [ { min: 1, pct: 1, finding: "Featured section highlights key content" }, { min: 0, pct: 0, finding: "No Featured section", rec: "Add a Featured section with your best proof and a clear next step." } ] },
      { key: "volunteerCount", label: "Volunteer", share: 0.15, tiers: [ { min: 1, pct: 1, finding: "Volunteer experience populated" }, { min: 0, pct: 0, finding: "No volunteer experience", rec: "Add Volunteer experience." } ] } ] },
    { key: "value", name: "Value & Service Focus", group: "Additional", weight: 8, checks: [
      { key: "serviceLanguageScore", label: "Service + outcome language (0–3)", share: 0.6, tiers: [ { min: 3, pct: 1, finding: "Profile clearly says who you help and what outcomes you deliver" }, { min: 2, pct: 0.6, finding: "Mentions services but light on client outcomes", rec: "Lead with 'I help [audience] achieve [outcome]' in your headline and About." }, { min: 0, pct: 0, finding: "Accomplishment-heavy, not service-focused", rec: "Reframe around who you help and the transformation you provide." } ] },
      { key: "balanceScore", label: "Service vs. accomplishment balance (0–1)", share: 0.4, tiers: [ { min: 1, pct: 1, finding: "Good balance of service focus and outcome language" }, { min: 0, pct: 0, finding: "Accomplishments outweigh service language", rec: "Visitors care how you can help THEM. Lead with benefits; add accomplishments as proof." } ] } ] }
  ],
  tips: [
    { key: "skillsCount", label: "Skills", max: 100, text: "LinkedIn allows up to 100 skills — each is a potential search keyword match. You have {v}." },
    { key: "groupsCount", label: "Groups", max: 100, text: "You can join up to 100 LinkedIn groups for reach and networking. You're in {v}." }
  ]
};

// Sample profile for the demo scorer (Bright Data field shape, normalized)
window.GRADER_SAMPLE = { name: "Dana Whitfield", headline: "Senior Director, Global Events & Field Marketing | Operations", location: "Chicago, IL", photoPresent: 1, bannerPresent: 0, connectionsCount: 1240, followersCount: 1310, recommendationsCount: 3, activityScore: 1, profileWordCount: 410, aboutWordCount: 120, projectsCount: 0, certificationsCount: 2, organizationsCount: 1, coursesCount: 0, honorsCount: 1, publicationsCount: 0, languagesCount: 1, featuredCount: 0, volunteerCount: 0, serviceLanguageScore: 1, balanceScore: 0, skillsCount: 38, groupsCount: 6 };

window.GRADER_load = function (accountId) {
  try { const r = JSON.parse(localStorage.getItem("grader-rubric:" + accountId) || "null"); if (r && r.categories) return r; } catch (e) {}
  return JSON.parse(JSON.stringify(window.GRADER_DEFAULT));
};
window.GRADER_save = function (accountId, rubric) { try { localStorage.setItem("grader-rubric:" + accountId, JSON.stringify(rubric)); } catch (e) {} };

window.GRADER_score = function (rubric, p) {
  const fmt = (s, v) => (s || "").replace(/\{v\}/g, typeof v === "number" ? v.toLocaleString("en-US") : String(v));
  const profile = Object.assign({}, p, { headlineLength: (p.headline || "").length, locationPresent: p.location ? 1 : 0 });
  const categories = rubric.categories.map(cat => {
    let score = 0; const findings = [], recs = [];
    cat.checks.forEach(ch => {
      const v = Number(profile[ch.key] || 0);
      const tier = ch.tiers.find(t => v >= t.min) || ch.tiers[ch.tiers.length - 1];
      score += cat.weight * ch.share * tier.pct;
      if (tier.finding) findings.push(fmt(tier.finding, v));
      if (tier.rec) recs.push({ text: fmt(tier.rec, v), check: ch.label });
    });
    score = Math.round(score);
    const pct = cat.weight ? score / cat.weight : 0;
    const status = pct >= 0.8 ? "excellent" : pct >= 0.6 ? "good" : pct >= 0.4 ? "needs_work" : "critical";
    return { key: cat.key, name: cat.name, group: cat.group, score, max: cat.weight, pct, status, findings, recs };
  });
  const total = categories.reduce((s, c) => s + c.score, 0);
  const maxTotal = categories.reduce((s, c) => s + c.max, 0);
  const pctTotal = maxTotal ? Math.round(total / maxTotal * 100) : 0;
  const g = rubric.grades.slice().sort((a, b) => b.min - a.min).find(x => pctTotal >= x.min) || rubric.grades[rubric.grades.length - 1];
  // Prioritized recs: lower-scoring categories first; effort heuristic from the source repo
  const all = [];
  categories.forEach(c => c.recs.forEach((r, i) => {
    const impact = c.pct < 0.3 ? "high" : c.pct < 0.6 ? "medium" : "low";
    const t = r.text.toLowerCase();
    const effort = /photo|banner|location|join|url/.test(t) ? "low" : /about|experience|comprehensive|reframe/.test(t) ? "high" : "medium";
    all.push({ action: r.text, category: c.name, impact, effort, priority: c.pct * 10 + i });
  }));
  all.sort((a, b) => a.priority - b.priority);
  const tips = (rubric.tips || []).map(t => ({ label: t.label, text: fmt(t.text, Number(profile[t.key] || 0)), done: Number(profile[t.key] || 0) >= t.max })).filter(t => !t.done);
  return { total, maxTotal, pctTotal, grade: g.grade, gradeLabel: g.label, gradeMessage: g.message, categories, quickWins: all.filter(r => r.impact === "high" && r.effort === "low").slice(0, 3), immediate: all.slice(0, 5), shortTerm: all.slice(5, 10), ongoing: all.slice(10, 15), tips };
};
