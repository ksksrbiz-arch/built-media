import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type AdminUserDetail } from '../../lib/api';
import { BottomSheet, ConfirmDialog, Skeleton, StatusBadge } from '../../components/admin-ui';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

const PLANS = ['free', 'starter', 'pro', 'studio'] as const;

export default function AdminUserDetailPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmAdmin, setConfirmAdmin] = useState<null | boolean>(null);
  const [busy, setBusy] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<string>('free');

  async function refresh() {
    try {
      const d = await api.admin.getUser(id);
      setData(d);
      setPendingPlan(d.subscription?.plan ?? 'free');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function applyPatch(body: Parameters<typeof api.admin.updateUser>[1]) {
    setBusy(true);
    try {
      const d = await api.admin.updateUser(id, body);
      setData(d);
      setPendingPlan(d.subscription?.plan ?? 'free');
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div>
        <Link to="/admin/users" className="text-sm text-gold-300">← Back</Link>
        <div className="card mt-4 text-red-300">{error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const p = data.profile;
  const sub = data.subscription;

  return (
    <div className="space-y-4 pb-32 md:pb-0">
      <Link to="/admin/users" className="text-sm text-gold-300 hover:text-gold-200">
        ← All users
      </Link>

      <div className="card !p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display text-lg font-bold truncate">{p.email ?? '(no email)'}</div>
            <div className="mt-0.5 text-xs text-navy-400">{p.full_name || '—'}</div>
            <div className="mt-1 font-mono text-[11px] text-navy-500 break-all">{p.id}</div>
          </div>
          <div className="flex gap-2">
            {p.is_admin && (
              <span className="badge bg-gold-500/15 text-gold-300 border border-gold-500/30">admin</span>
            )}
            <span className="badge bg-navy-800 text-navy-200 border border-navy-700">
              {sub?.plan ?? 'free'}
            </span>
          </div>
        </div>
      </div>

      <div className="card !p-4">
        <div className="font-display text-base font-bold mb-3">Subscription</div>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-navy-400">Plan</dt>
          <dd className="text-right">{sub?.plan ?? '—'}</dd>
          <dt className="text-navy-400">Status</dt>
          <dd className="text-right">{sub?.status ?? '—'}</dd>
          <dt className="text-navy-400">Limit</dt>
          <dd className="text-right">{sub?.monthly_clip_limit ?? 0} / mo</dd>
          <dt className="text-navy-400">Used</dt>
          <dd className="text-right">
            {data.usage.clips_used} / {data.usage.clips_limit}
          </dd>
          <dt className="text-navy-400">Period ends</dt>
          <dd className="text-right">
            {sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : '—'}
          </dd>
          {p.stripe_customer_id && (
            <>
              <dt className="text-navy-400">Stripe ID</dt>
              <dd className="text-right font-mono text-[11px] break-all">{p.stripe_customer_id}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="card !p-4">
        <div className="font-display text-base font-bold mb-3">Recent clips</div>
        {data.recent_clips.length === 0 ? (
          <div className="text-sm text-navy-400">No clips yet.</div>
        ) : (
          <ul className="divide-y divide-navy-800">
            {data.recent_clips.map((c) => (
              <li key={c.id} className="py-2.5 flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{c.source_title || c.source_url}</div>
                  <div className="text-xs text-navy-400 mt-0.5">
                    {c.engine} · {new Date(c.created_at).toLocaleString()}
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Mobile sticky action bar */}
      <div className="md:static fixed bottom-16 inset-x-0 z-20 px-4 md:px-0">
        <div className="md:hidden h-px" />
        <div className="card !p-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <button
            type="button"
            onClick={() => setPlanOpen(true)}
            className="btn-secondary min-h-[44px]"
            disabled={busy}
          >
            Change plan
          </button>
          <button
            type="button"
            onClick={() => void applyPatch({ reset_quota: true })}
            className="btn-secondary min-h-[44px]"
            disabled={busy}
          >
            {busy ? '…' : 'Reset quota'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmAdmin(!p.is_admin)}
            className="btn-secondary min-h-[44px]"
            disabled={busy}
          >
            {p.is_admin ? 'Revoke admin' : 'Make admin'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDisable(true)}
            className="btn min-h-[44px] bg-red-500/90 text-white hover:bg-red-500"
            disabled={busy}
          >
            Disable
          </button>
        </div>
      </div>

      <BottomSheet open={planOpen} onClose={() => setPlanOpen(false)} title="Change plan">
        <fieldset className="space-y-2 mb-4">
          <legend className="sr-only">Plan</legend>
          {PLANS.map((plan) => (
            <label
              key={plan}
              className={`flex items-center gap-3 rounded-lg border px-3 py-3 min-h-[44px] cursor-pointer ${
                pendingPlan === plan
                  ? 'border-gold-500 bg-gold-500/5'
                  : 'border-navy-700 bg-navy-900/40'
              }`}
            >
              <input
                type="radio"
                name="plan"
                value={plan}
                checked={pendingPlan === plan}
                onChange={() => setPendingPlan(plan)}
                className="accent-gold-500"
              />
              <span className="font-medium uppercase tracking-wider text-sm">{plan}</span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button onClick={() => setPlanOpen(false)} className="btn-secondary min-h-[44px]">
            Cancel
          </button>
          <button
            onClick={async () => {
              await applyPatch({ plan: pendingPlan });
              setPlanOpen(false);
            }}
            disabled={busy}
            className="btn-primary min-h-[44px]"
          >
            {busy ? 'Saving…' : 'Save plan'}
          </button>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={confirmDisable}
        title="Disable user?"
        message="This marks the subscription canceled and stops new clips. The auth account itself is not deleted."
        destructive
        confirmLabel="Disable"
        busy={busy}
        onCancel={() => setConfirmDisable(false)}
        onConfirm={async () => {
          await applyPatch({ disable: true });
          setConfirmDisable(false);
        }}
      />

      <ConfirmDialog
        open={confirmAdmin !== null}
        title={confirmAdmin ? 'Grant admin access?' : 'Revoke admin access?'}
        message={
          confirmAdmin
            ? 'This user will gain full access to the admin console.'
            : 'This user will lose access to the admin console.'
        }
        destructive={!confirmAdmin}
        confirmLabel={confirmAdmin ? 'Grant' : 'Revoke'}
        busy={busy}
        onCancel={() => setConfirmAdmin(null)}
        onConfirm={async () => {
          await applyPatch({ is_admin: !!confirmAdmin });
          setConfirmAdmin(null);
        }}
      />
    </div>
  );
}
