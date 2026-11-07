# Claude Code kickoff prompt

Paste into Claude Code at the repo root after creating a new GitHub repo (e.g. `agilityengineers/Advisor-Platform`) and connecting it to a Replit project.

---

Read `design_handoff_advisor_platform/README.md` and `design_handoff_advisor_platform/BUILD-SPEC.md` completely before writing code.

You are building **Advisor Platform**, a multi-tenant white-label SaaS for LinkedIn advisory professionals. **Production is Replit** — Replit Deployments, Replit Postgres (`DATABASE_URL`), Replit Secrets, Replit Object Storage. Structure the repo as a pnpm workspace mirroring `agilityengineers/Tax-Strategies-AI` (Vite + React + TypeScript + Tailwind client, Express 5 API, Drizzle ORM, Zod); reuse its patterns for tenant resolution, feature flags (`requireFeature`), custom domains, branding CSS-variable injection, and encrypted per-tenant secrets. Port the scoring engine from `agilityengineers/LinkedIn-Profile-Grader/server/scoring.ts` into the data-driven rubric shape in `grader.js`.

The `.dc.html` files are high-fidelity visual references — recreate them as React routes with the exact copy, colors, type, spacing, and interactions described in the README. Do not ship the HTML or `support.js`. The `.js` data files (`platform.js`, `site-content.js`, `templates.js`, `grader.js`, `reviews.js`) define the data model and business rules — port them into Drizzle schema + shared TypeScript types.

Hierarchy is fixed: super admin Clarence Williams (`emailme@clarencewilliams.com`, `clarencewilliams`) owns the platform; **My Target Client / Brian Traichel is the first company (an Admin), not the platform**. Roles: super_admin, admin, manager, advisor, client with granular team permissions.

Build in this order, opening a PR per phase:
1. Workspace, DB, migrations, seed (super admin + MTC company), auth (all roles, invites, reset), tenant resolver (custom domain → subdomain → `/t/:slug` → platform).
2. Platform Admin: companies CRUD, plans, feature registry + per-company overrides, templates, platform settings, **platform landing CMS**.
3. Company console: leads list + pipeline board with editable stages, lead drawer, Website CMS (draft/publish), Reviews, Company settings (branding, domain + DNS verify, integrations, team).
4. Public pages per tenant: landing (template-driven), About, Standard Pricing, Commercial Pricing, Profile Grade; Advisor Platform landing for platform hosts.
5. Buying flow: Stripe Connect checkout with bumps/plans, thank-you, Calendly inline booking + webhook, intake, SendGrid welcome sequence, client portal.
6. Profile Grader: Bright Data fetch (key supplied as a Replit Secret), rubric editor with versioning, gated report, unlock.
7. Twilio reminders/alerts, webhooks hardened (idempotent, signed), empty states, responsive QA, audit log.

Constraints: no secrets in the browser; feature-gated UI shows a lock with the plan name; drafts never leak to visitors; the super admin inside a company dashboard shows the Advisor Platform identity and a "Viewing company: X" banner. Write a `replit.md` documenting env vars, boot seed, and deploy steps. Run typecheck and tests before each PR.
