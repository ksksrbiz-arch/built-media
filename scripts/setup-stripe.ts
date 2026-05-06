/**
 * Bootstrap Stripe products + prices for Built Media.
 * Run: npx tsx scripts/setup-stripe.ts
 *
 * Idempotent: safe to re-run. Looks up products by metadata.built_media_tier.
 * Prints the price IDs to add to your .env / Netlify environment.
 */
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

const TIERS = [
  { tier: 'starter', name: 'Built Media — Starter', priceCents: 2900, clips: 30 },
  { tier: 'pro',     name: 'Built Media — Pro',     priceCents: 9900, clips: 200 },
  { tier: 'studio',  name: 'Built Media — Studio',  priceCents: 29900, clips: 1000 },
];

async function findOrCreateProduct(tier: string, name: string, clips: number) {
  const existing = await stripe.products.search({
    query: `metadata['built_media_tier']:'${tier}'`,
  });
  if (existing.data.length > 0) return existing.data[0];

  return await stripe.products.create({
    name,
    metadata: { built_media_tier: tier, clips: String(clips) },
  });
}

async function findOrCreatePrice(productId: string, priceCents: number) {
  const prices = await stripe.prices.list({ product: productId, active: true });
  const match = prices.data.find(
    (p) => p.unit_amount === priceCents && p.recurring?.interval === 'month',
  );
  if (match) return match;

  return await stripe.prices.create({
    product: productId,
    unit_amount: priceCents,
    currency: 'usd',
    recurring: { interval: 'month' },
  });
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY not set');
    process.exit(1);
  }

  console.log('Setting up Stripe products + prices…\n');

  const env: string[] = [];
  for (const { tier, name, priceCents, clips } of TIERS) {
    const product = await findOrCreateProduct(tier, name, clips);
    const price = await findOrCreatePrice(product.id, priceCents);
    console.log(`✓ ${name}`);
    console.log(`  product: ${product.id}`);
    console.log(`  price:   ${price.id} ($${(priceCents / 100).toFixed(2)}/mo)\n`);
    env.push(`STRIPE_PRICE_${tier.toUpperCase()}=${price.id}`);
  }

  console.log('---\nAdd these to your .env (or Netlify env vars):\n');
  console.log(env.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
