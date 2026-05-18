import type { ReactNode } from 'react';
import { useEffect } from 'react';

export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'warn' | 'good';
}) {
  const accent =
    tone === 'warn' ? 'text-red-300' : tone === 'good' ? 'text-teal-300' : 'text-white';
  return (
    <div className="card !p-4">
      <div className="text-xs uppercase tracking-wider text-navy-300">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold ${accent}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-navy-400">{hint}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-navy-800/60 ${className}`}
      aria-hidden="true"
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card text-center py-10">
      <h3 className="font-display text-lg font-bold mb-1">{title}</h3>
      {description && <p className="text-sm text-navy-300">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'ready'
      ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
      : status === 'failed'
      ? 'bg-red-500/15 text-red-300 border border-red-500/30'
      : status === 'processing'
      ? 'bg-gold-500/15 text-gold-300 border border-gold-500/30'
      : 'bg-navy-800 text-navy-200 border border-navy-700';
  return <span className={`badge ${cls}`}>{status}</span>;
}

/**
 * Bottom-sheet modal on mobile, centred dialog on ≥ sm.
 * Closes on Escape and on backdrop click.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full sm:max-w-md bg-navy-900 border border-navy-700 rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-[slideUp_180ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost !px-3 !py-1.5 text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = false,
  onCancel,
  onConfirm,
  busy = false,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <BottomSheet open={open} onClose={onCancel} title={title}>
      <div className="text-sm text-navy-200 mb-5">{message}</div>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary min-h-[44px]" disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`btn min-h-[44px] ${
            destructive
              ? 'bg-red-500 text-white hover:bg-red-400'
              : 'bg-gold-500 text-navy-900 hover:bg-gold-400'
          }`}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </BottomSheet>
  );
}
