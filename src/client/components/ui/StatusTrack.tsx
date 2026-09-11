import type { BoardStatus } from '@shared/types';
import { STATUS_LABELS } from '@shared/domain/board-state';

/**
 * The board lifecycle as position rather than a word.
 *
 * Three segments — Submitted → Approved → Scheduled — because Not Submitted
 * is the absence of progress, not a step. Rejected deliberately reads as a
 * step *lost*: one filled segment tinted red, then a broken one, so scanning
 * the column shows which board fell back rather than only how far each got.
 *
 * The label stays next to the track for the same reason StatusBadge pairs
 * colour with an icon and text — colour alone fails colour-blind users and
 * greyscale printing (docs §11 item 8).
 */
const SEGMENTS = 3;

const TRACK: Record<
  BoardStatus,
  { filled: number; fill: string; trailing: string; label: string; hint: string }
> = {
  NotSubmitted: {
    filled: 0,
    fill: 'bg-slate-400',
    trailing: 'bg-slate-200',
    label: 'text-slate-600',
    hint: 'Not yet constituted',
  },
  Submitted: {
    filled: 1,
    fill: 'bg-amber-600',
    trailing: 'bg-slate-200',
    label: 'text-amber-800',
    hint: 'Awaiting your approval',
  },
  Approved: {
    filled: 2,
    fill: 'bg-emerald-600',
    trailing: 'bg-slate-200',
    label: 'text-emerald-800',
    hint: 'Approved',
  },
  Locked: {
    filled: 3,
    fill: 'bg-blue-600',
    trailing: 'bg-slate-200',
    label: 'text-blue-800',
    hint: 'Complete',
  },
  Rejected: {
    filled: 1,
    fill: 'bg-red-600',
    // Tinted rather than grey: the track is broken, not merely unreached.
    trailing: 'bg-red-200',
    label: 'text-red-800',
    hint: 'Sent back — with the HoD',
  },
};

export function StatusTrack({
  status,
  hint,
}: {
  status: BoardStatus;
  /** Overrides the default stage caption when the board needs something specific. */
  hint?: string;
}) {
  const spec = TRACK[status];
  const caption = hint ?? spec.hint;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className="flex gap-0.5"
          role="img"
          aria-label={`${STATUS_LABELS[status]} — step ${spec.filled} of ${SEGMENTS}`}
        >
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 w-8 rounded-full ${
                i < spec.filled
                  ? spec.fill
                  : status === 'Rejected' && i === spec.filled
                    ? spec.trailing
                    : 'bg-slate-200'
              }`}
            />
          ))}
        </span>
        <span className={`ml-1 text-xs font-semibold ${spec.label}`}>
          {STATUS_LABELS[status]}
        </span>
      </div>
      {caption && <span className="text-xs text-slate-400">{caption}</span>}
    </div>
  );
}
