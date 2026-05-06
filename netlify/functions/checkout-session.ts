import type { Config, Context } from '@netlify/functions';
import { authenticate, unauthorized } from './_shared/auth';
import { getServiceClient } from './_shared/supabase';
import { getStripe, PLANS, PlanTier } from './_shared/stripe';
import { json, badRequest, serverError } from './_shared/http';

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const user = await authenticate(req.headers.get('authorization') ?? undefined);
  if (!user) return unauthorized();

  let body: { plan?: PlanTier };
  try { body = await req.json(); } catch { return badRequest('invalid JSON'); }

  const plan = body.plan;
  if (!plan || plan === 'free' || !(plan in PLANS)) {
    return badRequest('plan must be starter | pro | studio');
  }

  const planDef = PLANS[plan];
  const priceId = process.env[planDef.priceEnvVar];
  if (!priceId) return serverError(`${planDef.priceEnvVar} not configured — run npm run stripe:setup`);

  const stripe = getStripe();
  const supabase = getServiceClient();

  // Ensure Stripe customer exists for this user
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, email')
    .eq('id', user.id)
    .maybeSingle();

  let customerId = profile?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? profile?.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await supabase
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id);
  }

  const appUrl = process.env.APP_URL ?? process.env.URL ?? 'http://localhost:8888';

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard?upgraded=1`,
    cancel_url: `${appUrl}/pricing?canceled=1`,
    allow_promotion_codes: true,
    metadata: { user_id: user.id, plan },
    subscription_data: { metadata: { user_id: user.id, plan } },
  });

  return json({ url: session.url, id: session.id });
};

export const config: Config = { path: '/api/checkout' };
