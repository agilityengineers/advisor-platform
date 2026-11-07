# BUILD-SPEC — Advisor Platform (Replit production)

The `.dc.html` files are the visual spec; this is the behavioral spec for everything the prototype fakes. **Production runs on Replit**: Replit Deployments (autoscale), Replit Postgres (Neon-backed), Replit Secrets for env vars, Replit Object Storage for uploads. Follow `agilityengineers/Tax-Strategies-AI` conventions (pnpm workspace, Vite + React + TS + Tailwind client, Express 5 API, Drizzle ORM, Zod, feature flags, tenant isolation) unless noted.

## 0. Stack (decide once, then follow)
- Monorepo: `artifacts/web` (Vite React TS Tailwind), `artifacts/api` (Express 5 + Drizzle), `lib/db` (schema), `lib/shared` (zod, feature registry, rubric types).
- Postgres via Replit (`DATABASE_URL`). Migrations with drizzle-kit; run on boot like Tax-Strategies `ensureAdmin`/seed.
- One Replit deployment serves API + static client. Custom domains attach to the deployment (see §2).
- Fonts: Sora/Manrope (company default), Newsreader/Hanken Grotesk (platform) — Google Fonts or self-hosted.

## 1. Auth & accounts
- Roles: `super_admin`, `admin`, `manager`, `advisor`, `client`. JWT (7d) with `userId, email, role, companyId|null`. Super admin has `companyId = null` and bypasses tenant checks (Tax-Strategies pattern).
- Screens to design/build (not in prototype): sign-in chooser (staff vs client), staff sign-in, client sign-in (magic link acceptable), register-via-invite (accept invite → set password), forgot/reset password, 2FA optional. White-label doors: a company's sign-in page shows that company's branding and never the platform's.
- Seed at boot (idempotent upserts): super admin Clarence Williams `emailme@clarencewilliams.com` / `clarencewilliams`; company `mytargetclient` with admin Brian Traichel on plan `white_label`.
- Invites: `team_invites` (token, role, perms, expires). Accept → create user bound to company. Company creation from Platform Admin sends the first Admin invite via **platform** SendGrid (`partner@`).

## 2. Tenant resolution & domains
- Resolve company per request, in order: exact `custom_domains.domain` (verified + active) → `<slug>.advisor-platform.findabusinesspro.com` → `/t/:slug` path → platform surfaces (`advisor-platform.com`, `advisor-platform.authority-desk.com`) resolve to the **platform**, not a company.
- `custom_domains` as in Tax-Strategies: `domain, verification_token, verification_method (dns_txt), verified, verified_at, ssl_status, active`. Verify by TXT `_advisor-verify.<domain>` = token; CNAME `www` → `<slug>.advisor-platform.findabusinesspro.com`; apex via A/ALIAS per Replit's custom-domain instructions. Re-check every 10 min for 48h; show status + provider-specific steps (GoDaddy, Cloudflare — set "DNS only" during issuance —, Namecheap, Squarespace, Other).
- SSL: Replit Deployments issues certs for attached custom domains; surface `ssl_status` from the deployment API or mark `active` once the domain resolves over HTTPS.

## 3. Secrets & integrations (per company, BYO)
- Encrypt at rest with `PLATFORM_ENCRYPTION_KEY` (Replit Secret). Never return decrypted keys to the browser; show last-4 only.
- `company_integrations`: `provider (sendgrid|twilio|stripe|calendly), status (not_connected|pending|connected|error), config jsonb (non-secret), secret_ref` → `company_secrets` (encrypted).
- **SendGrid (required):** API key, from name/address, sending domain. Domain authentication via SendGrid API; `domain_verified`. Per-company suppression (subusers if available). Event webhook → `email_events`.
- **Twilio:** account SID, auth token, company number (provision via API or paste). Use: interview/intake reminders to clients, new-lead alert to admin. Inbound webhook logs to lead activity.
- **Stripe:** Stripe Connect (Standard). Checkout uses the company's connected account; platform may take an application fee later. Webhook `checkout.session.completed`, `invoice.paid` (plans), `charge.refunded` → `orders`. Platform billing for plans is a separate platform-level Stripe account.
- **Calendly:** event type URL + personal access token; register `invitee.created` webhook; match by `utm_content = orderId` or invitee email → mark interview scheduled on lead/portal.
- **Bright Data (grader):** platform-level key provided at build time (`BRIGHTDATA_API_KEY`); dataset `gd_l1viktl72bvl7bjuj0`; async job + poll (2s, 60s, one retry) exactly as `LinkedIn-Profile-Grader`.
- **Zapier:** optional outbound only (webhook on lead created / order paid). All inbound integrations above are direct; do not route core flows through Zapier.

