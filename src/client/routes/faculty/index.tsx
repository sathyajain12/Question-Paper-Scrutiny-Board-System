/**
 * Tab 4 — Faculty Overrides (admin).
 *
 * Exclude visiting staff or ward conflicts from a department's nomination
 * list, and add faculty who have no Faculty row at all. Changes take effect
 * for HoDs immediately, because `listFaculty` applies overrides server-side.
 *
 * Two deliberate changes from the old portal: the degree → board cascade is
 * gone (an override is keyed by department alone, so the degree step only ever
 * narrowed a dropdown), and there is no "Load Faculty" button — React Query
 * fetches on selection and caches the result.
 */
import { useState } from 'react';
import { Users } from 'lucide-react';
import type { FacultyMember, FacultyOverrideAction } from '@shared/types';
import type { FacultyIdentityInput } from '@shared/schemas/faculty';
import { AddFacultyForm } from '@/components/faculty/AddFacultyForm';
import { BaseFacultyTable } from '@/components/faculty/BaseFacultyTable';
import { OverrideTable } from '@/components/faculty/OverrideTable';
import { ErrorState, LoadingState } from '@/components/ui/states';
import {
  useDeleteFacultyOverride,
  useFacultyDepartments,
  useFacultyOverrides,
  useSaveFacultyOverride,
} from '@/lib/hooks';

export default function FacultyOverridesPage() {
  const [department, setDepartment] = useState('');

  const departments = useFacultyDepartments();
  const snapshot = useFacultyOverrides(department || null);
  const save = useSaveFacultyOverride();
  const remove = useDeleteFacultyOverride();

  // Which row is mid-write, so only that row shows a spinner.
  const pendingEmail =
    (save.isPending ? save.variables?.email : null) ??
    (remove.isPending ? remove.variables?.email : null) ??
    null;

  function exclude(member: FacultyMember) {
    save.mutate({
      department,
      email: member.email,
      name: member.name,
      campus: member.campus,
      action: 'exclude',
    });
  }

  function add(input: FacultyIdentityInput) {
    return save.mutateAsync({ ...input, department, action: 'add' });
  }

  const data = snapshot.data;

  return (
    <div>
      <h2 className="text-lg font-bold text-brand-600">Faculty Overrides</h2>
      <p className="mt-1 text-sm text-slate-500">
        Adjust who a department’s HoD may nominate. Exclusions and additions
        apply to every board in that department, and take effect immediately.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-4 rounded-lg bg-slate-50 p-4">
        <label className="text-xs font-semibold text-slate-600">
          Department
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            disabled={departments.isPending}
            className="mt-1 block w-72 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
          >
            <option value="">— Select a department —</option>
            {departments.data?.departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        {data && (
          <p className="flex items-center gap-2 pb-2 text-sm text-slate-600">
            <Users className="h-4 w-4 text-slate-400" aria-hidden="true" />
            HoDs see{' '}
            <span className="font-semibold text-slate-800">
              {data.effective.length} faculty
            </span>
            {/* Spelled out per kind: "N of M" reads as "nothing changed"
                whenever one exclusion and one addition cancel out. */}
            {` · ${countBy(data, 'exclude')} excluded · ${countBy(data, 'add')} added`}
          </p>
        )}
      </div>

      {departments.error && (
        <div className="mt-4">
          <ErrorState error={departments.error} />
        </div>
      )}

      {!department ? (
        <p className="mt-6 text-sm text-slate-500">
          Select a department to review its faculty list.
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          {snapshot.isPending && <LoadingState label="Loading faculty…" />}
          {snapshot.error && <ErrorState error={snapshot.error} />}

          {/* Write failures surface once, above the tables that caused them. */}
          {(save.error || remove.error) && (
            <ErrorState error={save.error ?? remove.error} />
          )}

          {data && (
            <>
              <Section
                title="Faculty records"
                description="Straight from the Faculty tab. Excluding hides someone from the HoD’s picker without touching the spreadsheet."
              >
                <BaseFacultyTable
                  baseFaculty={data.baseFaculty}
                  overrides={data.overrides}
                  pendingEmail={pendingEmail}
                  onExclude={exclude}
                  onRestore={(email) => remove.mutate({ department, email })}
                />
              </Section>

              <Section
                title="Overrides in force"
                description="Removing an override restores the default behaviour for that person."
              >
                <OverrideTable
                  overrides={data.overrides}
                  pendingEmail={pendingEmail}
                  onRemove={(email) => remove.mutate({ department, email })}
                />
              </Section>

              <Section
                title="Add faculty"
                description="For faculty with no Faculty record in this department — visiting staff, or someone recorded only under another department."
              >
                <AddFacultyForm
                  department={department}
                  saving={save.isPending && save.variables?.action === 'add'}
                  onAdd={add}
                />
              </Section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function countBy(
  data: { overrides: { action: FacultyOverrideAction }[] },
  action: FacultyOverrideAction,
): number {
  return data.overrides.filter((o) => o.action === action).length;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {title}
      </h3>
      <p className="mt-1 mb-3 text-sm text-slate-500">{description}</p>
      {children}
    </section>
  );
}
