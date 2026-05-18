import { useEffect, useState } from 'react';
import { api, type AdminSystem, type AdminAuditRow } from '../../lib/api';
import { Skeleton } from '../../components/admin-ui';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

function relative(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export default function AdminSystemPage() {
  const [sys, setSys] = useState<AdminSystem | null>(null);
  const [audit, setAudit] = useState<AdminAuditRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    void Promise.all([api.admin.system(), api.admin.audit()])
      .then(([s, a]) => {
        setSys(s);
        setAudit(a.actions);
        setCursor(a.next_cursor);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const a = await api.admin.audit(cursor);
      setAudit((prev) => [...prev, ...a.actions]);
      setCursor(a.next_cursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  if (error) return <div className="text-red-300 text-sm">{error}</div>;
  if (!sys) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card !p-4">
        <div className="font-display text-base font-bold mb-3">System health</div>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-navy-400">Active engine</dt>
          <dd className="text-right uppercase tracking-wider">{sys.clip_engine}</dd>
          <dt className="text-navy-400">App URL</dt>
          <dd className="text-right font-mono text-[11px] break-all">{sys.app_url ?? '—'}</dd>
          <dt className="text-navy-400">Stripe</dt>
          <dd className="text-right">
            {sys.stripe_configured ? '✓ configured' : '✗ missing key'}
            {sys.stripe_webhook_configured ? '' : ' · no webhook secret'}
          </dd>
          <dt className="text-navy-400">Opus key</dt>
          <dd className="text-right">{sys.opus_configured ? '✓ present' : '— not set'}</dd>
          <dt className="text-navy-400">Stuck jobs (&gt;1h)</dt>
          <dd className={`text-right ${sys.stuck_processing_jobs > 0 ? 'text-red-300' : ''}`}>
            {sys.stuck_processing_jobs}
          </dd>
          <dt className="text-navy-400">Last clip update</dt>
          <dd className="text-right">{relative(sys.last_clip_update)}</dd>
          <dt className="text-navy-400">Last subscription update</dt>
          <dd className="text-right">{relative(sys.last_subscription_update)}</dd>
          <dt className="text-navy-400">Server time</dt>
          <dd className="text-right font-mono text-[11px]">
            {new Date(sys.server_time).toLocaleString()}
          </dd>
        </dl>
      </div>

      <div className="card !p-4">
        <div className="font-display text-base font-bold mb-3">Audit log</div>
        {audit.length === 0 ? (
          <div className="text-sm text-navy-400">No admin actions yet.</div>
        ) : (
          <ul className="divide-y divide-navy-800">
            {audit.map((a) => (
              <li key={a.id} className="py-2.5 text-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-gold-300">{a.action}</span>
                    {a.target_type && (
                      <span className="ml-2 text-navy-400 text-xs">
                        → {a.target_type}:{(a.target_id ?? '').slice(0, 8)}
                      </span>
                    )}
                    {a.actor_email && (
                      <div className="text-xs text-navy-400 mt-0.5 truncate">by {a.actor_email}</div>
                    )}
                  </div>
                  <span className="text-xs text-navy-400 shrink-0">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {cursor && (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="btn-secondary w-full min-h-[44px] mt-3"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}
