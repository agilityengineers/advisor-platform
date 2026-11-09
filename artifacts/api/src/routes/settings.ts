import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, companyBrandingTable, customDomainsTable } from "@workspace/db";
import { BrandingBody, DomainBody, DomainProviderBody, IntegrationSaveBody, INTEGRATION_DEFS, DNS_PROVIDER_STEPS, integrationProviderSchema, validateSenderConfig } from "@workspace/shared";
import { authMiddleware, requireCompany, requireRole } from "../lib/auth";
import { companyFeatures, requireFeature } from "../lib/features";
import { checkTxtRecord, dnsInstructions, newVerificationToken } from "../lib/domains";
import { invalidateTenantCache } from "../lib/tenant";
import { disconnectIntegration, integrationViews, saveIntegration } from "../lib/integrations";
import { audit } from "../lib/audit";
import { env } from "../env";
import jwt from "jsonwebtoken";
import { registerCalendlyWebhook } from "../lib/calendly";
import { connectAuthorizeUrl, exchangeConnectCode } from "../lib/stripe";
import { companiesTable } from "@workspace/db";

const router: IRouter = Router();
const owner = [authMiddleware, requireCompany, requireRole("admin", "super_admin")] as const;

async function domainView(companyId: number, slug: string) {
  const [d] = await db.select().from(customDomainsTable).where(eq(customDomainsTable.companyId, companyId)).limit(1);
  return {
    subdomain: `${slug}.${env.platformSubdomainBase}`,
    custom: d
      ? {
          id: d.id,
          domain: d.domain,
          provider: d.provider,
          verified: d.verified,
          verifiedAt: d.verifiedAt?.toISOString() ?? null,
          active: d.active,
          sslStatus: d.sslStatus,
          lastCheckedAt: d.lastCheckedAt?.toISOString() ?? null,
          lastError: d.lastError,
          recheckUntil: d.recheckUntil?.toISOString() ?? null,
          records: dnsInstructions(d.domain.replace(/^www\./, ""), slug, d.verificationToken),
          steps: DNS_PROVIDER_STEPS[d.provider] ?? DNS_PROVIDER_STEPS.other,
        }
      : null,
  };
}

router.get("/companies/:companyId/settings", ...owner, async (req, res) => {
  const company = req.company!;
  const [branding] = await db.select().from(companyBrandingTable).where(eq(companyBrandingTable.companyId, company.id)).limit(1);
  res.json({
    branding: branding ? { companyName: branding.companyName, tagline: branding.tagline, logoUrl: branding.logoUrl, primaryColor: branding.primaryColor, accentColor: branding.accentColor } : { companyName: company.name, tagline: "", logoUrl: "", primaryColor: "#1668F0", accentColor: "#0A1626" },
    domain: await domainView(company.id, company.slug),
    integrations: await integrationViews(company.id),
    integrationDefs: INTEGRATION_DEFS,
    features: await companyFeatures(company),
    dnsProviderSteps: DNS_PROVIDER_STEPS,
  });
});

router.put("/companies/:companyId/settings/branding", ...owner, async (req, res) => {
  const company = req.company!;
  const parsed = BrandingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid branding" });
    return;
  }
  const b = parsed.data;
  if (b.logoUrl && !/^(https?:\/\/|\/)/.test(b.logoUrl)) {
    res.status(400).json({ error: "Logo URL must start with https:// or /" });
    return;
  }
  await db
    .insert(companyBrandingTable)
    .values({ companyId: company.id, ...b })
    .onConflictDoUpdate({ target: companyBrandingTable.companyId, set: { ...b, updatedAt: new Date() } });
  invalidateTenantCache({ slug: company.slug });
  await audit(req, { action: "branding_updated", resourceType: "company_branding", details: b });
  res.json({ ok: true, branding: b });
});

// ---------------------------------------------------------------------------
// Custom domain (White label)
// ---------------------------------------------------------------------------

