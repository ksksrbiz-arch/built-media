import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type AdminOverview } from '../../lib/api';
import { Skeleton, StatTile } from '../../components/admin-ui';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

function fmtMoney(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.admin.overview()
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <div className="text-red-300 text-sm">{error}</div>;
  if (!data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const planTotal = Object.values(data.plan_counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatTile label="Total users" value={data.users_total} />
        <StatTile label="MRR (est.)" value={fmtMoney(data.mrr_cents)} hint="Active + trialing" tone="good" />
        <StatTile label="Clips today" value={data.clips_today} />
        <StatTile label="Clips this month" value={data.clips_this_month} />
        <StatTile
          label="Failed (24h)"
          value={data.clips_failed_24h}
          tone={data.clips_failed_24h > 0 ? 'warn' : 'default'}
        />
        <StatTile label="Plan rollup" value={planTotal} hint="Subscriptions" />
      </div>

      <div className="card !p-4">
        <div className="font-display text-base font-bold mb-3">Subscribers by plan</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {(['free', 'starter', 'pro', 'studio'] as const).map((p) => (
            <div key={p} className="rounded-lg border border-navy-700 bg-navy-900/40 px-3 py-2">
              <div className="text-xs text-navy-300 uppercase tracking-wider">{p}</div>
              <div className="font-display text-xl font-bold">{data.plan_counts[p] ?? 0}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card !p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-display text-base font-bold">Recent admin activity</div>
          <Link to="/admin/system" className="text-xs text-gold-300 hover:text-gold-200">
            System →
          </Link>
        </div>
        {data.recent_actions.length === 0 ? (
          <div className="text-sm text-navy-400">No admin actions yet.</div>
        ) : (
          <ul className="divide-y divide-navy-800">
            {data.recent_actions.map((a) => (
              <li key={a.id} className="py-2.5 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <div>
                  <span className="font-mono text-xs text-gold-300">{a.action}</span>
                  {a.target_type && (
                    <span className="ml-2 text-navy-400 text-xs">
                      → {a.target_type}:{(a.target_id ?? '').slice(0, 8)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-navy-400">
                  {new Date(a.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