## 4. Webhooks (one route each, idempotent by provider event id)
`POST /webhooks/stripe` · `/webhooks/calendly` · `/webhooks/sendgrid` · `/webhooks/twilio` · `/webhooks/brightdata` (if callback mode). Verify signatures. Write to `webhook_events` then process.

## 5. Schema (replaces localStorage keys)
| Prototype key | Table |
|---|---|
| `platform-accounts` | `companies` (name, slug, plan, status, overrides jsonb, created_at), `company_branding`, `custom_domains`, `company_integrations`, `company_secrets`, `team_members` (+ `perms` jsonb) |
| `platform-plans`, `FEATURE_REGISTRY` | `plans` (key, name, price, feature_keys), feature registry as code constant (Tax-Strategies pattern) |
| `mtc-content:<id>` / `mtc-content-draft:<id>` | `site_content` (company_id, status draft\|published, content jsonb, published_at, version) |
| `mtc-hero:<id>` | folded into `site_content.content.heroMedia` |
| `mtc-reviews:<id>` | `reviews` (company_id, name, role, category, linkedin, quote, visible, sort) |
| `mtc-stages:<id>` | `pipeline_stages` (company_id, name, kind open\|won\|lost, color, sort) |
| `grader-rubric:<id>` | `grader_rubrics` (company_id, version, rubric jsonb, published_at) |
| `grader-profile:<id>` | `profile_assessments` (lead_id, profile jsonb, scores jsonb, rubric_version, unlocked) |
| `platform-templates` | `landing_templates` (name, source_company_id, content jsonb, tokens) |
| SEED leads | `leads` (company_id, name, email, phone, category, linkedin, goal, stage_id, source, created_at), `lead_activity`, `bookings` |
| Buying Flow state | `orders` (lead_id, offer_key, plan, bumps jsonb, amount, stripe_session, status), `order_installments`, `intakes`, `clients`, `client_stages`, `client_files` |
| Platform landing | `platform_content` (draft/published) |
Also: `users`, `team_invites`, `email_logs`, `email_events`, `sms_logs`, `webhook_events`, `audit_logs`.

## 6. Lead → client → portal
- Lead created by landing form (status = first `open` stage). Grader run creates `profile_assessments`; summary emailed; unlock recorded.
- Order paid (Stripe webhook) → `clients` row (or link existing), lead moved to the company's `won` stage, portal record created, welcome email sent, intake + booking links generated.
- Portal stages (7, from Buying Flow): payment received, intake complete, interview (booked via Calendly webhook), Blueprint delivered, draft v1, revisions, published + check-in. Files attach per stage. Installments listed from Stripe.
- Client sign-in = magic link to portal; sees own record only.

## 7. Empty states (new company)
No leads (show "your form is live at <url>" + test-lead button); no reviews (CTA to add first); CMS using template defaults with "Apply a template" prompt if none; pipeline with default stages; grader with platform default rubric v1; integrations all `not_connected` with SendGrid flagged required; domain = subdomain only.

## 8. Responsive
Public pages (platform landing, company landing, About, both pricing, buying flow, profile grade) must work ≥360px. CRM Dashboard and Platform Admin are desktop-first (≥1024px); below that show a "best on desktop" notice but keep leads list and lead drawer usable.

## 9. Out of prototype scope but v1
- Platform landing CMS (super admin) incl. AI now/roadmap tags.
- About page per company via CMS.
- Audit log of super-admin actions (overrides, suspensions, impersonation).
- Rate limiting + honeypot on public forms (as in Profile-Grader).

## 10. Non-goals for v1
AI lead scoring, AI landing copy, multi-touch sequences (keep labeled Roadmap). Public pricing on the platform page.