router.post("/companies/:companyId/settings/domain", ...owner, requireFeature("white_label"), async (req, res) => {
  const company = req.company!;
  const parsed = DomainBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid domain" });
    return;
  }
  const domain = parsed.data.domain;
  const platformBases = [env.platformSubdomainBase, ...env.platformLegacySubdomainBases];
  if (env.platformHosts.includes(domain) || platformBases.some((b) => domain === b || domain.endsWith(`.${b}`))) {
    res.status(400).json({ error: "That host belongs to the platform" });
    return;
  }
  const [taken] = await db.select({ companyId: customDomainsTable.companyId }).from(customDomainsTable).where(eq(customDomainsTable.domain, domain)).limit(1);
  if (taken && taken.companyId !== company.id) {
    res.status(409).json({ error: "That domain is already connected to another company" });
    return;
  }
  const [existing] = await db.select().from(customDomainsTable).where(eq(customDomainsTable.companyId, company.id)).limit(1);
  const token = existing?.verificationToken ?? newVerificationToken();
  const recheckUntil = new Date(Date.now() + 48 * 3600_000);
  if (existing) {
    if (existing.domain !== domain) invalidateTenantCache({ domain: existing.domain });
    await db.update(customDomainsTable).set({ domain, provider: parsed.data.provider, verified: false, verifiedAt: null, active: false, sslStatus: "pending", lastCheckedAt: null, lastError: null, recheckUntil, updatedAt: new Date() }).where(eq(customDomainsTable.id, existing.id));
  } else {
    await db.insert(customDomainsTable).values({ companyId: company.id, domain, provider: parsed.data.provider, verificationToken: token, verified: false, active: false, sslStatus: "pending", recheckUntil });
  }
  await audit(req, { action: "custom_domain_set", resourceType: "custom_domain", details: { domain, provider: parsed.data.provider } });
  res.status(201).json(await domainView(company.id, company.slug));
});

router.patch("/companies/:companyId/settings/domain", ...owner, async (req, res) => {
  const parsed = DomainProviderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pick a provider" });
    return;
  }
  await db.update(customDomainsTable).set({ provider: parsed.data.provider, updatedAt: new Date() }).where(eq(customDomainsTable.companyId, req.company!.id));
  res.json(await domainView(req.company!.id, req.company!.slug));
});

router.post("/companies/:companyId/settings/domain/verify", ...owner, async (req, res) => {
  const company = req.company!;
  const [d] = await db.select().from(customDomainsTable).where(eq(customDomainsTable.companyId, company.id)).limit(1);
  if (!d) {
    res.status(404).json({ error: "Add a custom domain first" });
    return;
  }
  const apex = d.domain.replace(/^www\./, "");
  const result = await checkTxtRecord(apex, d.verificationToken);
  const now = new Date();
  if (result.verified) {
    await db.update(customDomainsTable).set({ verified: true, verifiedAt: now, active: true, sslStatus: "provisioning", lastCheckedAt: now, lastError: null, updatedAt: now }).where(eq(customDomainsTable.id, d.id));
    invalidateTenantCache({ domain: d.domain });
    await audit(req, { action: "custom_domain_verified", resourceType: "custom_domain", resourceId: d.id, details: { domain: d.domain } });
    res.json({ verified: true, ...(await domainView(company.id, company.slug)) });
    return;
  }
  const error = result.transient ? "DNS lookup temporarily unavailable — try again in a few minutes" : `TXT record not found yet (checked _advisor-verify.${apex} and ${apex}). DNS can take up to 48 hours.`;
  await db.update(customDomainsTable).set({ lastCheckedAt: now, lastError: error, updatedAt: now }).where(eq(customDomainsTable.id, d.id));
  res.status(422).json({ verified: false, error, found: result.found, ...(await domainView(company.id, company.slug)) });
});

router.delete("/companies/:companyId/settings/domain", ...owner, async (req, res) => {
  const [d] = await db.select().from(customDomainsTable).where(eq(customDomainsTable.companyId, req.company!.id)).limit(1);
  if (d) {
    await db.delete(customDomainsTable).where(eq(customDomainsTable.id, d.id));
    invalidateTenantCache({ domain: d.domain });
    await audit(req, { action: "custom_domain_removed", resourceType: "custom_domain", resourceId: d.id, details: { domain: d.domain } });
  }
  res.json(await domainView(req.company!.id, req.company!.slug));
});

// ---------------------------------------------------------------------------
// Integrations (BYO SendGrid, Twilio, Stripe, Calendly)
// ---------------------------------------------------------------------------

