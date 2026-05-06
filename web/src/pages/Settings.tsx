import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type MeResponse } from '../lib/api';
import { supabase } from '../lib/supabase';

export default function Settings() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.me().then(setMe).catch((e) => setError(e.message));
  }, []);

  async function changePassword() {
    const next = prompt('Enter new password (min 8 chars):');
    if (!next || next.length < 8) return;
    const { error } = await supabase.auth.updateUser({ password: next });
    alert(error ? `Error: ${error.message}` : 'Password updated.');
  }

  if (error) return <div className="max-w-3xl mx-auto px-6 py-12 text-red-400">{error}</div>;
  if (!me) return <div className="max-w-3xl mx-auto px-6 py-12 text-navy-300">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <h1 className="font-display text-3xl font-bold">Settings</h1>

      <div className="card">
        <h2 className="font-display text-xl font-bold mb-4">Account</h2>
        <Row label="Email" value={me.user.email ?? '—'} />
        <Row label="User ID" value={me.user.id} mono />
        <div className="pt-4 border-t border-navy-700">
          <button onClick={changePassword} className="btn-secondary">Change password</button>
        </div>
      </div>

      <div className="card">
        <h2 className="font-display text-xl font-bold mb-4">Subscription</h2>
        <Row label="Plan" value={me.subscription.plan.toUpperCase()} />
        <Row label="Status" value={me.subscription.status} />
        <Row
          label="Period ends"
          value={new Date(me.subscription.current_period_end).toLocaleDateString()}
        />
        <Row
          label="Usage"
          value={`${me.usage.clips_used} / ${me.usage.clips_limit} clips`}
        />
        <div className="pt-4 border-t border-navy-700">
          <Link to="/pricing" className="btn-primary">
            {me.subscription.plan === 'free' ? 'Upgrade' : 'Change plan'}
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between py-2 text-sm">
      <span className="text-navy-300">{label}</span>
      <span className={mono ? 'font-mono text-xs' : ''}>{value}</span>
    </div>
  );
}
