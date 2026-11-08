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
| `@workspace/shared` | `lib/shared` | Pure TypeScript shared by both sides: feature registry + plans + roles/permissions (`platform.ts`), landing content model incl. the About page (`siteContent.ts`), offer catalogue for the pricing pages and checkout (`offers.ts`), templates, reviews seed, **Profile Grader rubric + scoring engine** (`grader.ts`), zod request schemas. |

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
| `SENDGRID_WEBHOOK_PUBLIC_KEY` | optional | Verification key of the platform SendGrid account's signed Event Webhook (`/api/webhooks/sendgrid`). Without any key (platform or company) the endpoint answers 503 rather than recording bounces on anybody's say-so. |
| `SENDGRID_API_KEY`, `PLATFORM_FROM_EMAIL`, `PLATFORM_FROM_NAME` | for email | Platform sender (`partner@…`) used for invites, resets, magic links. Without a key nothing is sent; in development the action link is logged and returned as `devLink`. |
| `BRIGHTDATA_API_KEY` | grader | Platform-level Bright Data key for the Profile Grader (dataset `gd_l1viktl72bvl7bjuj0`), never per company. Unset outside production = **demo grading** with deterministic sample profiles; unset in production = grading off (the drawer says so). `GRADER_DEMO=true` forces demo mode. |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | checkout | Platform Stripe account. Company checkouts are **direct charges on each company's connected account** (`stripeAccount` header); the publishable key initialises Stripe.js for the embedded Checkout. Unset outside production = **demo checkout** (orders are marked paid by a demo button, nothing is charged). |
| `STRIPE_WEBHOOK_SECRET` | checkout | Signing secret of a **Connect** webhook endpoint ("events on connected accounts") pointed at `/api/webhooks/stripe`: `checkout.session.completed`, `payment_intent.succeeded` / `payment_failed` (installments), `charge.refunded`. |
| `STRIPE_CONNECT_CLIENT_ID` | optional | OAuth client id (`ca_…`) behind "Connect with Stripe" (Standard accounts, redirect `/api/stripe/connect/callback`). Without it owners paste their `acct_` id. |
| `CHECKOUT_DEMO` | optional | Force demo checkout (`true`). Never set in production. |
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
- **Requests** — the platform's own pipeline (`platform_leads`): demo and trial requests from the landing form, with status (new → contacted → demo booked / trial started → converted / closed), notes, and a link to the company a request became. A new request emails the super admin from the platform sender; the nav badge counts the new ones.
- All super-admin actions write `audit_logs` (`GET /api/admin/audit`).

## Company console (`/app` for company staff, `/admin/companies/:id/console` for the super admin)

One long page with anchored panels, all under `/api/companies/:companyId/*` (`requireCompany` + granular `requirePermission` + `requireFeature`):

- **Leads** — KPI tiles, List (stage chips, search) or **Pipeline** Kanban (drag-drop = stage change, logged as activity). **Manage columns** (admins/managers): rename, reorder, add, remove, Open/Won/Lost kind; leads in a removed column fall back to the first open stage. Public form `POST /api/public/leads` (tenant from host, rate-limited, honeypot) lands in the first open stage.
- **Lead drawer** — contact facts (click-to-call), goal, Profile Grade card (Phase 6), Calendly booking state + prefilled link (`utm_content=<lead publicId>` for webhook matching), status select, activity timeline, SendGrid composer (three outreach templates + personal note) sent from the **company's own** SendGrid; a clear 409 when it isn't connected.
- **Website (CMS)** — section rail, fields, Show-on-site toggles, hero **Audit card / Video** (video gated by `hero_video`), Preview draft / View live / Discard / Publish; read-only banner for managers. `GET /api/public/site` serves the published merge; `?preview=1` returns the draft to that company's staff or the super admin only. A company that never published renders the default template filled with its own name, never MTC's copy.
- **Reviews** — add / edit / hide / remove / reorder; hidden reviews never reach the public payload.
- **Profile Grader** — rubric editor (weights must total 100, check shares, tiers, grade thresholds), Reset to platform default, **Publish as vN** (published versions are immutable rows so reports can stamp the version that graded them).
- **Company settings** — Branding (colours injected as CSS variables; without `white_label` the public site falls back to platform defaults), Domain (platform subdomain always on; custom domain → generated TXT/CNAME/apex records with provider steps, Verify, 48h auto-recheck), Integrations (BYO SendGrid / Twilio / Stripe Connect / Calendly; secrets AES-256-GCM in `company_secrets`, API returns last-4 only; credentials are checked against the provider), Team (invite managers/advisors, per-area read/write grid).
- **Clients** — every paying client with tracker progress, current stage, intake / booking flags, money paid and outstanding. The drawer sets each of the seven stages (Done emails the client and moves the next stage to Current), adds files as links (optionally emailing the client), settles installments (charge the saved card in live mode, mark paid for money taken elsewhere, or cancel — `billing:write`), shows intake answers and bookings, and sends a fresh portal link.
- "Not in your plan" lock banner lists every gated feature with the plan name; nothing disappears silently.

