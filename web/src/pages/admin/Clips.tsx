import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type AdminClipRow } from '../../lib/api';
import { EmptyState, Skeleton, StatusBadge } from '../../components/admin-ui';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

const FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: 'All' },
  { key: 'queued', label: 'Queued' },
  { key: 'processing', label: 'Processing' },
  { key: 'ready', label: 'Ready' },
  { key: 'failed', label: 'Failed' },
];

export default function AdminClipsPage() {
  const [status, setStatus] = useState<string>('');
  const [clips, setClips] = useState<AdminClipRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(reset: boolean, opts: { status?: string } = {}) {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await api.admin.listClips({
        status: opts.status ?? status,
        cursor: reset ? null : cursor,
        limit: 25,
      });
      setClips((prev) => (reset ? res.clips : [...prev, ...res.clips]));
      setCursor(res.next_cursor);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load(true, { status: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickStatus(s: string) {
    setStatus(s);
    void load(true, { status: s });
  }

  return (
    <div className="space-y-4">
      {/* Filter chips — horizontally scrollable on mobile */}
      <div
        className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1"
        role="tablist"
        aria-label="Status filter"
      >
        {FILTERS.map((f) => (
          <button
            key={f.key || 'all'}
            role="tab"
            aria-selected={status === f.key}
            onClick={() => pickStatus(f.key)}
            className={`shrink-0 px-3 py-2 rounded-full text-sm border min-h-[36px] transition ${
              status === f.key
                ? 'bg-gold-500 text-navy-900 border-gold-500'
                : 'bg-navy-900/60 text-navy-200 border-navy-700 hover:border-navy-600'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="text-red-300 text-sm">{error}</div>}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : clips.length === 0 ? (
        <EmptyState title="No clips" description="Try a different filter." />
      ) : (
        <ul className="space-y-2">
          {clips.map((c) => (
            <li key={c.id}>
              <Link
                to={`/admin/clips/${c.id}`}
                className="block rounded-xl border border-navy-700 bg-navy-900/60 hover:border-gold-500/40 active:bg-navy-800 transition px-4 py-3 min-h-[64px]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-white truncate">
                      {c.source_title || c.source_url}
                    </div>
                    <div className="mt-0.5 text-xs text-navy-400 truncate">
                      {c.user_email ?? c.user_id.slice(0, 8)} · {c.engine} ·{' '}
                      {new Date(c.created_at).toLocaleString()}
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <button
          type="button"
          onClick={() => void load(false)}
          disabled={loadingMore}
          className="btn-secondary w-full min-h-[44px]"
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
