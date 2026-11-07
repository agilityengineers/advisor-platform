// Platform model — mirrors the Tax-Strategies pattern: feature registry → plans unlock feature keys → super admin overrides per company.
// Production: feature_registry, pricing_plans, tenants, tenant_features, branding_settings, custom_domains, tenant_email_settings, team_members.
window.PLATFORM = {
  name: "Advisor Platform",
  domains: ["advisor-platform.findabusinesspro.com", "advisor-platform.authority-desk.com"],
  primaryDomain: "advisor-platform.findabusinesspro.com",
  superAdmin: { name: "Clarence Williams", email: "emailme@clarencewilliams.com", username: "clarencewilliams" }
};

window.FEATURE_REGISTRY = [
  { key: "website_cms", label: "Website CMS", desc: "Edit and publish landing-page content", category: "core" },
  { key: "pipeline_board", label: "Pipeline board", desc: "Kanban lead-to-close flow with custom stages", category: "core" },
  { key: "reviews", label: "Reviews manager", desc: "Add, hide, and order client testimonials", category: "core" },
  { key: "client_portal", label: "Client portal", desc: "Client-facing status, files, and payments", category: "core" },
  { key: "calendly", label: "Calendly booking", desc: "Embedded booking with prefill and webhooks", category: "professional" },
  { key: "sendgrid", label: "SendGrid email", desc: "Company-owned sending domain and templates", category: "professional" },
  { key: "hero_video", label: "Hero video", desc: "Video beside the landing-page headline", category: "professional" },
  { key: "stripe_checkout", label: "Stripe checkout", desc: "On-brand checkout, payment plans, order bumps", category: "professional" },
  { key: "twilio_sms", label: "Twilio SMS", desc: "Client reminders, new-lead alerts, company number", category: "advanced" },
  { key: "team_management", label: "Team management", desc: "Invite managers and advisors with granular permissions", category: "advanced" },
  { key: "white_label", label: "White label", desc: "Own logo, colors, and custom domain", category: "enterprise" },
  { key: "authority_desk", label: "Authority Desk handoff", desc: "Sibling-brand journey card and Blueprint handoff", category: "enterprise" }
];

window.PLANS = [
  { key: "starter", name: "Starter", price: 99, desc: "One professional, core console", featureKeys: ["website_cms", "pipeline_board", "reviews", "client_portal", "calendly"] },
  { key: "professional", name: "Professional", price: 249, desc: "Email, video, and checkout", featureKeys: ["website_cms", "pipeline_board", "reviews", "client_portal", "calendly", "sendgrid", "hero_video", "stripe_checkout"] },
  { key: "white_label", name: "White Label", price: 599, desc: "Your brand, your domain, your team", featureKeys: ["website_cms", "pipeline_board", "reviews", "client_portal", "calendly", "sendgrid", "hero_video", "stripe_checkout", "twilio_sms", "team_management", "white_label"] },
  { key: "enterprise", name: "Enterprise", price: null, desc: "Everything, plus partner handoffs", featureKeys: window.FEATURE_REGISTRY ? [] : [] }
];
window.PLANS[3].featureKeys = window.FEATURE_REGISTRY.map(f => f.key);

// Granular team permissions (repo pattern: resource:read / resource:write)
window.PERMISSIONS = [
  { key: "clients", label: "Leads & clients" },
  { key: "pipeline", label: "Pipeline" },
  { key: "website", label: "Website content" },
  { key: "reviews", label: "Reviews" },
  { key: "billing", label: "Billing & payments" },
  { key: "team", label: "Team" }
];

window.MTC_ROLES = [
  { id: "super_admin", name: "Super admin", canEdit: true, allAccounts: true, desc: "Platform owner (Clarence). Every company, every page." },
  { id: "admin", name: "Admin · Company owner", canEdit: true, allAccounts: false, desc: "The LinkedIn professional. Owns this company's site, pipeline, integrations, and team." },
  { id: "manager", name: "Manager", canEdit: false, allAccounts: false, desc: "Runs pipeline and team day to day. Permissions set by the Admin." },
  { id: "advisor", name: "Client advisor", canEdit: false, allAccounts: false, desc: "Works leads and clients. No site or settings access." },
  { id: "client", name: "Client", canEdit: false, allAccounts: false, desc: "Sees their own portal only." }
];

