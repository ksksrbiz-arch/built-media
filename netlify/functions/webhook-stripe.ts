import type { Context } from '@netlify/functions';
import Stripe from 'stripe';
import { getStripe, planFromPriceId, PLANS } from './_shared/stripe';
import { getServiceClient } from './_shared/supabase';
import { json } from './_shared/http';

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const sig = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return json({ error: 'missing signature' }, 400);

  const stripe = getStripe();
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error('Stripe webhook signature failed:', err);
    return json({ error: 'invalid signature' }, 400);
  }

  const supabase = getServiceClient();

  switch (event.type) {
    case 'checkout.session.completed':
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub =
        event.type === 'checkout.session.completed'
          ? await stripe.subscriptions.retrieve((event.data.object as Stripe.Checkout.Session).subscription as string)
          : (event.data.object as Stripe.Subscription);

      const userId = sub.metadata?.user_id ?? (await getUserIdFromCustomer(stripe, sub.customer as string));
      if (!userId) {
        console.error('no user_id resolved for subscription', sub.id);
        break;
      }

      const priceId = sub.items.data[0]?.price.id;
      const plan = priceId ? planFromPriceId(priceId) : null;
      const limit = plan?.monthlyClipLimit ?? PLANS.starter.monthlyClipLimit;

      await supabase.from('subscriptions').upsert(
        {
          user_id: userId,
          stripe_subscription_id: sub.id,
          stripe_price_id: priceId,
          plan: plan?.tier ?? 'starter',
          status: sub.status as 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete',
          monthly_clip_limit: limit,
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
        },
        { onConflict: 'user_id' },
      );
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id ?? (await getUserIdFromCustomer(stripe, sub.customer as string));
      if (!userId) break;

      // Revert to free tier
      await supabase
        .from('subscriptions')
        .update({
          plan: 'free',
          status: 'canceled',
          monthly_clip_limit: 3,
          stripe_subscription_id: null,
          stripe_price_id: null,
          cancel_at_period_end: false,
        })
        .eq('user_id', userId);
      break;
    }

    default:
      // Ignore other events
      break;
  }

  return json({ received: true });
};

async function getUserIdFromCustomer(stripe: Stripe, customerId: string): Promise<string | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    return (customer as Stripe.Customer).metadata?.supabase_user_id ?? null;
  } catch {
    return null;
  }
}
