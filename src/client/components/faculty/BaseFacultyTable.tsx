import { useState } from 'react';
import { Check, EyeOff, Undo2 } from 'lucide-react';
import type { FacultyMember, FacultyOverride } from '@shared/types';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/states';
import { ExcludeConfirmPanel } from './ExcludeConfirmPanel';

/**
 * The department's Faculty rows, each with its exclusion state.
 *
 * Restoring is reversible from the same row in one click, so it has no
 * confirmation step — the old portal's window.confirm() announced nothing to
 * screen readers and guarded an action that's trivially undoable anyway.
 * Excluding gets a reveal (reason + active-nomination check) instead, since
 * it's the one action here that isn't instantly one-click-reversible.
 */
export function BaseFacultyTable({
  department,
  baseFaculty,
  overrides,
  isRowPending,
  selected,
  onToggleSelect,
  onExclude,
  onRestore,
}: {
  department: string;
  baseFaculty: FacultyMember[];
  overrides: FacultyOverride[];
  /** True while this email's row has a write in flight — single or bulk. */
  isRowPending: (email: string) => boolean;
  selected: Set<string>;
  onToggleSelect: (email: string) => void;
  onExclude: (member: FacultyMember, reason: string) => void;
  onRestore: (email: string) => void;
}) {
  const [revealedFor, setRevealedFor] = useState<string | null>(null);

  const excluded = new Set(
    overrides
      .filter((o) => o.action === 'exclude')
      .map((o) => o.email.toLowerCase()),
  );

  if (baseFaculty.length === 0) {
    return (
      <EmptyState
        title="No faculty records for this department"
        hint="Add faculty below, or check the Faculty tab of the spreadsheet."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
      <table className="w-full min-w-2xl border-collapse bg-white text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs tracking-wide text-slate-600 uppercase">
            <th scope="col" className="w-8 px-3 py-2.5">
              <span className="sr-only">Select</span>
            </th>
            <th scope="col" className="px-3 py-2.5">Name</th>
            <th scope="col" className="px-3 py-2.5">Email</th>
            <th scope="col" className="px-3 py-2.5">Campus</th>
            <th scope="col" className="px-3 py-2.5">Visible to HoD</th>
            <th scope="col" className="px-3 py-2.5">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {baseFaculty.map((member) => {
            const email = member.email.toLowerCase();
            const isExcluded = excluded.has(email);
            const pending = isRowPending(email);
            const revealed = revealedFor === email;

            return (
              <tr key={member.email} className={isExcluded ? 'bg-slate-50' : ''}>
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.has(email)}
                    onChange={() => onToggleSelect(email)}
                    aria-label={`Select ${member.name}`}
                    className="h-4 w-4 accent-brand-600"
                  />
                </td>
                <td
                  className={`px-3 py-2.5 font-medium ${
                    isExcluded ? 'text-slate-400 line-through' : 'text-slate-800'
                  }`}
                >
                  {member.name}
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-500">
                  {member.email}
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {member.campus || '—'}
                </td>
                <td className="px-3 py-2.5">
                  {isExcluded ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 ring-1 ring-inset ring-red-200">
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                      Excluded
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      Visible
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {isExcluded ? (
                    <Button
                      variant="secondary"
                      loading={pending}
                      onClick={() => onRestore(member.email)}
                    >
                      <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Restore
                    </Button>
                  ) : revealed ? (
                    <div className="w-72">
                      <ExcludeConfirmPanel
                        department={department}
                        members={[member]}
                        busy={pending}
                        onCancel={() => setRevealedFor(null)}
                        onConfirm={(reason) => {
                          onExclude(member, reason);
                          setRevealedFor(null);
                        }}
                      />
                    </div>
                  ) : (
                    <Button
                      variant="danger"
                      onClick={() => setRevealedFor(email)}
                    >
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                      Exclude
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
