import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { ConfirmDialog, Skeleton, StatusBadge } from '../../components/admin-ui';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

type AdminClipFull = {
  id: string;
  user_id: string;
  source_url: string;
  source_title?: string | null;
  engine: string;
  external_job_id?: string | null;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  error_message?: string | null;
  output?: unknown;
  metadata?: unknown;
  created_at: string;
  updated_at: string;
};

export default function AdminClipDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [clip, setClip] = useState<AdminClipFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmFail, setConfirmFail] = useState(false);

  async function refresh() {
    try {
      const { clip } = await api.admin.getClip(id) as unknown as { clip: AdminClipFull };
      setClip(clip);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function doAction(action: 'retry' | 'mark_failed' | 'delete') {
    setBusy(true);
    try {
      await api.admin.clipAction(id, action);
      if (action === 'delete') {
        nav('/admin/clips', { replace: true });
        return;
      }
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setConfirmDelete(false);
      setConfirmFail(false);
    }
  }

  if (error) {
    return (
      <div>
        <Link to="/admin/clips" className="text-sm text-gold-300">← Back</Link>
        <div className="card mt-4 text-red-300">{error}</div>
      </div>
    );
  }
  if (!clip) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-32 md:pb-0">
      <Link to="/admin/clips" className="text-sm text-gold-300 hover:text-gold-200">
        ← All clips
      </Link>

      <div className="card !p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display text-lg font-bold truncate">
              {clip.source_title || 'Untitled job'}
            </div>
            <a
              href={clip.source_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 text-xs text-gold-300 hover:text-gold-200 break-all block"
            >
              {clip.source_url}
            </a>
          </div>
          <StatusBadge status={clip.status} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-navy-400">Engine</dt>
          <dd className="text-right">{clip.engine}</dd>
          <dt className="text-navy-400">External ID</dt>
          <dd className="text-right font-mono text-[11px] break-all">
            {clip.external_job_id ?? '—'}
          </dd>
          <dt className="text-navy-400">User</dt>
          <dd className="text-right">
            <Link to={`/admin/users/${clip.user_id}`} className="font-mono text-[11px] text-gold-300">
              {clip.user_id.slice(0, 8)}…
            </Link>
          </dd>
          <dt className="text-navy-400">Created</dt>
          <dd className="text-right">{new Date(clip.created_at).toLocaleString()}</dd>
          <dt className="text-navy-400">Updated</dt>
          <dd className="text-right">{new Date(clip.updated_at).toLocaleString()}</dd>
        </dl>
        {clip.error_message && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 text-sm px-3 py-2">
            {clip.error_message}
          </div>
        )}
      </div>

      <details className="card !p-4">
        <summary className="cursor-pointer text-sm font-medium">Raw job payload</summary>
        <pre className="mt-3 text-[11px] font-mono whitespace-pre-wrap break-all text-navy-200">
{JSON.stringify({ output: clip.output, metadata: clip.metadata }, null, 2)}
        </pre>
      </details>

      <div className="md:static fixed bottom-16 inset-x-0 z-20 px-4 md:px-0">
        <div className="card !p-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => void doAction('retry')}
            disabled={busy}
            className="btn-secondary min-h-[44px]"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => setConfirmFail(true)}
            disabled={busy}
            className="btn-secondary min-h-[44px]"
          >
            Mark failed
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            className="btn min-h-[44px] bg-red-500/90 text-white hover:bg-red-500"
          >
            Delete
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmFail}
        title="Mark this clip as failed?"
        message="Use this when an external job is stuck or won't complete. The user will see the failure on their dashboard."
        confirmLabel="Mark failed"
        busy={busy}
        onCancel={() => setConfirmFail(false)}
        onConfirm={() => void doAction('mark_failed')}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete clip permanently?"
        message="This removes the job row. Linked usage events stay (clip_id nulled). This cannot be undone."
        destructive
        confirmLabel="Delete"
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void doAction('delete')}
      />
    </div>
  );
}
