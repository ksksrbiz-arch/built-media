import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type MeResponse } from '../lib/api';
import { supabase } from '../lib/supabase';

type Message = { kind: 'ok' | 'err'; text: string };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

export default function Settings() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [profileMessage, setProfileMessage] = useState<Message | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<Message | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    void api.me()
      .then((data) => {
        setMe(data);
        setFullName(data.profile?.full_name ?? '');
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;

    setSavingProfile(true);
    setProfileMessage(null);
    const normalizedName = fullName.trim();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ full_name: normalizedName || null })
      .eq('id', me.user.id);
    setSavingProfile(false);

    if (updateError) {
      setProfileMessage({ kind: 'err', text: updateError.message });
      return;
    }

    setMe((current) => {
      if (!current?.profile) return current;
      return {
        ...current,
        profile: {
          ...current.profile,
          full_name: normalizedName || undefined,
        },
      };
    });
    setProfileMessage({ kind: 'ok', text: 'Profile updated.' });
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 8) {
      setPasswordMessage({ kind: 'err', text: 'Password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ kind: 'err', text: 'Passwords do not match.' });
      return;
    }

    setSavingPassword(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);

    if (updateError) {
      setPasswordMessage({ kind: 'err', text: updateError.message });
      return;
    }

    setNewPassword('');
    setConfirmPassword('');
    setPasswordMessage({ kind: 'ok', text: 'Password updated.' });
  }

  if (error) return <div className="max-w-3xl mx-auto px-6 py-12 text-red-400">{error}</div>;
  if (!me) return <div className="max-w-3xl mx-auto px-6 py-12 text-navy-300">Loading…</div>;

  const usagePercent = Math.min(100, (me.usage.clips_used / Math.max(me.usage.clips_limit, 1)) * 100);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-gold-300 mb-2">
            User settings
          </div>
          <h1 className="font-display text-3xl font-bold">Account and billing</h1>
          <p className="text-navy-300 mt-2">
            Manage the profile, login, and subscription details connected to your clipper workspace.
          </p>
        </div>
        <Link to="/dashboard" className="btn-secondary self-start sm:self-auto">
          Back to dashboard
        </Link>
      </div>

      <div className="card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="font-display text-xl font-bold mb-1">Profile</h2>
            <p className="text-sm text-navy-300">
              This information is used for account personalization and billing support.
            </p>
          </div>
          <span className="badge bg-navy-900 text-navy-200 border border-navy-700">
            {me.subscription.plan.toUpperCase()} plan
          </span>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-[1fr_1.2fr]">
          <div className="space-y-1">
            <Row label="Email" value={me.user.email ?? me.profile?.email ?? '—'} />
            <Row label="User ID" value={me.user.id} mono />
            <Row
              label="Stripe customer"
              value={me.profile?.stripe_customer_id ?? 'Not connected'}
              mono={Boolean(me.profile?.stripe_customer_id)}
            />
          </div>

          <form onSubmit={saveProfile} className="space-y-3">
            <div>
              <label className="label" htmlFor="full-name">Full name</label>
              <input
                id="full-name"
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            {profileMessage && <InlineMessage message={profileMessage} />}
            <button type="submit" disabled={savingProfile} className="btn-primary">
              {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <h2 className="font-display text-xl font-bold mb-4">Subscription</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Row label="Plan" value={me.subscription.plan.toUpperCase()} />
            <Row label="Status" value={me.subscription.status} />
            <Row
              label="Period ends"
              value={new Date(me.subscription.current_period_end).toLocaleDateString()}
            />
            <Row
              label="Canceling"
              value={me.subscription.cancel_at_period_end ? 'At period end' : 'No'}
            />
          </div>
          <div className="rounded-xl border border-navy-700 bg-navy-900/40 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-navy-300">Monthly usage</span>
              <span>{me.usage.clips_used} / {me.usage.clips_limit} clips</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-navy-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-gold-500"
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <div className="mt-2 text-sm text-navy-400">
              {me.usage.clips_remaining} clips remaining this period.
            </div>
          </div>
        </div>
        <div className="pt-4 border-t border-navy-700 mt-4">
          <Link to="/pricing" className="btn-primary">
            {me.subscription.plan === 'free' ? 'Upgrade' : 'Change plan'}
          </Link>
        </div>
      </div>

      <div className="card">
        <h2 className="font-display text-xl font-bold mb-2">Login security</h2>
        <p className="text-sm text-navy-300 mb-4">
          Update the password for this Supabase-authenticated clipping account.
        </p>
        <form onSubmit={changePassword} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div>
            <label className="label" htmlFor="new-password">New password</label>
            <input
              id="new-password"
              className="input"
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
              className="input"
              type="password"
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
            />
          </div>
          <button type="submit" disabled={savingPassword} className="btn-secondary whitespace-nowrap">
            {savingPassword ? 'Updating…' : 'Update password'}
          </button>
        </form>
        {passwordMessage && (
          <div className="mt-3">
            <InlineMessage message={passwordMessage} />
          </div>
        )}
      </div>
    </div>
  );
}

function InlineMessage({ message }: { message: Message }) {
  return (
    <div className={`text-sm px-3 py-2 rounded-lg ${
      message.kind === 'ok'
        ? 'bg-teal-500/10 text-teal-300 border border-teal-500/30'
        : 'bg-red-500/10 text-red-300 border border-red-500/30'
    }`}>
      {message.text}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-navy-300">{label}</span>
      <span className={mono ? 'font-mono text-xs break-all text-right' : 'text-right'}>{value}</span>
    </div>
  );
}
