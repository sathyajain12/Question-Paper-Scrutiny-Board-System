import { CheckCircle2, CircleDashed, Clock, Lock, XCircle } from 'lucide-react';
import type { BoardStatus } from '@shared/types';
import { STATUS_LABELS } from '@shared/domain/board-state';

/**
 * Colour is never the only signal — each status carries an icon and a label,
 * so the badge survives greyscale printing and colour-blindness
 * (docs §11 item 8).
 */
const STYLES: Record<
  BoardStatus,
  { className: string; Icon: typeof CheckCircle2 }
> = {
  NotSubmitted: { className: 'bg-slate-100 text-slate-700 ring-slate-200', Icon: CircleDashed },
  Submitted: { className: 'bg-amber-50 text-amber-800 ring-amber-200', Icon: Clock },
  Approved: { className: 'bg-emerald-50 text-emerald-800 ring-emerald-200', Icon: CheckCircle2 },
  Rejected: { className: 'bg-red-50 text-red-800 ring-red-200', Icon: XCircle },
  Locked: { className: 'bg-blue-50 text-blue-800 ring-blue-200', Icon: Lock },
};

export function StatusBadge({ status }: { status: BoardStatus }) {
  const { className, Icon } = STYLES[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${className}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
