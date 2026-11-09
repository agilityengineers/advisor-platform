# Handoff: Advisor Platform — white-label LinkedIn advisory SaaS

**Production target: Replit** (Replit Deployments, Replit Postgres, Replit Secrets, Replit Auth optional). Build with Claude Code, deploy on Replit. Follow the conventions of the two sibling repos that already run there: `agilityengineers/Tax-Strategies-AI` (multi-tenant, feature flags, custom domains, branding, email settings) and `agilityengineers/The-Authority-Desk` (landing page, client journey). Pull the Profile Grader scoring logic from `agilityengineers/LinkedIn-Profile-Grader`.

## Overview
A multi-tenant platform where each **company** (a LinkedIn professional / consultant / coach) gets its own branded landing page, lead-to-close CRM, Brand Voice capture, Profile Grader, checkout, client portal, and integrations — on its own subdomain or custom domain. A **super admin** (Clarence Williams) runs the platform: companies, plans, feature flags, landing-page templates. **My Target Client (Brian Traichel) is the first company**, not the platform.

Platform domains: `advisor-platform.com` (primary; company subdomains hang off it), `advisor-platform.authority-desk.com` (SEO surface). `advisor-platform.findabusinesspro.com` is a legacy alias that still resolves.

## About the design files
Everything in this bundle is a **design reference built in HTML** (`.dc.html` Design Components + small JS data files). They show intended look, copy, and behavior. **Do not ship them.** Recreate the screens in the production stack. Templates use `{{ hole }}` bindings and `<sc-if>`/`<sc-for>` blocks — read them as component props and conditionals. `platform.js`, `site-content.js`, `templates.js`, `grader.js`, `reviews.js` are the **data model and business rules** — port their shapes and logic faithfully; they are the closest thing to a spec for the tables and the scorer.

## Fidelity
**High-fidelity** for the public pages (Advisor Platform, company landing page, About, both pricing pages, buying flow, Profile Grade). **High-fidelity layout, mid-fidelity data** for the CRM Dashboard and Platform Admin — recreate the layouts and interactions; wire them to real data instead of the localStorage stand-ins.

See `BUILD-SPEC.md` for everything the prototype fakes (auth, tenant resolution, secrets, webhooks, schema, conversion, empty states, mobile) and `CLAUDE-CODE-PROMPT.md` for the kickoff prompt.

---

## Hierarchy and role matrix

| Capability | Super admin | Admin (company owner) | Manager | Client advisor | Client |
|---|:-:|:-:|:-:|:-:|:-:|
| Platform Admin console (companies, plans, feature registry, templates, platform settings, platform landing CMS) | Y | – | – | – | – |
| Enter any company's dashboard ("Viewing company: X" banner) | Y | – | – | – | – |
| Create company + first Admin, change plan, suspend, per-feature overrides | Y | – | – | – | – |
| Save a company's live page as a template | Y | – | – | – | – |
| Company settings: branding, domain, integrations, team | Y | Y | – | – | – |
| Website (CMS) draft → publish | Y | Y | read-only | – | – |
| Reviews manager, Profile Grader rubric | Y | Y | per permission | – | – |
| Leads list / pipeline board / lead drawer / send email | Y | Y | per permission | per permission | – |
| Client portal | – | – | – | – | own only |

Team permissions are granular per area (`clients`, `pipeline`, `website`, `reviews`, `billing`, `team`) with `none | read | write` — see `PERMISSIONS` in `platform.js`. Admins implicitly have `write` everywhere.

Identities: super admin = Clarence Williams, `emailme@clarencewilliams.com`, username `clarencewilliams`. First company = My Target Client, Admin Brian Traichel. When the super admin is inside a company dashboard the sidebar shows the **Advisor Platform** identity, never the company logo.

## Feature registry, plans, overrides
From `platform.js`. Effective features = plan's `featureKeys`, then super-admin `overrides` (`true`/`false`) win.

Registry (12): `website_cms`, `pipeline_board`, `reviews`, `client_portal`, `calendly`, `sendgrid`, `hero_video`, `stripe_checkout`, `twilio_sms`, `team_management`, `white_label`, `authority_desk`.

Plans: Starter $99 · Professional $249 · White Label $599 · Enterprise (custom). Plan → feature matrix is editable in Platform Admin → Feature registry. Gated UI shows a "Not in your plan" lock, never disappears silently.

---

## Screens

