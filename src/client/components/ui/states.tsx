import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/api';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-6 text-sm text-slate-600"
    >
      <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center">
      <Inbox className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * A 409 is not really an error — someone else edited the board first, and the
 * refetch has already loaded the current state. Say that, rather than
 * showing a raw failure.
 */
export function ErrorState({ error }: { error: unknown }) {
  const isConflict = error instanceof ApiError && error.isConflict;

  const message = isConflict
    ? 'This board was updated by someone else. The latest version has been loaded — please review and try again.'
    : error instanceof Error
      ? error.message
      : 'Something went wrong.';

  return (
    <div
      role="alert"
      className={`flex gap-3 rounded-lg border-l-4 px-4 py-3 text-sm ${
        isConflict
          ? 'border-amber-500 bg-amber-50 text-amber-900'
          : 'border-red-500 bg-red-50 text-red-900'
      }`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
