import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useSession } from '../lib/supabase';

interface Plan {
  tier: 'starter' | 'pro' | 'studio';
  name: string;
  price: number;
  clips: number;
  features: string[];
  highlighted?: boolean;
}

const PLANS: Plan[] = [
  {
    tier: 'starter',
    name: 'Starter',
    price: 29,
    clips: 30,
    features: [
      '30 source videos / month',
      'Up to 10 clips per video',
      'Auto-captions + virality score',
      'Email support',
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: 99,
    clips: 200,
    highlighted: true,
    features: [
      '200 source videos / month',
      'Unlimited clips per video',
      'All clipping engines',
      'Direct posting to IG & FB',
      'Priority support',
    ],
  },
  {
    tier: 'studio',
    name: 'Studio',
    price: 299,
    clips: 1000,
    features: [
      '1,000 source videos / month',
      'Unlimited clips per video',
      'Multi-account management',
      'White-label client dashboards',
      'Dedicated success manager',
    ],
  },
];

export default function Pricing() {
  const { session } = useSession();
  const nav = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);

  async function start(tier: Plan['tier']) {
    if (!session) {
      nav(`/auth?next=/pricing`);
      return;
    }
    setLoading(tier);
    try {
      const { url } = await api.checkout(tier);
      window.location.href = url;
    } catch (e: unknown) {
      const err = e as { message: string };
      alert(`Checkout error: ${err.message}`);
      setLoading(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <div className="text-center mb-14">
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
          One subscription. Every clipping engine.
        </h1>
        <p className="text-xl text-navy-200 max-w-2xl mx-auto">
          Start free. Upgrade when you need more volume.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {PLANS.map((plan) => (
          <div
            key={plan.tier}
            className={`card relative flex flex-col ${
              plan.highlighted ? 'border-gold-500/50 ring-2 ring-gold-500/30' : ''
            }`}
          >
            {plan.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold-500 text-navy-900 text-xs font-semibold px-3 py-1 rounded-full">
                MOST POPULAR
              </div>
            )}
            <h3 className="font-display text-2xl font-bold mb-1">{plan.name}</h3>
            <div className="text-navy-300 text-sm mb-4">{plan.clips.toLocaleString()} clips / month</div>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-4xl font-bold">${plan.price}</span>
              <span className="text-navy-300">/mo</span>
            </div>
            <ul className="space-y-2 mb-6 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-navy-100">
                  <span className="text-gold-400 mt-0.5">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => start(plan.tier)}
              disabled={loading !== null}
              className={plan.highlighted ? 'btn-primary' : 'btn-secondary'}
            >
              {loading === plan.tier ? 'Redirecting…' : `Start ${plan.name}`}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-12 text-center text-sm text-navy-400">
        All plans include a 7-day money-back guarantee.{' '}
        {!session && <Link to="/auth" className="text-gold-400 hover:underline">Try free first →</Link>}
      </div>
    </div>
  );
}
