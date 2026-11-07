// Default landing-page content. Each white-label account overrides these (production: site_content table, keyed by account_id).
window.MTC_DEFAULTS = {
  brand: { companyName: "My Target Client", legalLine: "My Target Client LLC · Find a Business Pro · Brian Traichel", logoUrl: "uploads/ptc-simple-flat2.png", footerLogoUrl: "uploads/ptc-simple-flat.png", ownerName: "Brian", ownerPhoto: "uploads/BTLIpic.jpg" },
  visibility: { journey: true, cost: true, guide: true, plan: true, process: true, testimonials: true },
  hero: {
    eyebrow: "For consultants, authors & writers",
    headline: "Your expertise is real. Your profile makes it look optional.",
    subhead: "Right now the people who should be hiring you, booking you, or buying your book are reading a profile that sounds like everyone else's. We rebuild it around a proven 22-section framework — so you are found, believed, and approached as the authority in your niche.",
    primaryCta: "Get my profile audit", secondaryCta: "Book a 15-min call",
    stat1Value: "28+ years", stat1Label: "B2B sales experience",
    stat2Value: "22 sections", stat2Label: "Optimization framework",
    stat3Value: "1 hour", stat3Label: "Brand Voice Blueprint interview"
  },
  journey: { eyebrow: "Your journey", headline: "Start with a grade. Leave with a profile that gets you hired.", intro: "Every step is a real conversation with Brian and the team — no self-serve software, no guessing where you stand." },
  cost: {
    eyebrow: "The villain: invisibility", headline: "Every month a generic profile stays up, it quietly costs you.",
    intro: "Nobody sends an email to tell you they passed. The decision happens in eight seconds, on a screen you never see, and you find out by way of a pipeline that stays too quiet.",
    card1Title: "The engagement that went elsewhere", card1Body: "A buyer with budget compared three profiles. Yours read like a résumé, so they short-listed the two that read like specialists.",
    card2Title: "The stage you weren't offered", card2Body: "Event programmers vet speakers online first. If your niche isn't obvious in one glance, you're not a credible fit for their theme.",
    card3Title: "The book that stayed a secret", card3Body: "Readers buy the author before the book. A profile that doesn't say what you stand for gives them no reason to start.",
    card4Title: "The searches you never appeared in", card4Body: "Without the right keywords in the right sections, the algorithm can't surface you to the people already looking for what you do.",
    banner: "You don't have a talent problem. You have a translation problem — and it's fixable in weeks, not years."
  },
  guide: {
    eyebrow: "Your guide", headline: "28+ years of B2B sales, pointed at your profile.",
    p1: "I've spent 28+ years in B2B sales — reading how buyers evaluate, hesitate, and decide. That's the lens I bring to a profile. Not copywriting flourish, not template filler: positioning that answers the question a serious buyer is actually asking.",
    p2: "Every profile is built by hand against the 22-section framework, and it's built with you — done-for-you if you'd rather hand it over, done-with-you if you want to learn the mechanics as we go.",
    bullet1: "Expert-managed, not one-size-fits-all templates", bullet2: "Algorithm-aware structure, written for humans first", bullet3: "Sales training available when visibility needs to become booked work",
    photo: "uploads/SectaAI_00018_.png", name: "Brian Traichel", title: "My Target Client LLC · Find a Business Pro"
  },
  plan: {
    eyebrow: "The plan", headline: "Three moving parts. One recognizable authority.", intro: "Positioning, voice, and conversion — handled in order, so each one makes the next easier.",
    card1Title: "Profile optimization", card1Kicker: "22-SECTION FRAMEWORK", card1Body: "Every section of your profile rebuilt in sequence — headline, about, experience, skills, proof, and the next step you want a buyer to take. Done-for-you, or done-with-you.",
    card2Title: "The Brand Voice Blueprint", card2Kicker: "ONE-HOUR INTERVIEW", card2Body: "One hour on a call captures how you actually talk, what makes you different, and who you're for. It becomes an AI-ready reference document — so every post, email, and page you write from here sounds like you, not like generic AI output.",
    card3Title: "Sales training", card3Kicker: "VISIBILITY → ENGAGEMENTS", card3Body: "Inbound interest is only useful if you can hold the conversation. Optional coaching for consultants who want to convert attention into signed work."
  },
  testimonials: { eyebrow: "In their words", headline: "What clients say", intro: "LinkedIn recommendations from consultants, authors, and executives who've been through the Brand Voice Interview." },
  apply: { eyebrow: "The call to action", headline: "Let's make your profile the reason they call you.", intro: "Tell me where you are and what you want to be known for. I'll come back with a 22-section read on your current profile and where the biggest gains are." }
};