## Public pages

Every company site is served from the same SPA, resolved by host (`/`, `/about`, `/pricing`, `/commercial-pricing`, `/grade/:publicId`, `/buy`); platform hosts serve the Advisor Platform landing at `/`. Pages are recreated from the `.dc.html` designs in `design_handoff/`; copy comes from the CMS, never from code.

- **Company landing (`/`)** — `GET /api/public/site` (published merge, reviews, Calendly URL, public feature flags). Hero audit card or video (`hero_video`), the animated journey map (steps light 1→5 on screen, pause on hover, vertical below 900px) with the Authority Desk hand-off card only when the company has `authority_desk`, cost / guide / plan / process sections behind their Show-on-site toggles, the testimonial slider (6s, pauses on hover, honours reduced motion), and the six-field audit form → `POST /api/public/leads` (honeypot, rate-limited) whose success card carries a prefilled Calendly link. Owner names in the copy come from `brand.ownerName` / `brand.ownerFullName`.
- **About (`/about`)** — the `about` CMS section (headline, portraits, ten weighted criteria as "Label | weight" lines, three questions, thresholds, how-I-work, closing CTA) with its own Show-on-site toggle; hidden pages return a not-found state and drop the nav link.
- **Pricing (`/pricing`, `/commercial-pricing`)** — `noindex, nofollow, noarchive`; an amber bar links the two pages to each other. Offers, prices, bullets and credits live in `lib/shared/src/offers.ts` (one catalogue for both pages and the buying flow). Pay-in-full / payment-plan toggle; `?plan=split` preselects it and `?offer=<key>` highlights a tier. CTAs go to `/buy?offer=&plan=` when the company has `stripe_checkout`, otherwise to its Calendly. `/buy` is a holding page until the Phase 5 checkout replaces it.
- **Profile Grade (`/grade/:publicId`)** — `GET /api/public/grade/:publicId` serves a `profile_assessments` row scored against the published rubric: a lead sees scores, quick wins and locked findings; an unlocked report shows every finding and the prioritised plan. `/grade/sample` scores the platform sample profile so the page can be previewed before the Grader (Phase 6) creates real assessments; staff may add `?view=full`.
- **Advisor Platform landing** — rendered from `GET /api/platform-content`; the demo/trial form posts to `POST /api/public/platform-leads` (platform hosts only, honeypot, rate-limited) and lands in Platform Admin → Requests; the success state offers the founder's Calendly, prefilled.
- **Drafts never leak**: `?preview=1` only returns a draft to signed-in staff of that company (or the super admin) and shows a "Draft preview" banner. Brand colours are injected as `--brand-*` CSS variables (`use-tenant.tsx`); the design's exact derived shades are used for the default blue, other brands derive theirs. Everything works at 360px with a collapsing menu.

## Buying flow (pricing → Stripe → portal)

`lib/stripe.ts`, `lib/orders.ts`, `lib/portal.ts`, `lib/calendly.ts`; routes `checkout.ts`, `webhooks.ts`, `portal.ts`, `clients.ts`. Recreated from `Buying Flow.dc.html`.

