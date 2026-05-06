import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Clip, type MeResponse } from '../lib/api';
import { supabase } from '../lib/supabase';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

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
    }).catch((err) => setError(errorMessage(err)));
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
            if (payload.eventType === 'INSERT') {
              return prev.some((c) => c.id === incoming.id)
                ? prev.map((c) => (c.id === incoming.id ? { ...c, ...incoming } : c))
                : [incoming, ...prev];
            }
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
    const sourceUrl = url.trim();
    if (!sourceUrl) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createClip(sourceUrl);
      setUrl('');
      const [m, c] = await Promise.all([api.me(), api.listClips()]);
      setMe(m);
      setClips(c.clips);
    } catch (err: unknown) {
      const e = err as { message: string; data?: { error?: string; message?: string } };
      setError(e.data?.message ?? e.data?.error ?? e.message ?? errorMessage(err));
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
  const usagePercent = Math.min(100, (used / Math.max(limit, 1)) * 100);
  const renderedClips = clips.reduce((sum, clip) => sum + (clip.output?.length ?? 0), 0);
  const inFlight = clips.filter((clip) => clip.status === 'queued' || clip.status === 'processing').length;
  const failed = clips.filter((clip) => clip.status === 'failed').length;
  const periodEnd = new Date(me.subscription.current_period_end).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-gold-300 mb-2">
            Clipper workspace
          </div>
          <h1 className="font-display text-4xl font-bold">Turn long-form into short-form</h1>
          <p className="text-navy-300 mt-2 max-w-2xl">
            Paste a source video, let the active clipping engine find the strongest moments,
            then download finished vertical clips with captions and hooks.
          </p>
        </div>
        <Link to="/settings" className="btn-secondary self-start md:self-auto">
          Account settings
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Plan" value={planBadge} detail={`Renews ${periodEnd}`} />
        <MetricCard label="Credits left" value={remaining.toString()} detail={`${used} of ${limit} used`} />
        <MetricCard label="Rendered clips" value={renderedClips.toString()} detail={`${clips.length} source jobs`} />
        <MetricCard label="In progress" value={inFlight.toString()} detail={failed ? `${failed} needs review` : 'Live updates enabled'} />
      </div>

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
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>
        {me.subscription.plan === 'free' && (
          <Link to="/pricing" className="btn-primary">Upgrade</Link>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 mb-8">
        <div className="card">
          <h2 className="font-display text-2xl font-bold mb-2">Drop a video</h2>
          <p className="text-navy-300 mb-4">
            YouTube, Loom, podcasts, webinars, and direct MP4 links all work. Built Media
            will route it through the configured clipper and keep this page updated.
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
              aria-label="Source video URL"
            />
            <button
              type="submit"
              disabled={submitting || remaining <= 0}
              className="btn-primary whitespace-nowrap"
            >
              {submitting ? 'Creating job…' : remaining <= 0 ? 'Quota reached' : 'Generate clips'}
            </button>
          </form>
          {error && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          {remaining <= 0 && (
            <div className="mt-3 text-sm text-gold-300">
              You've used your {limit} clips for this period.{' '}
              <Link to="/pricing" className="underline">Upgrade for more.</Link>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="font-display text-lg font-bold mb-3">What happens next</h3>
          <ol className="space-y-3 text-sm text-navy-200">
            {[
              'We create a private job tied to your account.',
              'The active clipper analyzes hooks, captions, and short-form pacing.',
              'Finished clips appear here automatically with download and copy actions.',
            ].map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-gold-500/20 text-xs font-semibold text-gold-300">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-4">
        <div>
          <h2 className="font-display text-xl font-bold">Your clips</h2>
          <p className="text-sm text-navy-400">
            {clips.length ? `${clips.length} source job${clips.length === 1 ? '' : 's'} in your library` : 'Your generated clips will appear here'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-navy-300">
          <span className="badge bg-navy-800 border border-navy-700">9:16 ready</span>
          <span className="badge bg-navy-800 border border-navy-700">Captions included</span>
          <span className="badge bg-navy-800 border border-navy-700">Virality scored</span>
        </div>
      </div>

      {clips.length === 0 ? (
        <div className="card text-center py-12">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gold-500/15 text-2xl">
            ▶
          </div>
          <h3 className="font-display text-xl font-bold mb-2">Create your first clip job</h3>
          <p className="text-navy-300 max-w-md mx-auto">
            Paste a long-form source above and your first short-form cuts will show up
            here with status, thumbnails, captions, and download links.
          </p>
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

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-navy-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-navy-300">{detail}</div>
    </div>
  );
}

function ClipCard({ clip }: { clip: Clip }) {
  const outputs = clip.output ?? [];
  const firstClip = outputs[0];
  const statusColors: Record<Clip['status'], string> = {
    queued: 'bg-navy-700 text-navy-200',
    processing: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',
    ready: 'bg-gold-500/20 text-gold-300 border border-gold-500/30',
    failed: 'bg-red-500/20 text-red-300 border border-red-500/30',
  };
  const statusLabels: Record<Clip['status'], string> = {
    queued: 'Queued',
    processing: 'Processing',
    ready: 'Ready',
    failed: 'Failed',
  };
  return (
    <Link to={`/clips/${clip.id}`} className="card hover:border-gold-500/50 transition group block">
      <div className="aspect-[9/16] bg-navy-900 rounded-lg mb-3 overflow-hidden relative">
        {firstClip?.thumbnail ? (
          <img
            src={firstClip.thumbnail}
            alt={firstClip.caption ?? 'Generated clip preview'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-navy-500 text-sm">
            {clip.status === 'failed'
              ? 'Needs review'
              : clip.status === 'processing' || clip.status === 'queued'
              ? 'Working…'
              : 'No preview'}
          </div>
        )}
        {outputs.length > 1 && (
          <span className="absolute top-2 right-2 badge bg-navy-900/80 text-white">
            {outputs.length} clips
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mb-2">
        <span className={`badge ${statusColors[clip.status]}`}>
          {statusLabels[clip.status]}
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
