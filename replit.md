# Advisor Platform

White-label SaaS for LinkedIn advisory professionals. Each **company** (an Admin) gets a branded landing page, lead-to-close pipeline, Website CMS, Reviews, Profile Grader, Stripe checkout, Calendly booking and a client portal on its own subdomain or custom domain. The **super admin** (Clarence Williams) runs the platform: companies, plans, feature registry and overrides, landing templates, platform settings and the Advisor Platform landing CMS. **My Target Client (Brian Traichel) is the first company, not the platform.**

Production runs on **Replit**: Replit Deployments (autoscale), Replit Postgres (`DATABASE_URL`), Replit Secrets, Replit Object Storage for uploads.

## Layout

pnpm workspace (Node 22, TypeScript 5.9):

| Package | Path | What |
|---|---|---|
| `@workspace/web` | `artifacts/web` | Vite 7 + React 19 + Tailwind 4 client (wouter, TanStack Query). Built to `artifacts/web/dist`. |
| `@workspace/api` | `artifacts/api` | Express 5 API. Serves the built client in production and runs Vite in middleware mode in development, so **one process on one port** handles API + pages (host-based tenant resolution works in the Replit preview). Bundled with esbuild to `dist/index.mjs`. |
| `@workspace/db` | `lib/db` | Drizzle ORM schema (`src/schema/*`), connection, migration runner. SQL migrations in `lib/db/drizzle` (drizzle-kit). |
| `@workspace/shared` | `lib/shared` | Pure TypeScript shared by both sides: feature registry + plans + roles/permissions (`platform.ts`), landing content model (`siteContent.ts`), templates, reviews seed, **Profile Grader rubric + scoring engine** (`grader.ts`), zod request schemas. |

`design_handoff/` holds the design bundle (`.dc.html` references, `*.js` data files, BUILD-SPEC, README). It is documentation, not shipped code.

## Commands

```bash
pnpm install                      # pnpm only (preinstall hook blocks npm/yarn)
pnpm dev                          # API + Vite middleware on $PORT (5000)
pnpm typecheck                    # tsc --build for libs, then each artifact
pnpm test                         # vitest in lib/shared and artifacts/api (API tests need DATABASE_URL)
pnpm build                        # typecheck → web build → api bundle
pnpm start                        # production: node artifacts/api/dist/index.mjs
pnpm db:generate                  # drizzle-kit generate: new SQL migration from schema changes
pnpm db:migrate                   # apply pending migrations (also done automatically at boot)
pnpm db:studio                    # drizzle studio
```

## Environment variables (Replit Secrets)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Replit Postgres (set automatically when you add a database). |
| `SESSION_SECRET` | yes (prod) | JWT signing secret (7-day tokens). Dev generates a throwaway one and warns. |
| `SUPER_ADMIN_PASSWORD` | yes (prod) | Password for `emailme@clarencewilliams.com` / `clarencewilliams`. **Re-synced on every boot** — rotate here, not in-app. Dev falls back to `Success2026` with a warning. |
| `PLATFORM_ENCRYPTION_KEY` | recommended | AES-256-GCM key for per-company integration secrets (`company_secrets`). If unset, one is generated at first boot and stored in `platform_config`; put it in a password manager — a restored database without it is ciphertext. |
| `PLATFORM_PRIMARY_DOMAIN` | no | Default `advisor-platform.findabusinesspro.com`. |
| `PLATFORM_SUBDOMAIN_BASE` | no | Company subdomains hang off this (default `advisor-platform.findabusinesspro.com`). |
| `PLATFORM_HOSTS` | no | Comma list of hosts that resolve to the platform (not a company). Defaults to the three platform domains; localhost and `*.replit.dev/app` always count as platform. |
| `APP_URL` | no | Public base URL for emails when no tenant host applies. |
| `SENDGRID_API_KEY`, `PLATFORM_FROM_EMAIL`, `PLATFORM_FROM_NAME` | for email | Platform sender (`partner@…`) used for invites, resets, magic links. Without a key nothing is sent; in development the action link is logged and returned as `devLink`. |
| `BRIGHTDATA_API_KEY` | Phase 6 | Platform-level Bright Data key for the Profile Grader (dataset `gd_l1viktl72bvl7bjuj0`). |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Phase 5 | Platform Stripe account (plan billing, Connect application fees). Company checkout uses each company's connected account. |
| `MTC_ADMIN_PASSWORD` | dev only | Gives the seeded MTC admin (Brian) a password locally. In production Brian sets his password via the invite / "Forgot password" link. |
| `SEED_DEMO` | dev only | `true` seeds the prototype's demo companies (Northstar Advisory, Career Pro Guider) and MTC's demo team. |
| `CORS_ALLOWED_ORIGINS` | prod | Comma list of allowed browser origins for `/api`. Unset = reflect all. |
| `PORT`, `NODE_ENV`, `LOG_LEVEL` | runtime | `.replit` sets `PORT=5000`. |
| `SKIP_MIGRATIONS`, `MIGRATIONS_DIR` | ops | Escape hatches for the boot migration step. |

