import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase, useSession } from '../lib/supabase';

type AuthMode = 'signin' | 'signup';
type Message = { kind: 'ok' | 'err'; text: string };

function safeNextPath(search: string): string {
  const next = new URLSearchParams(search).get('next');
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export default function Auth() {
  const { session } = useSession();
  const nav = useNavigate();
  const location = useLocation();
  const nextPath = safeNextPath(location.search);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    if (session) nav(nextPath, { replace: true });
  }, [nav, nextPath, session]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const action = mode === 'signin'
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${nextPath}` },
        });

    const { error } = await action;
    setSubmitting(false);

    if (error) {
      setMessage({ kind: 'err', text: error.message });
      return;
    }

    if (mode === 'signup') {
      setMessage({ kind: 'ok', text: 'Account created. Check your email to confirm, then sign in.' });
      return;
    }
    nav(nextPath);
  }

  async function magicLink() {
    if (!email) {
      setMessage({ kind: 'err', text: 'Enter your email first.' });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}${nextPath}` },
    });
    setSubmitting(false);
    setMessage(error
      ? { kind: 'err', text: error.message }
      : { kind: 'ok', text: 'Magic link sent. Check your email.' }
    );
  }

  async function resetPassword() {
    if (!email) {
      setMessage({ kind: 'err', text: 'Enter your email first.' });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setSubmitting(false);
    setMessage(error
      ? { kind: 'err', text: error.message }
      : { kind: 'ok', text: 'Password reset email sent.' }
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <div className="grid gap-6 md:grid-cols-[1fr_420px] md:items-center">
        <div className="hidden md:block">
          <div className="text-sm uppercase tracking-[0.2em] text-gold-300 mb-3">
            Built Media account
          </div>
          <h1 className="font-display text-5xl font-bold leading-tight mb-5">
            Your clipper workspace starts here.
          </h1>
          <p className="text-lg text-navy-200 max-w-lg">
            Sign in to submit source videos, track every clipping job in real time,
            and download captioned short-form assets when they are ready.
          </p>
          <div className="mt-8 grid gap-3 text-sm text-navy-200">
            {['3 free starter clips', 'Magic-link or password login', 'Usage and billing tied to your user account'].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-gold-500/20 text-gold-300">✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-display text-3xl font-bold mb-2">
            {mode === 'signin' ? 'Welcome back' : 'Get started free'}
          </h2>
          <p className="text-navy-300 mb-6">
            {mode === 'signin'
              ? 'Sign in to your Built Media account.'
              : 'Create your account and get 3 free clips. No credit card required.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@business.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label" htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                className="input"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>

            {message && <InlineMessage message={message} />}

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>

            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={magicLink} disabled={submitting} className="btn-ghost w-full text-sm">
                Send magic link
              </button>
              <button type="button" onClick={resetPassword} disabled={submitting} className="btn-ghost w-full text-sm">
                Reset password
              </button>
            </div>
          </form>

          <div className="mt-6 pt-6 border-t border-navy-700 text-center text-sm text-navy-300">
            {mode === 'signin' ? "Don't have an account? " : 'Already have one? '}
            <button
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(null); }}
              className="text-gold-400 hover:text-gold-300 font-medium"
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InlineMessage({ message }: { message: Message }) {
  return (
    <div className={`text-sm px-3 py-2 rounded ${
      message.kind === 'ok'
        ? 'bg-teal-500/10 text-teal-300 border border-teal-500/30'
        : 'bg-red-500/10 text-red-300 border border-red-500/30'
    }`}>
      {message.text}
    </div>
  );
}