### 1. Advisor Platform (platform landing) — `Advisor Platform.dc.html`
Sells the platform to advisors. Authority Desk look: cream `#F6F2EA`, surface `#FCFAF5`, ink `#16130F`, brass `#B07C2E`, deep green `#13231C`; Newsreader (display) + Hanken Grotesk (body); 1200px content, 24px gutters, 108px section rhythm, 4px button radius, 8–14px card radius.
Sections: sticky header → hero (pipeline mock + two floating chips) → trust strip → How it works (3 steps) → The console (dark, 8-cell hairline grid) → AI (5 items, each tagged **Available now** or **Roadmap** — keep the tags honest) → White label showcase → Integrations strip → Template gallery → Advisor testimonial placeholders → FAQ (native `<details>`) → Founder note + demo/trial form → footer with all three domains.
CTAs: "Book a demo →" and "Start a 14-day trial" both submit the same form (intent toggle) into the **platform pipeline**; success state offers Clarence's Calendly. No pricing shown.
**v1 requirement:** every text block, the AI items with their now/roadmap tags, FAQ items, testimonials, and founder note are editable by the super admin via a **Platform landing CMS** in Platform Admin — same draft → publish model as the company CMS, keyed to the platform.

### 2. Company landing page — `Landing Page.dc.html` (My Target Client instance)
Navy `#0A1626` / brand blue `#1668F0` / pale `#EAF2FD`; Sora + Manrope; 1180px content. Fully CMS-driven from `site-content.js` defaults + per-company overrides; six sections can be hidden (`visibility`).
Sections: sticky header (logo or text wordmark fallback) → hero (copy, two CTAs, three stats; right side = **audit card** or **video** per hero setting) → **Your journey** (5 animated steps: audit → Profile Grade sample 64/100 → 15-min call → Brand Voice Blueprint → rebuilt & re-graded; "Where most clients stop" + Authority Desk handoff card gated by `authority_desk`) → The cost (dark, 4 cards + banner) → Your guide (portrait placeholder when none) → The plan (3 cards) → How it runs (4 steps) → What clients say (auto-advancing slider, 3 next-up cards, from Reviews) → CTA + 6-field form (name, email, **phone**, category, LinkedIn URL, goal) → footer.
Form posts to the company's pipeline (Zapier catch hook in prototype → direct API in production). Success state shows a Calendly link prefilled with name/email/LinkedIn.
Scroll-reveal animates only below-the-fold blocks; the journey map loops 1→5 while on screen, pauses on hover.
URL params in prototype: `?account=<id>` selects tenant, `&preview=1` shows draft. Production: resolve by host.

