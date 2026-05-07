import type { Config, Context } from '@netlify/functions';
import Stripe from 'stripe';
import { getStripe, planFromPriceId, PLANS } from './_shared/stripe';
import { getServiceClient } from './_shared/supabase';
import { json } from './_shared/http';

/**
 * Stripe webhook handler.
 *
 * Hardened with:
 *  - Event idempotency: writes event.id into public.stripe_events with the
 *    primary key constraint short-circuiting duplicates from Stripe retries.
 *  - Full status enum coverage: every documented Stripe subscription status
 *    is mapped to a value the public.sub_status enum accepts.
 *  - Structured logging: each branch logs event type + key context fields
 *    so production tail/grep can reconstruct what happened.
 */

// Set of statuses the public.sub_status enum accepts (extended via migration audit_hardening)
const VALID_DB_STATUSES = new Set([
  'active', 'trialing', 'past_due', 'canceled',
  'incomplete', 'incomplete_expired', 'unpaid', 'paused',
]);

function normalizeStatus(s: Stripe.Subscription.Status): string {
  return VALID_DB_STATUSES.has(s) ? s : 'active'; // safe fallback
}

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
    console.error('[webhook] signature verification failed:', err instanceof Error ? err.message : err);
    return json({ error: 'invalid signature' }, 400);
  }

  const supabase = getServiceClient();

  // Idempotency: try-insert event.id; if duplicate, short-circuit with 200
  const { error: idemError } = await supabase
    .from('stripe_events')
    .insert({ event_id: event.id, type: event.type, payload: { id: event.id, type: event.type } });

  if (idemError) {
    if (idemError.code === '23505') {
      // Duplicate primary key — we've already processed this event
      console.log(`[webhook] duplicate event ${event.id} (${event.type}) — skipped`);
      return json({ received: true, duplicate: true });
    }
    // Insert failed for some other reason; log but continue (don't block delivery)
    console.error(`[webhook] stripe_events insert error: ${idemError.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub: Stripe.Subscription =
          event.type === 'checkout.session.completed'
            ? await stripe.subscriptions.retrieve(
                (event.data.object as Stripe.Checkout.Session).subscription as string,
              )
            : (event.data.object as Stripe.Subscription);

        const userId =
          sub.metadata?.user_id ?? (await getUserIdFromCustomer(stripe, sub.customer as string));
        if (!userId) {
          console.error(`[webhook] no user_id resolved for subscription ${sub.id}`);
          break;
        }

        const priceId = sub.items.data[0]?.price.id;
        const plan = priceId ? planFromPriceId(priceId) : null;
        const limit = plan?.monthlyClipLimit ?? PLANS.starter.monthlyClipLimit;

        const { error } = await supabase.from('subscriptions').upsert(
          {
            user_id: userId,
            stripe_subscription_id: sub.id,
            stripe_price_id: priceId,
            plan: plan?.tier ?? 'starter',
            status: normalizeStatus(sub.status),
            monthly_clip_limit: limit,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
          },
          { onConflict: 'user_id' },
        );

        if (error) {
          console.error(`[webhook] subscription upsert failed for user=${userId}: ${error.message}`);
        } else {
          console.log(`[webhook] ${event.type} → user=${userId} plan=${plan?.tier} status=${sub.status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId =
          sub.metadata?.user_id ?? (await getUserIdFromCustomer(stripe, sub.customer as string));
        if (!userId) {
          console.error(`[webhook] no user_id resolved for deleted sub ${sub.id}`);
          break;
        }

        const { error } = await supabase
          .from('subscriptions')
          .update({
            plan: 'free',
            status: 'canceled',
            monthly_clip_limit: 3,
            stripe_subscription_id: null,
            stripe_price_id: null,
            cancel_at_period_end: false,
            // Reset period so they immediately get a fresh free-tier window
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq('user_id', userId);

        if (error) {
          console.error(`[webhook] revert-to-free failed for user=${userId}: ${error.message}`);
        } else {
          console.log(`[webhook] subscription.deleted → user=${userId} reverted to free`);
        }
        break;
      }

      default:
        console.log(`[webhook] ignoring event type: ${event.type}`);
    }
  } catch (err) {
    // Log but ALWAYS return 200 — Stripe retries on non-2xx and our idempotency
    // table will dedupe the retry. Better to swallow + alert than fail-loop.
    console.error(`[webhook] unhandled error processing ${event.type}:`, err);
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

export const config: Config = { path: '/api/webhooks/stripe' };
