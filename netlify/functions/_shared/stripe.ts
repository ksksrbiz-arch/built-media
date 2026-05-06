import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  _stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' });
  return _stripe;
}

export type PlanTier = 'free' | 'starter' | 'pro' | 'studio';

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  monthlyClipLimit: number;
  priceUsd: number;
  priceEnvVar: string;
}

export const PLANS: Record<Exclude<PlanTier, 'free'>, PlanDefinition> = {
  starter: {
    tier: 'starter',
    name: 'Starter',
    monthlyClipLimit: 30,
    priceUsd: 29,
    priceEnvVar: 'STRIPE_PRICE_STARTER',
  },
  pro: {
    tier: 'pro',
    name: 'Pro',
    monthlyClipLimit: 200,
    priceUsd: 99,
    priceEnvVar: 'STRIPE_PRICE_PRO',
  },
  studio: {
    tier: 'studio',
    name: 'Studio',
    monthlyClipLimit: 1000,
    priceUsd: 299,
    priceEnvVar: 'STRIPE_PRICE_STUDIO',
  },
};

export function planFromPriceId(priceId: string): PlanDefinition | null {
  for (const plan of Object.values(PLANS)) {
    if (process.env[plan.priceEnvVar] === priceId) return plan;
  }
  return null;
}
