import { EyeOff, Trash2, UserPlus } from 'lucide-react';
import type { FacultyOverride, FacultyOverrideAction } from '@shared/types';
import { formatDateLong } from '@/lib/format';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/states';

/** Colour is paired with an icon and a word, per docs §11 item 8. */
const ACTION_STYLES: Record<
  FacultyOverrideAction,
  { label: string; className: string; Icon: typeof EyeOff }
> = {
  exclude: {
    label: 'Excluded',
    className: 'bg-red-50 text-red-800 ring-red-200',
    Icon: EyeOff,
  },
  add: {
    label: 'Added',
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    Icon: UserPlus,
  },
};

/** Every override in force for the department, with who set it and when. */
export function OverrideTable({
  overrides,
  pendingEmail,
  onRemove,
}: {
  overrides: FacultyOverride[];
  pendingEmail: string | null;
  onRemove: (email: string) => void;
}) {
  if (overrides.length === 0) {
    return (
      <EmptyState
        title="No overrides in force"
        hint="HoDs in this department see the Faculty list exactly as it stands."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
      <table className="w-full min-w-2xl border-collapse bg-white text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs tracking-wide text-slate-600 uppercase">
            <th scope="col" className="px-3 py-2.5">Name</th>
            <th scope="col" className="px-3 py-2.5">Email</th>
            <th scope="col" className="px-3 py-2.5">Campus</th>
            <th scope="col" className="px-3 py-2.5">Override</th>
            <th scope="col" className="px-3 py-2.5">Set by</th>
            <th scope="col" className="px-3 py-2.5">Remove</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {overrides.map((override) => {
            const { label, className, Icon } = ACTION_STYLES[override.action];
            const pending = pendingEmail === override.email.toLowerCase();

            return (
              <tr key={override.email}>
                <td className="px-3 py-2.5 font-medium text-slate-800">
                  {override.name}
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-500">
                  {override.email}
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {override.campus || '—'}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${className}`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {label}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-500">
                  {override.createdBy}
                  <span className="block">
                    {formatDateLong(override.createdAt.slice(0, 10))}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <Button
                    variant="secondary"
                    loading={pending}
                    onClick={() => onRemove(override.email)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
