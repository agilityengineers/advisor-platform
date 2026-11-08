import type { NextFunction, Request, Response } from "express";
import { asc, eq } from "drizzle-orm";
import { db, plansTable, type Company, type Plan } from "@workspace/db";
import { DEFAULT_PLANS, effectiveFeatures, featureSources, plansWithFeature, type FeatureKey, type FeatureMap } from "@workspace/shared";

const PLAN_CACHE_TTL = 60_000;
let planCache: { plans: Plan[]; at: number } | null = null;

export function invalidatePlanCache(): void {
  planCache = null;
}

export async function getPlans(): Promise<Plan[]> {
  if (planCache && Date.now() - planCache.at < PLAN_CACHE_TTL) return planCache.plans;
  const plans = await db.select().from(plansTable).where(eq(plansTable.active, true)).orderBy(asc(plansTable.sort));
  planCache = { plans, at: Date.now() };
  return plans;
}

export async function getPlan(key: string): Promise<Plan | null> {
  const plans = await getPlans();
  return plans.find((p) => p.key === key) ?? null;
}

function fallbackFeatureKeys(planKey: string): string[] {
  return DEFAULT_PLANS.find((p) => p.key === planKey)?.featureKeys ?? [];
}

export async function companyFeatures(company: Pick<Company, "plan" | "overrides">): Promise<FeatureMap> {
  const plan = await getPlan(company.plan);
  return effectiveFeatures(plan?.featureKeys ?? fallbackFeatureKeys(company.plan), company.overrides);
}

export async function companyFeatureDetail(company: Pick<Company, "plan" | "overrides">) {
  const plan = await getPlan(company.plan);
  return featureSources(plan?.featureKeys ?? fallbackFeatureKeys(company.plan), company.overrides);
}

/**
 * Gate a company-scoped route on a feature. Evaluated against the company
 * (plan + overrides), whoever is asking, so the super admin sees the same lock
 * the Admin does. Must run after requireCompany.
 */
export function requireFeature(feature: FeatureKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const company = req.company;
    if (!company) {
      res.status(500).json({ error: "requireFeature used without requireCompany" });
      return;
    }
    const features = await companyFeatures(company);
    if (!features[feature]) {
      const plans = await getPlans();
      const required = plansWithFeature(plans, feature);
      res.status(403).json({
        error: "Not in your plan",
        feature,
        currentPlan: company.plan,
        requiredPlans: required,
        requiredPlanName: required[0]?.name ?? "a higher plan",
      });
      return;
    }
    next();
  };
}