### 3. About Brian — `About Brian.dc.html`
Company sub-page: LinkedIn-expert positioning, 10 weighted criteria bar chart, three vetting questions, 85/70 qualification tiers, how he works, CTA. Should become CMS-editable per company (not in v1 of the prototype's CMS).

### 4. Standard Pricing — `Standard Pricing.dc.html` (private, `noindex`)
Individuals. Core: Live Profile Session $697 · **Voice-Built Profile $997 (featured, "Brian recommends", 2×$499)** · Executive Authority $1,997 (3×$699). Entry: Profile Audit $197 ($100 credit, 14 days) · Brand Voice Blueprint $347 (full credit, 30 days) · Group Profile Lab $197 / VIP $497. Teams band $797 / $697 per profile. Add-ons table, credits explainer, Authority Desk handoff, **activity-based-marketing disclaimer** (not paid advertising, no performance guarantees). Pay-in-full / plan toggle. Prices in buttons under $1,000; call CTA for Executive and Teams. Buttons deep-link into the Buying Flow with `?offer=&plan=`.

### 5. Commercial Pricing — `Commercial Pricing.dc.html` (private, `noindex`)
Teams & companies, services-menu format, averages: Brand Voice Blueprint $347 · Done-WITH-You $750 · Done-FOR-You All-Star $1,500 (featured) · Team Workshop $650 · Sales Webinar $600 · 4-Week Program $1,850 avg ($1,000–$2,500) · Company-Wide Program $3,650 · Lead Gen Campaign quoted monthly. Every CTA → discovery call. Same disclaimer. Both pricing pages carry a top bar linking to each other.

### 6. Buying Flow — `Buying Flow.dc.html`
Step bar: Flow map → **Checkout** (on-brand, Stripe Payment Element embedded, order bumps: banner +$150, 72-hour rush +30%; plan toggle) → Thank-you → **Book interview** (real Calendly inline embed, prefilled, advances on `calendly.event_scheduled`) → Intake (phone, LinkedIn, known-for, audience, publish method) → Welcome email (SendGrid template preview + merge JSON + sequence) → **Client portal** (7-stage tracker reflecting earlier steps, payments incl. plan installments, files, team).

### 7. Profile Grade — `Profile Grade.dc.html`
Report a lead receives. Grade ring (A–F, motivational labels), core vs additional points, strongest / biggest gap, 9 category bars with status colors. "Lead · quick summary" gates findings behind **Unlock**; "Unlocked · full report" shows findings, recommendations, quick wins, do-this-week / next-30-days / ongoing tips, and CTA. Footer stamps rubric version. Data from Bright Data (see BUILD-SPEC); prototype scores `GRADER_SAMPLE`.

### 8. CRM Dashboard (company console) — `CRM Dashboard.dc.html`
Sidebar: company logo (or AP identity for super admin), nav, integrations status (ON/PENDING/OFF per company), user + "View as" role switcher (prototype only).
Panels, top to bottom: KPI tiles → **Leads** (List with stage chips + search, or **Pipeline** Kanban with drag-drop; **Manage columns**: rename, reorder, add, remove, Open/Won/Lost kind) → **Website (CMS)** (section rail, fields, Show-on-site toggles, hero card/video setting, Preview draft / View live / Discard / Publish; read-only banner for managers) → **Reviews** (add/edit/hide/remove/reorder; name, title, category, LinkedIn, quote) → "Not in your plan" lock banner → **Profile Grader** (rubric editor: category weights must total 100, Core/Additional, check shares, tier threshold / % earned / finding / recommendation, grade thresholds, Reset, **Publish as vN**) → **Company settings** (Branding: name, tagline, logo, primary/accent + preview · Domain: platform subdomain always on, custom domain, DNS provider picker with GoDaddy/Cloudflare/Namecheap steps, generated CNAME/TXT/A records, Verify, SSL status · Integrations: SendGrid (required), Twilio (reminders, lead alerts, number), Stripe Connect, Calendly · Team: invite Manager/Advisor, permission grid) → SendGrid templates card + Integrations summary.
Lead drawer: contact, click-to-call, LinkedIn, goal, **Open grade**, Calendly booking state + prefilled link, status (from stages), activity timeline, SendGrid composer.

### 9. Platform Admin (super admin console) — `Platform Admin.dc.html`
Nav: Companies · Templates · Feature registry · Plans · Platform settings (+ Platform landing CMS in v1).
Companies: KPIs (total, active, trial, MRR), table (plan, domain status dot, integration chips, feature count, status), **New company** modal (name, subdomain, admin name/email, plan, trial/active/comp) → sends invite. Drawer: Open company dashboard, View website, Save page as template, Suspend; plan select; domain; **Features: Plan / On / Off** per key with source label; integrations (read-only); team.
Templates: cards with sketch preview, apply-to-company → writes a CMS **draft** for that company. Default template "Profile Authority" = MTC page with logo, photos, testimonials stripped and `{company}` / `{owner}` / `{ownerFirst}` tokens.
Feature registry: features × plans tick matrix. Plans: 4 cards. Platform settings: super admin identity, the three domains, platform-level keys note.

---

## Interactions worth preserving
- Draft → publish everywhere content is edited (company CMS, platform CMS, rubric versions). Visitors never see drafts.
- Pipeline drag-drop changes status; stage changes propagate to chips, drawer select, KPI tiles.
- Journey map animation, testimonial slider (6s, pause on hover), scroll reveal — all respect `prefers-reduced-motion` in production.
- Calendly inline embed: container needs `class="calendly-inline-widget"` + explicit height; listen for `calendly.event_scheduled`; pass `utm_content=<orderId>` so the `invitee.created` webhook can be matched to the order.
- Feature gating shows a lock + plan name; never hides silently.
- Super admin in a company dashboard: AP identity in sidebar, "Viewing company: X" banner, Back to Platform Admin.

## Design tokens
**Company default (MTC / platform console):** navy `#0A1626`, blue `#1668F0`, blue-hover `#0B4FD0`, pale `#EAF2FD`, page `#F4F8FE`, border `#DDE8F7`/`#E4EDF9`, body text `#3D556F`/`#425973`, muted `#6A809A`/`#7C93AD`, success `#2FBF71`/`#1E7A4C`, warn `#E39A2B`/`#8A6320`, danger `#C2361F`. Sora 700 for display, Manrope 400–700 for body. Radii: pills 999, cards 16–22, inputs 10–11. Shadows: card `0 14px 40px rgba(10,22,38,0.06)`, hero `0 30px 70px rgba(10,22,38,0.12)`, blue CTA `0 14px 30px rgba(22,104,240,0.3)`.
**Advisor Platform:** see §1. Per-company branding (primary, accent, logo) must be injected as CSS variables at the root of that tenant's public pages, winning over defaults.

## Assets (in `uploads/`, `public/`)
MTC logos (`ptc-logo-no-tag-line-8c493deb.png` full horizontal, `ptc-logo-only.png` mark, `ptc-simple-flat*.png`), Brian headshot `BTLIpic.jpg`, portraits `SectaAI_00018_/00116_/00003_.png`, Authority Desk icon/logo. All MTC-specific — never bake into platform or template surfaces.

## Files
`Advisor Platform.dc.html`, `Landing Page.dc.html`, `About Brian.dc.html`, `Standard Pricing.dc.html`, `Commercial Pricing.dc.html`, `Buying Flow.dc.html`, `Profile Grade.dc.html`, `CRM Dashboard.dc.html`, `Platform Admin.dc.html`; data/logic: `platform.js`, `site-content.js`, `templates.js`, `grader.js`, `reviews.js`; runtime (do not port): `support.js`. Specs: `BUILD-SPEC.md`, `CLAUDE-CODE-PROMPT.md`.