1. **Checkout (`/buy?offer=&plan=`)** — order summary, pay-in-full / 2× · 3× plan, order bumps (banner +$150, 72-hour rush +30%), buyer details → `POST /api/public/checkout` creates a pending `orders` row and, in live mode, an **embedded Checkout Session on the company's connected account** (bumps and plan lock once the session exists). Prices live in `lib/shared/src/offers.ts` (`priceOrder`), the same catalogue the pricing pages render. A company without `stripe_checkout` or without a connected account gets a 409 and the pricing CTAs fall back to Calendly (`company.checkout.ready` on the public payload).
2. **Fulfilment** (`fulfillOrder`, idempotent; called by the return page via `session_id` and by the webhook) — lead found or created and moved to the **won** stage; `clients` row + portal login (role `client`, magic-link only); the seven `client_stages`; an empty `intakes` row; `order_installments` every 30 days for plans (charged off-session with the card saved at checkout — `setup_future_usage`); welcome + receipt email to the buyer and an alert to the owner. Company mail goes out on the company's SendGrid when connected, otherwise from the platform key **with the company's name and the owner as Reply-To** (`lib/companyMail.ts`), so a firm mid-setup still reaches its buyers.
3. **Thank-you (`/thanks?order=`)** — confirms the charge (polls while Stripe's redirect beats the webhook) and lays out the three next steps. **Book (`/book?order=`)** — Calendly inline widget prefilled with name, email and LinkedIn, `utm_content=<order id>`; the browser's `calendly.event_scheduled` records a provisional booking, the **Calendly webhook** (`invitee.created` / `invitee.canceled`, HMAC-signed per company, registered from Company settings → Integrations) confirms it with the start time. **Intake (`/intake?order=`)** — the four questions and the publishing choice; marks the stage done, updates the lead, alerts the owner.
4. **Portal (`/portal`, clients only, magic link)** — stage tracker with actions, payments and schedule, files, the owner's card. `GET /api/portal` serves only the signed-in client's own record.
5. **Lifecycle** (`startCommerceScheduler`, hourly, not under tests): due installments are charged (live mode only — demo installments are settled from the console), an intake reminder goes out at +48h, interview prep 24h before a booking; stage completions and new files email the client when staff tick "notify". **Autoscale note:** the scheduler runs in-process; if the deployment scales to zero for long stretches, a Replit Scheduled Deployment hitting any page keeps it ticking, or settle installments from the console.
6. Webhooks are idempotent on `webhook_events (provider, event_id)` and written before processing; signatures are verified over the raw body (`express.raw` is mounted on `/api/webhooks` before `express.json()`).

## Profile Grader (Bright Data → rubric → gated report)

`lib/grader.ts` (API), `lib/shared/src/brightData.ts` (normaliser), `routes/leads.ts` (actions), `routes/publicSite.ts` (`GET /api/public/grade/:publicId`). The scoring engine itself is `lib/shared/src/grader.ts` (Phase 1).

- **Fetch** — the port of LinkedIn-Profile-Grader's `fetchLinkedInProfile`: trigger the dataset job (`discover_new=true`), poll the snapshot every 2 s for 60 s, retry the whole fetch once, record a clear failure message otherwise. `normalizeBrightDataProfile` keeps the source's field fallbacks, counting rules and activity buckets, and derives the Value & Service inputs from headline + About.
- **When it runs** — automatically when a landing-form lead arrives with a LinkedIn URL (the journey's "Get your Profile Grade" step), **without emailing anyone**: the owner reviews the grade in the lead drawer first. Staff run or re-run it from the drawer (`POST /companies/:id/leads/:leadId/grade`, optionally supplying the URL) with an "email the lead when graded" tick.
- **Versioned** — every `profile_assessments` row stamps the published rubric version that scored it; the report footer shows it. When a newer rubric is published the drawer offers **Re-score on vN** (same stored profile, no refetch), so before/after comparisons stay honest.
- **Gated** — a lead's report (`/grade/:publicId`, unguessable id) shows scores, quick wins and locked findings; staff always see the full report (and can preview the lead's view with `?view=summary`). **Unlock** happens when the lead buys (`fulfillOrder` → `unlockForLead`) or when staff click Unlock. "Email report" sends the summary with the link (`sendGradeEmail`, company letterhead), and says so plainly when email is not configured.
- Jobs are run in-process and awaited under tests; anything still `pending`/`fetching` after 15 minutes is marked failed by the hourly scheduler so a dead process never leaves a lead waiting silently.

## Hardening (Phase 7): Twilio, webhooks, audit, empty states, responsive

- **Twilio** (`lib/twilio.ts`) — per company (SID, auth token, number, alert number; toggles *Text clients reminders* and *Text me when a new lead arrives*). A landing-form lead texts the owner; the intake reminder and the 24h interview prep also go by SMS when the client has a phone. Every message is an `sms_logs` row. **Inbound** texts hit `/api/webhooks/twilio` (form-encoded, `X-Twilio-Signature` = HMAC-SHA1 of the called URL + sorted params with the company's auth token, company found by the `To` number), are logged and attached to the lead with that phone as an `sms_received` activity; delivery receipts (`/api/webhooks/twilio/status`) update the row.
- **SendGrid Event Webhook** (`lib/sendgridEvents.ts`, `/api/webhooks/sendgrid`) — ECDSA-signed deliveries verified against the platform key or any company's pasted key; `delivered` / `bounce` / `dropped` / `spamreport` / `deferred` move `email_logs.status`, opens and clicks are recorded in `email_events`; idempotent on `sg_event_id`; **503 when no key is configured anywhere**.
- **Every webhook** (`routes/webhooks.ts`) verifies its signature over the raw body, writes `webhook_events (provider, event_id)` first, and treats a repeat delivery as a no-op.
- **Audit log** — `GET /api/admin/audit` with `companyId` / `action` / `userId` / `before` filters, actor and company joined, paged; the Platform Admin → **Audit log** page. Logged: company create / plan / status (suspend, reactivate), feature overrides, **impersonation** (the super admin opening a company console, once per hour per company), template apply/save/delete, plan edits, platform content publish, requests, and company-level acts (stages, branding, integrations, grades, installments).
- **Empty states** — no leads ("your form is live at …" + test lead), no clients, no reviews (CTA), CMS on defaults shows **Start from a template** (company-side `GET /companies/:id/templates` + `POST …/site-content/apply-template`, draft only), default pipeline stages, platform rubric v1, integrations `not_connected` with SendGrid flagged required, domain = subdomain only.
- **Responsive** — public pages work at 360px; the company console and Platform Admin are desktop-first with a "best on desktop" notice under 1024px while leads, the lead drawer and the compact nav stay usable.

## Deploying on Replit

1. Create the Repl from this repo; add a **PostgreSQL** database (sets `DATABASE_URL`).
2. Add Secrets: `SESSION_SECRET`, `SUPER_ADMIN_PASSWORD`, `PLATFORM_ENCRYPTION_KEY`, and the provider keys you have (`SENDGRID_API_KEY`, `BRIGHTDATA_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`). In the Stripe dashboard add a **Connect** webhook endpoint for `https://<platform host>/api/webhooks/stripe` and, for OAuth, the redirect `https://<platform host>/api/stripe/connect/callback`.
3. **Run** uses `pnpm dev` (port 5000). **Deploy** (autoscale) builds with `pnpm install --frozen-lockfile && pnpm build` and runs `pnpm start`; both are in `.replit`.
4. Attach the platform domains to the deployment (`advisor-platform.com`, `advisor-platform.findabusinesspro.com`, `advisor-platform.authority-desk.com`) and a wildcard for company subdomains (`*.advisor-platform.findabusinesspro.com`).
5. Company custom domains: the company adds `_advisor-verify.<domain>` TXT (token shown in Company settings → Domain) and a `www` CNAME to `<slug>.advisor-platform.findabusinesspro.com`; the apex follows Replit's custom-domain instructions. The server re-checks pending domains every 10 minutes for 48 hours.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 1 | Workspace, DB + migrations, seed, auth (all roles, invites, reset, magic link), tenant resolver | done |
| 2 | Platform Admin (companies, plans, feature registry + overrides, templates, settings, platform landing CMS) | done |
| 3 | Company console (leads, pipeline, lead drawer, Website CMS, Reviews, rubric editor, settings) | done |
| 4 | Public pages (landing, About, pricing ×2, Profile Grade, Advisor Platform landing, platform requests pipeline) | done |
| 5 | Buying flow (Stripe Connect checkout, installments, Calendly booking + webhook, intake, SendGrid lifecycle mail, client portal, Clients console) | done |
| 6 | Profile Grader (Bright Data fetch + normaliser, auto-grade on lead form, staff run/re-run/re-score/unlock/email, gated report) | done |
| 7 | Twilio (alerts, reminders, inbound), SendGrid events, hardened idempotent webhooks, audit log UI, template prompt, responsive QA | done |
