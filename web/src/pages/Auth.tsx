import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, useSession } from '../lib/supabase';

export default function Auth() {
  const { session } = useSession();
  const nav = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  if (session) {
    nav('/dashboard', { replace: true });
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const action = mode === 'signin'
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password });

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
    nav('/dashboard');
  }

  async function magicLink() {
    if (!email) {
      setMessage({ kind: 'err', text: 'Enter your email first' });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setSubmitting(false);
    setMessage(error
      ? { kind: 'err', text: error.message }
      : { kind: 'ok', text: 'Magic link sent. Check your email.' }
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <div className="card">
        <h1 className="font-display text-3xl font-bold mb-2">
          {mode === 'signin' ? 'Welcome back' : 'Get started free'}
        </h1>
        <p className="text-navy-300 mb-6">
          {mode === 'signin'
            ? 'Sign in to your Built Media account'
            : '3 free clips. No credit card required.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@business.com"
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>

          {message && (
            <div className={`text-sm px-3 py-2 rounded ${
              message.kind === 'ok'
                ? 'bg-teal-500/10 text-teal-300 border border-teal-500/30'
                : 'bg-red-500/10 text-red-300 border border-red-500/30'
            }`}>
              {message.text}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>

          <button type="button" onClick={magicLink} disabled={submitting} className="btn-ghost w-full text-sm">
            Or send me a magic link
          </button>
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
  );
}
