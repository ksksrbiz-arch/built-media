import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Clip, type MeResponse } from '../lib/api';
import { supabase } from '../lib/supabase';

export default function Dashboard() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // initial load
  useEffect(() => {
    void Promise.all([api.me(), api.listClips()]).then(([m, c]) => {
      setMe(m);
      setClips(c.clips);
    }).catch((e) => setError(e.message));
  }, []);

  // realtime subscription on clips for this user
  useEffect(() => {
    if (!me) return;
    const channel = supabase
      .channel('clips-stream')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clips', filter: `user_id=eq.${me.user.id}` },
        (payload) => {
          setClips((prev) => {
            const incoming = payload.new as Clip;
            if (payload.eventType === 'INSERT') return [incoming, ...prev];
            if (payload.eventType === 'UPDATE') {
              return prev.map((c) => (c.id === incoming.id ? { ...c, ...incoming } : c));
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter((c) => c.id !== (payload.old as Clip).id);
            }
            return prev;
          });
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [me]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createClip(url.trim());
      setUrl('');
      // refresh usage
      const m = await api.me();
      setMe(m);
    } catch (err: unknown) {
      const e = err as { message: string; data?: { error?: string; message?: string } };
      setError(e.data?.message ?? e.data?.error ?? e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !me) {
    return <div className="max-w-4xl mx-auto px-6 py-12 text-red-400">{error}</div>;
  }
  if (!me) {
    return <div className="max-w-4xl mx-auto px-6 py-12 text-navy-300">Loading…</div>;
  }

  const planBadge = me.subscription.plan.toUpperCase();
  const remaining = me.usage.clips_remaining;
  const limit = me.usage.clips_limit;
  const used = me.usage.clips_used;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Usage strip */}
      <div className="card mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm text-navy-300">Plan</span>
            <span className={`badge ${
              me.subscription.plan === 'free'
                ? 'bg-navy-700 text-navy-200'
                : 'bg-gold-500/20 text-gold-300 border border-gold-500/30'
            }`}>{planBadge}</span>
          </div>
          <div className="text-2xl font-semibold">
            {used} / {limit} clips
          </div>
          <div className="text-sm text-navy-300">{remaining} remaining this period</div>
        </div>
        <div className="flex-1 min-w-[200px] max-w-sm">
          <div className="h-2 bg-navy-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-gold-500 transition-all"
              style={{ width: `${Math.min(100, (used / Math.max(limit, 1)) * 100)}%` }}
            />
          </div>
        </div>
        {me.subscription.plan === 'free' && (
          <Link to="/pricing" className="btn-primary">Upgrade</Link>
        )}
      </div>

      {/* Submit form */}
      <div className="card mb-8">
        <h2 className="font-display text-2xl font-bold mb-2">Drop a video</h2>
        <p className="text-navy-300 mb-4">
          Paste a YouTube URL. We'll route it through the best AI clipper and return ready-to-post clips.
        </p>
        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
          <input
            className="input flex-1"
            type="url"
            required
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={submitting || remaining <= 0}
          />
          <button
            type="submit"
            disabled={submitting || remaining <= 0}
            className="btn-primary whitespace-nowrap"
          >
            {submitting ? 'Processing…' : remaining <= 0 ? 'Quota reached' : 'Generate clips'}
          </button>
        </form>
        {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
        {remaining <= 0 && (
          <div className="mt-3 text-sm text-gold-300">
            You've used your {limit} clips for this period.{' '}
            <Link to="/pricing" className="underline">Upgrade for more.</Link>
          </div>
        )}
      </div>

      {/* Clips grid */}
      <h2 className="font-display text-xl font-bold mb-4">Your clips</h2>
      {clips.length === 0 ? (
        <div className="card text-center py-12 text-navy-300">
          No clips yet. Drop a URL above to get started.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClipCard({ clip }: { clip: Clip }) {
  const firstClip = clip.output?.[0];
  const statusColors = {
    queued:     'bg-navy-700 text-navy-200',
    processing: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',
    ready:      'bg-gold-500/20 text-gold-300 border border-gold-500/30',
    failed:     'bg-red-500/20 text-red-300 border border-red-500/30',
  };
  return (
    <Link to={`/clips/${clip.id}`} className="card hover:border-gold-500/50 transition group block">
      <div className="aspect-[9/16] bg-navy-900 rounded-lg mb-3 overflow-hidden relative">
        {firstClip?.thumbnail ? (
          <img src={firstClip.thumbnail} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-navy-500 text-sm">
            {clip.status === 'processing' ? 'Processing…' : 'No preview'}
          </div>
        )}
        {clip.output.length > 1 && (
          <span className="absolute top-2 right-2 badge bg-navy-900/80 text-white">
            {clip.output.length} clips
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mb-2">
        <span className={`badge ${statusColors[clip.status]}`}>
          {clip.status}
        </span>
        <span className="text-xs text-navy-400">{clip.engine}</span>
      </div>
      <div className="text-sm text-navy-200 truncate group-hover:text-white">
        {firstClip?.caption ?? clip.source_url}
      </div>
      <div className="text-xs text-navy-400 mt-1">
        {new Date(clip.created_at).toLocaleString()}
      </div>
    </Link>
  );
}
