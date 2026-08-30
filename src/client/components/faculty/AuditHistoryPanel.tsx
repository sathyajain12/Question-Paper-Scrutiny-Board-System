import { Plus, Trash2 } from 'lucide-react';
import type { FacultyAuditRow } from '@shared/types';
import { formatDateLong } from '@/lib/format';
import { ErrorState, LoadingState } from '../ui/states';

/**
 * Every override change for the department, including ones later removed —
 * the Overrides table above only shows what's currently in force, so this is
 * the only place a removed exclusion's reason is still visible.
 */
export function AuditHistoryPanel({
  history,
  isPending,
  error,
}: {
  history: FacultyAuditRow[] | undefined;
  isPending: boolean;
  error: unknown;
}) {
  if (isPending) return <LoadingState label="Loading history…" />;
  if (error) return <ErrorState error={error} />;

  if (!history || history.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No override changes recorded for this department yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
      <table className="w-full min-w-3xl border-collapse bg-white text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs tracking-wide text-slate-600 uppercase">
            <th scope="col" className="px-3 py-2.5">When</th>
            <th scope="col" className="px-3 py-2.5">Change</th>
            <th scope="col" className="px-3 py-2.5">Name</th>
            <th scope="col" className="px-3 py-2.5">Reason</th>
            <th scope="col" className="px-3 py-2.5">By</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {history.map((row, i) => (
            <tr key={`${row.email}-${row.timestamp}-${i}`}>
              <td className="px-3 py-2.5 text-xs text-slate-500">
                {formatDateLong(row.timestamp.slice(0, 10))}
              </td>
              <td className="px-3 py-2.5">
                {row.changeType === 'removed' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Removed {row.overrideAction === 'exclude' ? 'exclusion' : 'addition'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800 ring-1 ring-inset ring-blue-200">
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    {row.overrideAction === 'exclude' ? 'Excluded' : 'Added'}
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 text-slate-800">
                {row.name}
                <span className="block text-xs text-slate-500">{row.email}</span>
              </td>
              <td className="max-w-64 px-3 py-2.5 text-xs text-slate-600">
                {row.reason || <span className="text-slate-400">—</span>}
              </td>
              <td className="px-3 py-2.5 text-xs text-slate-500">{row.actorEmail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
