import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type AdminUserSummary } from '../../lib/api';
import { EmptyState, Skeleton } from '../../components/admin-ui';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<number | null>(null);

  async function load(reset: boolean, opts: { search?: string; cursor?: string | null } = {}) {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await api.admin.listUsers({
        search: opts.search ?? search,
        cursor: reset ? null : opts.cursor ?? cursor,
        limit: 25,
      });
      setUsers((prev) => (reset ? res.users : [...prev, ...res.users]));
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
    void load(true, { search: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSearchChange(v: string) {
    setSearch(v);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      void load(true, { search: v });
    }, 250);
  }

  return (
    <div className="space-y-4">
      <input
        type="search"
        inputMode="search"
        placeholder="Search by email or name…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="input"
        aria-label="Search users"
      />

      {error && <div className="text-red-300 text-sm">{error}</div>}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState title="No users found" description="Try a different search term." />
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li key={u.id}>
              <Link
                to={`/admin/users/${u.id}`}
                className="block rounded-xl border border-navy-700 bg-navy-900/60 hover:border-gold-500/40 active:bg-navy-800 transition px-4 py-3 min-h-[64px]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-white truncate">
                        {u.email ?? '(no email)'}
                      </div>
                      {u.is_admin && (
                        <span className="badge bg-gold-500/15 text-gold-300 border border-gold-500/30">
                          admin
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-navy-400 truncate">
                      {u.full_name || '—'} · joined {new Date(u.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-navy-300 uppercase tracking-wider">
                      {u.subscription?.plan ?? 'free'}
                    </div>
                    <div className="text-xs text-navy-400">{u.subscription?.status ?? '—'}</div>
                  </div>
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