See `.env.example` for the full list.

## Boot sequence (every start, idempotent)

1. **Migrations** — `applyMigrations()` runs pending drizzle-kit migrations from `lib/db/drizzle` under a Postgres advisory lock (two autoscale instances cannot race). Startup-critical: a schema behind the code refuses to serve.
2. **Encryption key** — `initEncryptionKey()` resolves `PLATFORM_ENCRYPTION_KEY` (env → `platform_config` → generate).
3. **Seed** (`artifacts/api/src/lib/seed.ts`):
   - `plans` from `DEFAULT_PLANS` (Starter $99 · Professional $249 · White Label $599 · Enterprise custom). Insert-only — the Platform Admin feature matrix is the source of truth once a row exists.
   - Super admin **Clarence Williams** (`emailme@clarencewilliams.com`, username `clarencewilliams`, `companyId = null`), password re-synced from the secret; any other `super_admin` row is deactivated.
   - Company **`mytargetclient`** (My Target Client) on plan `white_label`, status `active`, override `authority_desk: true`, MTC branding, admin **Brian Traichel** (`briantraichel@gmail.com`), default pipeline stages, four `company_integrations` rows (`not_connected`), published rubric v1, published `site_content` (MTC defaults) and the seven seed reviews.
   - Landing template **Profile Authority**, platform default rubric v1.
4. Express app + SPA mounted, server listens on `PORT`.

## Tenant resolution

Per request, in order (`artifacts/api/src/lib/tenant.ts`):

1. exact `custom_domains.domain` that is **verified + active** → company
2. `<slug>.<PLATFORM_SUBDOMAIN_BASE>` → company
3. `/t/:slug` path (and `/api/t/:slug/...`, which is rewritten to `/api/...`) → company
4. otherwise → platform (includes the Replit preview URL)

The SPA asks `GET /api/tenant` first, then injects the company's colours as CSS variables (`--brand-primary`, `--brand-accent`, …) at `:root`. A company's sign-in door shows only that company's branding.

## Auth

