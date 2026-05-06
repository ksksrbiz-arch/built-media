import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type Clip } from '../lib/api';
import { supabase } from '../lib/supabase';

export default function ClipDetail() {
  const { id } = useParams<{ id: string }>();
  const [clip, setClip] = useState<Clip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    void api.getClip(id).then((r) => setClip(r.clip)).catch((e) => setError(e.message));

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

  if (error) return <div className="max-w-4xl mx-auto px-6 py-12 text-red-400">{error}</div>;
  if (!clip) return <div className="max-w-4xl mx-auto px-6 py-12 text-navy-300">Loading…</div>;

  const active = clip.output[activeIndex];

  async function copy(text: string, idx: number) {
    await navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <Link to="/dashboard" className="text-navy-300 hover:text-white text-sm mb-6 inline-flex items-center gap-1">
        ← Back to dashboard
      </Link>

      <div className="grid lg:grid-cols-[420px_1fr] gap-8">
        {/* Player */}
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

        {/* Sidebar with all clips + captions */}
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h1 className="font-display text-xl font-bold">
                {clip.output.length} clip{clip.output.length === 1 ? '' : 's'} ready
              </h1>
              <span className="text-xs text-navy-400">via {clip.engine}</span>
            </div>
            <div className="text-sm text-navy-300 truncate">Source: {clip.source_url}</div>
          </div>

          {clip.output.map((c, i) => (
            <div
              key={i}
              className={`card cursor-pointer transition ${
                i === activeIndex ? 'border-gold-500/50 ring-1 ring-gold-500/20' : ''
              }`}
              onClick={() => setActiveIndex(i)}
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
                      {Math.round(c.duration_seconds)}s
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
