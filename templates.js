// Landing-page templates (production: landing_templates table). Super admin applies one to a company; tokens are filled from the company record.
// Tokens: {company} {owner} {ownerFirst}
window.LANDING_TEMPLATES = [
  {
    id: "profile-authority", name: "Profile Authority", source: "Derived from My Target Client", audience: "Consultants, authors & writers",
    summary: "Grade → call → Brand Voice → rebuilt profile. Journey map, cost-of-invisibility, guide section, plan cards, audit form.",
    content: {
      brand: { companyName: "{company}", legalLine: "{company} · {owner}", logoUrl: "", footerLogoUrl: "", ownerName: "{ownerFirst}", ownerPhoto: "" },
      visibility: { journey: true, cost: true, guide: true, plan: true, process: true, testimonials: false },
      hero: {
        eyebrow: "For consultants, authors & writers",
        headline: "Your expertise is real. Your profile makes it look optional.",
        subhead: "Right now the people who should be hiring you, booking you, or buying your book are reading a profile that sounds like everyone else's. We rebuild it around a proven 22-section framework — so you are found, believed, and approached as the authority in your niche.",
        primaryCta: "Get my profile audit", secondaryCta: "Book a 15-min call",
        stat1Value: "15+ years", stat1Label: "B2B experience", stat2Value: "22 sections", stat2Label: "Optimization framework", stat3Value: "1 hour", stat3Label: "Brand Voice Blueprint interview"
      },
      journey: { eyebrow: "Your journey", headline: "Start with a grade. Leave with a profile that gets you hired.", intro: "Every step is a real conversation with {ownerFirst} and the team — no self-serve software, no guessing where you stand." },
      guide: {
        eyebrow: "Your guide", headline: "Years of B2B sales, pointed at your profile.",
        p1: "I've spent my career in B2B sales — reading how buyers evaluate, hesitate, and decide. That's the lens I bring to a profile. Not copywriting flourish, not template filler: positioning that answers the question a serious buyer is actually asking.",
        p2: "Every profile is built by hand against the 22-section framework, and it's built with you — done-for-you if you'd rather hand it over, done-with-you if you want to learn the mechanics as we go.",
        bullet1: "Expert-managed, not one-size-fits-all templates", bullet2: "Algorithm-aware structure, written for humans first", bullet3: "Sales training available when visibility needs to become booked work",
        photo: "", name: "{owner}", title: "{company}"
      },
      apply: { eyebrow: "The call to action", headline: "Let's make your profile the reason they call you.", intro: "Tell me where you are and what you want to be known for. I'll come back with a 22-section read on your current profile and where the biggest gains are." }
    }
  }
];
window.TEMPLATES_load = function () {
  let extra = []; try { extra = JSON.parse(localStorage.getItem("platform-templates") || "[]"); } catch (e) {}
  return window.LANDING_TEMPLATES.concat(Array.isArray(extra) ? extra : []);
};
window.TEMPLATES_saveExtra = function (list) { try { localStorage.setItem("platform-templates", JSON.stringify(list)); } catch (e) {} };
window.TEMPLATES_fill = function (content, account) {
  const first = (account.owner || "").split(" ")[0] || "me";
  const sub = s => typeof s === "string" ? s.replace(/\{company\}/g, account.name || "").replace(/\{ownerFirst\}/g, first).replace(/\{owner\}/g, account.owner || "") : s;
  const out = {};
  Object.keys(content).forEach(sec => { out[sec] = {}; Object.keys(content[sec]).forEach(k => { out[sec][k] = sub(content[sec][k]); }); });
  // Company branding wins where it exists
  if (account.branding) { out.brand = Object.assign({}, out.brand, { companyName: account.branding.companyName || out.brand.companyName, logoUrl: account.branding.logoUrl || "", footerLogoUrl: account.branding.logoUrl || "" }); }
  return out;
};
// Strip company-specific material so a live page can become a template
window.TEMPLATES_fromContent = function (merged, account) {
  const c = JSON.parse(JSON.stringify(merged));
  const first = (account.owner || "").split(" ")[0];
  const tok = s => typeof s === "string" ? s.split(account.name).join("{company}").split(account.owner).join("{owner}").split(first).join("{ownerFirst}") : s;
  Object.keys(c).forEach(sec => Object.keys(c[sec]).forEach(k => { c[sec][k] = tok(c[sec][k]); }));
  c.brand = { companyName: "{company}", legalLine: "{company} · {owner}", logoUrl: "", footerLogoUrl: "", ownerName: "{ownerFirst}", ownerPhoto: "" };
  if (c.guide) { c.guide.photo = ""; c.guide.name = "{owner}"; c.guide.title = "{company}"; }
  c.visibility = Object.assign({}, c.visibility, { testimonials: false });
  return c;
};