- Roles: `super_admin`, `admin`, `manager`, `advisor`, `client`. JWT (7d) with `userId, email, role, companyId|null`; standing (deactivated user / suspended company) re-checked on every request.
- Staff sign in with email (or the super admin's username) + password at `/staff/login`. A company door admits only that company's staff plus the super admin.
- Clients sign in with a **magic link** at `/client/login` (15-minute, single-use).
- Invitations (`team_invites`, hashed tokens, 7 days) → `/accept-invite?token=…` sets name + password. Password reset: `/forgot-password` → `/reset-password?token=…` (single-use, 60 minutes, enumeration-safe).
- Company routes live under `/api/companies/:companyId/*`; `requireCompany` lets the super admin enter any company, everyone else only their own; `requirePermission(area, level)` enforces the granular grid for managers/advisors; `requireFeature(key)` returns `403 { error: "Not in your plan", requiredPlanName }` so the UI can show the lock.

## Platform Admin (`/admin`, super admin only)

- **Companies** — KPIs (total, active, trial, MRR), table, drawer. The drawer changes plan and status (suspend / reactivate), sets per-feature overrides (**Plan / On / Off**; the source label says "Included in <plan>", "Not in <plan>", "Forced on/off by super admin"), shows integrations (read-only; owned by the company Admin) and the team, and opens the company console at `/admin/companies/:id/console` with the "Viewing company: X" banner.
- **New company** creates the company, its branding row, default stages, integration rows, rubric v1, a CMS **draft** seeded from the default template, and emails the first Admin an invitation from the platform sender.
- **Templates** — apply a template to a company (writes that company's CMS draft; the Admin publishes it), remove non-default templates; "Save page as template" in the drawer snapshots a company's published page with logo/photos/testimonials stripped and `{company}` / `{owner}` / `{ownerFirst}` tokens restored.
- **Feature registry** — features × plans tick matrix (edits `plans.feature_keys`). **Plans** — cards with name/price/description editing.
- **Platform landing** — CMS for every text block on the Advisor Platform landing page (`platform_content`, draft → publish). `GET /api/platform-content` serves the published copy; `?preview=1` returns the draft to the super admin only.
- All super-admin actions write `audit_logs` (`GET /api/admin/audit`).

## Company console (`/app` for company staff, `/admin/companies/:id/console` for the super admin)

One long page with anchored panels, all under `/api/companies/:companyId/*` (`requireCompany` + granular `requirePermission` + `requireFeature`):

- **Leads** — KPI tiles, List (stage chips, search) or **Pipeline** Kanban (drag-drop = stage change, logged as activity). **Manage columns** (admins/managers): rename, reorder, add, remove, Open/Won/Lost kind; leads in a removed column fall back to the first open stage. Public form `POST /api/public/leads` (tenant from host, rate-limited, honeypot) lands in the first open stage.
- **Lead drawer** — contact facts (click-to-call), goal, Profile Grade card (Phase 6), Calendly booking state + prefilled link (`utm_content=<lead publicId>` for webhook matching), status select, activity timeline, SendGrid composer (three outreach templates + personal note) sent from the **company's own** SendGrid; a clear 409 when it isn't connected.
- **Website (CMS)** — section rail, fields, Show-on-site toggles, hero **Audit card / Video** (video gated by `hero_video`), Preview draft / View live / Discard / Publish; read-only banner for managers. `GET /api/public/site` serves the published merge; `?preview=1` returns the draft to that company's staff or the super admin only. A company that never published renders the default template filled with its own name, never MTC's copy.
- **Reviews** — add / edit / hide / remove / reorder; hidden reviews never reach the public payload.
- **Profile Grader** — rubric editor (weights must total 100, check shares, tiers, grade thresholds), Reset to platform default, **Publish as vN** (published versions are immutable rows so reports can stamp the version that graded them).
- **Company settings** — Branding (colours injected as CSS variables; without `white_label` the public site falls back to platform defaults), Domain (platform subdomain always on; custom domain → generated TXT/CNAME/apex records with provider steps, Verify, 48h auto-recheck), Integrations (BYO SendGrid / Twilio / Stripe Connect / Calendly; secrets AES-256-GCM in `company_secrets`, API returns last-4 only; credentials are checked against the provider), Team (invite managers/advisors, per-area read/write grid).
- "Not in your plan" lock banner lists every gated feature with the plan name; nothing disappears silently.

## Deploying on Replit

1. Create the Repl from this repo; add a **PostgreSQL** database (sets `DATABASE_URL`).
2. Add Secrets: `SESSION_SECRET`, `SUPER_ADMIN_PASSWORD`, `PLATFORM_ENCRYPTION_KEY`, and the provider keys you have (`SENDGRID_API_KEY`, `BRIGHTDATA_API_KEY`, `STRIPE_*`).
3. **Run** uses `pnpm dev` (port 5000). **Deploy** (autoscale) builds with `pnpm install --frozen-lockfile && pnpm build` and runs `pnpm start`; both are in `.replit`.
4. Attach the platform domains to the deployment (`advisor-platform.com`, `advisor-platform.findabusinesspro.com`, `advisor-platform.authority-desk.com`) and a wildcard for company subdomains (`*.advisor-platform.findabusinesspro.com`).
5. Company custom domains: the company adds `_advisor-verify.<domain>` TXT (token shown in Company settings → Domain) and a `www` CNAME to `<slug>.advisor-platform.findabusinesspro.com`; the apex follows Replit's custom-domain instructions. The server re-checks pending domains every 10 minutes for 48 hours.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 1 | Workspace, DB + migrations, seed, auth (all roles, invites, reset, magic link), tenant resolver | done |
| 2 | Platform Admin (companies, plans, feature registry + overrides, templates, settings, platform landing CMS) | done |
| 3 | Company console (leads, pipeline, lead drawer, Website CMS, Reviews, rubric editor, settings) | done |
| 4 | Public pages (landing, About, pricing ×2, Profile Grade, Advisor Platform landing) | next |
| 5 | Buying flow (Stripe Connect, Calendly, intake, SendGrid, portal) | |
| 6 | Profile Grader (Bright Data, rubric versions, gated report) | |
| 7 | Twilio, hardened webhooks, empty states, responsive QA, audit log | |