// Companies (tenants). `overrides` = { featureKey: true|false } forced on/off by the super admin regardless of plan.
window.DEFAULT_ACCOUNTS = [
  { id: "mtc", slug: "mytargetclient", name: "My Target Client", owner: "Brian Traichel", ownerEmail: "briantraichel@gmail.com", plan: "white_label", status: "active", createdAt: "Aug 12, 2026",
    overrides: { authority_desk: true },
    branding: { companyName: "My Target Client", tagline: "Better profiles, stronger connection", logoUrl: "uploads/ptc-logo-no-tag-line-8c493deb.png", primaryColor: "#1668F0", accentColor: "#0A1626" },
    domain: { subdomain: "mytargetclient", custom: "mytargetclient.com", verified: true, ssl: "active", provider: "GoDaddy" },
    integrations: {
      sendgrid: { status: "connected", fromName: "Brian Traichel", fromAddress: "brian@mytargetclient.com", sendingDomain: "mail.mytargetclient.com", domainVerified: true },
      twilio: { status: "connected", number: "+1 (619) 555-0148", reminders: true, leadAlerts: true, alertTo: "(619) 887-0932" },
      stripe: { status: "connected", mode: "live", accountId: "acct_1Mtc…9Qx" },
      calendly: { status: "connected", url: "https://calendly.com/briantraichel/intro-call" }
    },
    team: [
      { id: 1, name: "Brian Traichel", email: "briantraichel@gmail.com", role: "admin", perms: {} },
      { id: 2, name: "Alicia Morgan", email: "alicia@mytargetclient.com", role: "manager", perms: { clients: "write", pipeline: "write", website: "read", reviews: "write", billing: "read", team: "read" } },
      { id: 3, name: "Devon Price", email: "devon@mytargetclient.com", role: "advisor", perms: { clients: "write", pipeline: "write", website: "none", reviews: "none", billing: "none", team: "none" } }
    ] },
  { id: "northstar", slug: "northstar", name: "Northstar Advisory", owner: "Dana Whitfield", ownerEmail: "dana@whitfieldadvisory.com", plan: "professional", status: "trial", createdAt: "Oct 28, 2026", overrides: {},
    branding: { companyName: "Northstar Advisory", tagline: "", logoUrl: "", primaryColor: "#1668F0", accentColor: "#0A1626" },
    domain: { subdomain: "northstar", custom: "", verified: false, ssl: "none", provider: "" },
    integrations: { sendgrid: { status: "not_connected" }, twilio: { status: "not_connected" }, stripe: { status: "not_connected" }, calendly: { status: "not_connected" } },
    team: [{ id: 1, name: "Dana Whitfield", email: "dana@whitfieldadvisory.com", role: "admin", perms: {} }] },
  { id: "pinnacle", slug: "careerproguider", name: "Career Pro Guider", owner: "Troy Heiner", ownerEmail: "troy@careerproguider.com", plan: "starter", status: "active", createdAt: "Sep 19, 2026", overrides: { sendgrid: true },
    branding: { companyName: "Career Pro Guider", tagline: "", logoUrl: "", primaryColor: "#1668F0", accentColor: "#0A1626" },
    domain: { subdomain: "careerproguider", custom: "", verified: false, ssl: "none", provider: "" },
    integrations: { sendgrid: { status: "pending", fromName: "Troy Heiner", fromAddress: "troy@careerproguider.com", sendingDomain: "mail.careerproguider.com", domainVerified: false }, twilio: { status: "not_connected" }, stripe: { status: "connected", mode: "test", accountId: "acct_1Cpg…2Ab" }, calendly: { status: "not_connected" } },
    team: [{ id: 1, name: "Troy Heiner", email: "troy@careerproguider.com", role: "admin", perms: {} }] }
];

window.PLATFORM_loadAccounts = function () {
  try { const s = JSON.parse(localStorage.getItem("platform-accounts") || "null"); if (Array.isArray(s) && s.length) return s; } catch (e) {}
  return JSON.parse(JSON.stringify(window.DEFAULT_ACCOUNTS));
};
window.PLATFORM_saveAccounts = function (accounts) { try { localStorage.setItem("platform-accounts", JSON.stringify(accounts)); } catch (e) {} };
// Effective features = plan keys, then super-admin overrides win.
window.PLATFORM_features = function (account) {
  const plan = window.PLANS.find(p => p.key === account.plan) || window.PLANS[0];
  const out = {};
  window.FEATURE_REGISTRY.forEach(f => {
    const o = (account.overrides || {})[f.key];
    out[f.key] = o === true ? true : o === false ? false : plan.featureKeys.includes(f.key);
  });
  return out;
};
// Keep the older MTC_ACCOUNTS shape alive for the landing page / CRM switcher.
window.MTC_ACCOUNTS = window.PLATFORM_loadAccounts().map(a => ({ id: a.id, name: a.name, owner: a.owner, plan: (window.PLANS.find(p => p.key === a.plan) || {}).name || a.plan }));
