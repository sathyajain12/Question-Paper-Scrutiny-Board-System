import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import type { BoardStatus, DashboardCounts } from '@shared/types';
import { useChangedKeys } from '@/lib/motion';

/**
 * The counts ARE the filter.
 *
 * The old screen showed six tiles and then repeated the same six statuses as
 * a row of chips underneath. One control does both jobs now, and breaking the
 * equal-weight grid lets the number an admin actually came for carry the page.
 *
 * "Needs your action" is deliberately not one of the five status counts: it is
 * Submitted plus Approved-with-no-dates-offered — the two cases where the next
 * move belongs to the office. That is why it sits apart rather than among them.
 */
export type AdminFilter = BoardStatus | 'All' | 'NeedsAction';

interface Tile {
  filter: AdminFilter;
  key: keyof DashboardCounts;
  label: string;
  /** Resting colours; selection adds a ring and dims the rest. */
  className: string;
  dot: string;
}

const TILES: Tile[] = [
  { filter: 'All', key: 'total', label: 'Total', className: 'bg-brand-50 text-brand-700 ring-brand-100', dot: 'bg-brand-500' },
  { filter: 'NotSubmitted', key: 'notSubmitted', label: 'Not submitted', className: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-400' },
  { filter: 'Approved', key: 'approved', label: 'Approved', className: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-600' },
  { filter: 'Rejected', key: 'rejected', label: 'Rejected', className: 'bg-red-50 text-red-800 ring-red-200', dot: 'bg-red-600' },
  { filter: 'Locked', key: 'locked', label: 'Scheduled', className: 'bg-blue-50 text-blue-800 ring-blue-200', dot: 'bg-blue-600' },
];

export function SummaryCards({
  counts,
  needsAction,
  active,
  onSelect,
}: {
  counts: DashboardCounts;
  needsAction: number;
  active: AdminFilter;
  onSelect: (filter: AdminFilter) => void;
}) {
  const dimOthers = active !== 'All';

  // Only the tile whose number moved is highlighted — flashing all six would
  // say nothing about what the last click actually did.
  const tracked = useMemo(
    () => ({ ...counts, needsAction }),
    [counts, needsAction],
  );
  const changed = useChangedKeys(tracked);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
      <button
        type="button"
        onClick={() => onSelect(active === 'NeedsAction' ? 'All' : 'NeedsAction')}
        aria-pressed={active === 'NeedsAction'}
        className={`flex flex-col justify-between rounded-xl px-4 py-4 text-left ring-1 ring-inset transition duration-300 sm:w-64 ${
          changed.has('needsAction') ? 'bg-amber-100' : 'bg-amber-50'
        } ${
          active === 'NeedsAction'
            ? 'ring-2 ring-amber-500'
            : 'ring-amber-200 hover:ring-amber-400'
        } ${dimOthers && active !== 'NeedsAction' ? 'opacity-60' : ''}`}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-amber-800">
          <Clock className="h-4 w-4" aria-hidden="true" />
          Needs your action
        </span>
        <span className="mt-2 flex items-baseline gap-2">
          <span
            className={`text-4xl leading-none font-bold text-amber-800 motion-safe:transition-transform motion-safe:duration-300 ${
              changed.has('needsAction') ? 'scale-110' : 'scale-100'
            }`}
          >
            {needsAction}
          </span>
          <span className="text-sm text-amber-800">
            {needsAction === 1 ? 'board waiting' : 'boards waiting'}
          </span>
        </span>
      </button>

      <dl className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {TILES.map(({ filter, key, label, className, dot }) => {
          const selected = active === filter;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(selected && filter !== 'All' ? 'All' : filter)}
              aria-pressed={selected}
              className={`flex flex-col gap-1.5 rounded-xl px-3.5 py-3 text-left ring-1 ring-inset transition duration-300 ${className} ${
                selected ? 'ring-2 ring-offset-1' : 'hover:ring-2'
              } ${dimOthers && !selected ? 'opacity-50' : ''} ${
                changed.has(key) ? 'ring-2 brightness-95' : ''
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
                <dt className="text-xs font-semibold">{label}</dt>
              </span>
              <dd
                className={`text-2xl leading-none font-bold motion-safe:transition-transform motion-safe:duration-300 ${
                  changed.has(key) ? 'scale-110' : 'scale-100'
                }`}
              >
                {counts[key]}
              </dd>
            </button>
          );
        })}
      </dl>
    </div>
  );
}