router.put("/companies/:companyId/settings/integrations/:provider", ...owner, async (req, res) => {
  const company = req.company!;
  const provider = integrationProviderSchema.safeParse(req.params.provider);
  if (!provider.success) {
    res.status(400).json({ error: "Unknown provider" });
    return;
  }
  const def = INTEGRATION_DEFS.find((d) => d.provider === provider.data)!;
  const features = await companyFeatures(company);
  const featureKey = { sendgrid: "sendgrid", twilio: "twilio_sms", stripe: "stripe_checkout", calendly: "calendly" }[provider.data] as keyof typeof features;
  if (!features[featureKey]) {
    res.status(403).json({ error: "Not in your plan", feature: featureKey });
    return;
  }
  const parsed = IntegrationSaveBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const current = (await integrationViews(company.id)).find((v) => v.provider === provider.data)!;
  for (const f of def.fields) {
    if (!f.required) continue;
    const have = f.secret ? Boolean(parsed.data.secrets[f.key]?.trim()) || current.secrets[f.key]?.set : Boolean(String(parsed.data.config[f.key] ?? current.config[f.key] ?? "").trim());
    if (!have) {
      res.status(400).json({ error: `${f.label} is required` });
      return;
    }
  }
  if (provider.data === "sendgrid") {
    const senderError = validateSenderConfig({ ...current.config, ...parsed.data.config });
    if (senderError) {
      res.status(400).json({ error: senderError });
      return;
    }
  }
  const view = await saveIntegration(company, provider.data, parsed.data);
  await audit(req, { action: "integration_saved", resourceType: "company_integration", details: { provider: provider.data, status: view.status } });
  res.json(view);
});

router.post("/companies/:companyId/settings/integrations/:provider/verify", ...owner, async (req, res) => {
  const company = req.company!;
  const provider = integrationProviderSchema.safeParse(req.params.provider);
  if (!provider.success) {
    res.status(400).json({ error: "Unknown provider" });
    return;
  }
  const view = await saveIntegration(company, provider.data, { config: {}, secrets: {} });
  res.json(view);
});

router.post("/companies/:companyId/settings/integrations/:provider/disconnect", ...owner, async (req, res) => {
  const provider = integrationProviderSchema.safeParse(req.params.provider);
  if (!provider.success) {
    res.status(400).json({ error: "Unknown provider" });
    return;
  }
  await disconnectIntegration(req.company!.id, provider.data);
  await audit(req, { action: "integration_disconnected", resourceType: "company_integration", details: { provider: provider.data } });
  res.json((await integrationViews(req.company!.id)).find((v) => v.provider === provider.data));
});

export default router;

// ---------------------------------------------------------------------------
// Calendly webhook subscription + Stripe Connect (OAuth for Standard accounts)
// ---------------------------------------------------------------------------

router.post("/companies/:companyId/settings/integrations/calendly/webhook", ...owner, requireFeature("calendly"), async (req, res) => {
  const company = req.company!;
  const r = await registerCalendlyWebhook(company);
  if (!r.ok) {
    res.status(400).json({ error: r.error });
    return;
  }
  await audit(req, { action: "calendly_webhook_registered", resourceType: "company_integration", details: { subscriptionUri: r.subscriptionUri } });
  res.json({ ok: true, subscriptionUri: r.subscriptionUri, integrations: await integrationViews(company.id) });
});

/** Where "Connect with Stripe" sends the owner. Null when the platform has no Connect client id (paste an acct_ id instead). */
router.get("/companies/:companyId/settings/integrations/stripe/connect-url", ...owner, requireFeature("stripe_checkout"), async (req, res) => {
  const company = req.company!;
  const state = jwt.sign({ purpose: "stripe_connect", companyId: company.id, userId: req.user!.userId }, env.sessionSecret, { expiresIn: "15m" });
  const url = connectAuthorizeUrl(state, `${env.appUrl}/api/stripe/connect/callback`, company.ownerEmail);
  res.json({ url, available: Boolean(url) });
});

router.get("/stripe/connect/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const back = (q: string) => res.redirect(`${env.appUrl}/app?${q}#settings`);
  let claims: { purpose?: string; companyId?: number; userId?: number };
  try {
    claims = jwt.verify(state, env.sessionSecret) as typeof claims;
  } catch {
    back("stripe=invalid_state");
    return;
  }
  if (claims.purpose !== "stripe_connect" || !claims.companyId) {
    back("stripe=invalid_state");
    return;
  }
  if (typeof req.query.error === "string") {
    back(`stripe=denied`);
    return;
  }
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, claims.companyId)).limit(1);
  if (!company || !code) {
    back("stripe=invalid_state");
    return;
  }
  try {
    const accountId = await exchangeConnectCode(code);
    await saveIntegration(company, "stripe", { config: { accountId, mode: "live" }, secrets: {} });
    back("stripe=connected");
  } catch (err) {
    req.log?.warn({ err }, "Stripe Connect exchange failed");
    back("stripe=failed");
  }
});
