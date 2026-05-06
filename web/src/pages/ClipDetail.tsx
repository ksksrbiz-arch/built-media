import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type Clip } from '../lib/api';
import { supabase } from '../lib/supabase';

type CopyTarget = number | 'source' | null;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export default function ClipDetail() {
  const { id } = useParams<{ id: string }>();
  const [clip, setClip] = useState<Clip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [copied, setCopied] = useState<CopyTarget>(null);

  useEffect(() => {
    if (!id) return;
    void api.getClip(id).then((r) => setClip(r.clip)).catch((err) => setError(errorMessage(err)));

    const channel = supabase
      .channel(`clip-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'clips', filter: `id=eq.${id}` },
        (payload) => setClip(payload.new as Clip),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id]);

  useEffect(() => {
    const outputCount = clip?.output?.length ?? 0;
    if (outputCount === 0 && activeIndex !== 0) setActiveIndex(0);
    if (outputCount > 0 && activeIndex >= outputCount) setActiveIndex(outputCount - 1);
  }, [activeIndex, clip]);

  if (error) return <div className="max-w-4xl mx-auto px-6 py-12 text-red-400">{error}</div>;
  if (!clip) return <div className="max-w-4xl mx-auto px-6 py-12 text-navy-300">Loading…</div>;

  const outputs = clip.output ?? [];
  const active = outputs[activeIndex];
  const statusColors: Record<Clip['status'], string> = {
    queued: 'bg-navy-700 text-navy-200',
    processing: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',
    ready: 'bg-gold-500/20 text-gold-300 border border-gold-500/30',
    failed: 'bg-red-500/20 text-red-300 border border-red-500/30',
  };

  async function copy(text: string, target: Exclude<CopyTarget, null>) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(target);
      setTimeout(() => setCopied(null), 1500);
    } catch (err: unknown) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <Link to="/dashboard" className="text-navy-300 hover:text-white text-sm mb-6 inline-flex items-center gap-1">
        ← Back to dashboard
      </Link>

      <div className="grid lg:grid-cols-[420px_1fr] gap-8">
        <div>
          {active ? (
            <>
              <div className="aspect-[9/16] bg-navy-900 rounded-xl overflow-hidden border border-navy-700">
                <video
                  key={active.url}
                  src={active.url}
                  controls
                  poster={active.thumbnail}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="mt-4 flex gap-2">
                <a href={active.url} download className="btn-primary flex-1 text-center">
                  Download MP4
                </a>
                <button
                  type="button"
                  onClick={() => void copy(active.caption ?? active.url, activeIndex)}
                  className="btn-secondary"
                >
                  {copied === activeIndex ? 'Copied' : active.caption ? 'Copy caption' : 'Copy URL'}
                </button>
              </div>
            </>
          ) : (
            <div className="aspect-[9/16] bg-navy-900 rounded-xl border border-navy-700 grid place-items-center text-navy-400">
              {clip.status === 'processing' || clip.status === 'queued'
                ? 'Processing… clips will appear here when ready.'
                : clip.status === 'failed'
                ? clip.error_message ?? 'Job failed'
                : 'No clips returned'}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
              <h1 className="font-display text-xl font-bold">
                {outputs.length} clip{outputs.length === 1 ? '' : 's'} {clip.status === 'ready' ? 'ready' : clip.status}
              </h1>
              <div className="flex flex-wrap gap-2">
                <span className={`badge ${statusColors[clip.status]}`}>{clip.status}</span>
                <span className="badge bg-navy-900 text-navy-200 border border-navy-700">
                  via {clip.engine}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-navy-500 mb-1">
                  Source
                </div>
                <a
                  href={clip.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-navy-200 hover:text-white break-all"
                >
                  {clip.source_title ?? clip.source_url}
                </a>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-navy-700 bg-navy-900/40 p-3">
                  <div className="text-navy-400">Created</div>
                  <div>{new Date(clip.created_at).toLocaleDateString()}</div>
                </div>
                <div className="rounded-lg border border-navy-700 bg-navy-900/40 p-3">
                  <div className="text-navy-400">Assets</div>
                  <div>{outputs.length} rendered</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void copy(clip.source_url, 'source')}
                className="btn-secondary w-full"
              >
                {copied === 'source' ? 'Source copied' : 'Copy source URL'}
              </button>
            </div>
          </div>

          {outputs.length === 0 && (
            <div className="card">
              <h2 className="font-display text-lg font-bold mb-2">
                {clip.status === 'failed' ? 'Job needs attention' : 'Clipper is working'}
              </h2>
              <p className="text-sm text-navy-300">
                {clip.status === 'failed'
                  ? clip.error_message ?? 'The upstream engine did not return clips for this job.'
                  : 'This job will update automatically when the engine returns rendered clips.'}
              </p>
            </div>
          )}

          {outputs.map((c, i) => (
            <div
              key={i}
              role="button"
              tabIndex={0}
              className={`card w-full text-left transition hover:border-gold-500/40 ${
                i === activeIndex ? 'border-gold-500/50 ring-1 ring-gold-500/20' : ''
              }`}
              onClick={() => setActiveIndex(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveIndex(i);
                }
              }}
            >
              <div className="flex items-start gap-3">
                {c.thumbnail && (
                  <img
                    src={c.thumbnail}
                    alt=""
                    className="w-16 h-24 object-cover rounded-md flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-navy-400">Clip {i + 1}</span>
                    <span className="text-xs text-navy-500">·</span>
                    <span className="text-xs text-navy-400">
                      {formatDuration(c.duration_seconds)}
                    </span>
                    <span className="text-xs text-navy-500">·</span>
                    <span className="text-xs text-navy-400">
                      {formatDuration(c.start_seconds)}-{formatDuration(c.end_seconds)}
                    </span>
                    {c.virality_score != null && (
                      <span className="badge bg-teal-500/20 text-teal-300 border border-teal-500/30 ml-auto">
                        {c.virality_score} virality
                      </span>
                    )}
                  </div>
                  {c.hook && (
                    <div className="text-sm font-semibold text-gold-300 mb-1">"{c.hook}"</div>
                  )}
                  {c.caption && (
                    <p className="text-sm text-navy-200 leading-relaxed">{c.caption}</p>
                  )}
                  {c.caption && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void copy(c.caption!, i); }}
                      className="mt-2 text-xs text-teal-400 hover:text-teal-300"
                    >
                      {copied === i ? 'Copied ✓' : 'Copy caption'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