// Accounts and roles live in platform.js (load it before this file).

window.MTC_SECTION_META = [
  { key: "brand", label: "Brand", toggle: false, fields: [["companyName","Company name","text"],["legalLine","Footer legal line","text"],["logoUrl","Header logo URL","text"],["footerLogoUrl","Footer logo URL","text"],["ownerName","Owner first name (used in copy)","text"],["ownerPhoto","Owner headshot URL","text"]] },
  { key: "hero", label: "Hero", toggle: false, fields: [["eyebrow","Eyebrow","text"],["headline","Headline","textarea"],["subhead","Subhead","textarea"],["primaryCta","Primary button","text"],["secondaryCta","Secondary button","text"],["stat1Value","Stat 1 value","text"],["stat1Label","Stat 1 label","text"],["stat2Value","Stat 2 value","text"],["stat2Label","Stat 2 label","text"],["stat3Value","Stat 3 value","text"],["stat3Label","Stat 3 label","text"]] },
  { key: "journey", label: "Your journey", toggle: true, fields: [["eyebrow","Eyebrow","text"],["headline","Headline","textarea"],["intro","Intro","textarea"]] },
  { key: "cost", label: "The cost", toggle: true, fields: [["eyebrow","Eyebrow","text"],["headline","Headline","textarea"],["intro","Intro","textarea"],["card1Title","Card 1 title","text"],["card1Body","Card 1 body","textarea"],["card2Title","Card 2 title","text"],["card2Body","Card 2 body","textarea"],["card3Title","Card 3 title","text"],["card3Body","Card 3 body","textarea"],["card4Title","Card 4 title","text"],["card4Body","Card 4 body","textarea"],["banner","Banner statement","textarea"]] },
  { key: "guide", label: "About the guide", toggle: true, fields: [["eyebrow","Eyebrow","text"],["headline","Headline","textarea"],["p1","Paragraph 1","textarea"],["p2","Paragraph 2","textarea"],["bullet1","Bullet 1","text"],["bullet2","Bullet 2","text"],["bullet3","Bullet 3","text"],["photo","Portrait URL","text"],["name","Name","text"],["title","Title line","text"]] },
  { key: "plan", label: "The plan", toggle: true, fields: [["eyebrow","Eyebrow","text"],["headline","Headline","textarea"],["intro","Intro","textarea"],["card1Title","Card 1 title","text"],["card1Kicker","Card 1 kicker","text"],["card1Body","Card 1 body","textarea"],["card2Title","Card 2 title","text"],["card2Kicker","Card 2 kicker","text"],["card2Body","Card 2 body","textarea"],["card3Title","Card 3 title","text"],["card3Kicker","Card 3 kicker","text"],["card3Body","Card 3 body","textarea"]] },
  { key: "process", label: "How it runs", toggle: true, fields: [] },
  { key: "testimonials", label: "What clients say", toggle: true, fields: [["eyebrow","Eyebrow","text"],["headline","Headline","text"],["intro","Intro","textarea"]] },
  { key: "apply", label: "Call to action + form", toggle: false, fields: [["eyebrow","Eyebrow","text"],["headline","Headline","textarea"],["intro","Intro","textarea"]] }
];

window.MTC_mergeContent = function (base, over) {
  const out = {};
  Object.keys(base).forEach(k => { out[k] = Object.assign({}, base[k], (over && over[k]) || {}); });
  return out;
};
