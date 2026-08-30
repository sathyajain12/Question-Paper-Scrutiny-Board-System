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
import { ChevronDown, ChevronUp, History, Search, Users } from 'lucide-react';
import type { FacultyMember, FacultyOverrideAction } from '@shared/types';
import type { FacultyIdentityInput } from '@shared/schemas/faculty';
import { AddFacultyForm } from '@/components/faculty/AddFacultyForm';
import { AuditHistoryPanel } from '@/components/faculty/AuditHistoryPanel';
import { BaseFacultyTable } from '@/components/faculty/BaseFacultyTable';
import { ExcludeConfirmPanel } from '@/components/faculty/ExcludeConfirmPanel';
import { OverrideTable } from '@/components/faculty/OverrideTable';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import {
  useDeleteFacultyOverride,
  useFacultyAuditLog,
  useFacultyDepartments,
  useFacultyOverrides,
  useSaveFacultyOverride,
} from '@/lib/hooks';

export default function FacultyOverridesPage() {
  const [department, setDepartment] = useState('');
  const [filter, setFilter] = useState('');
  const [baseSelected, setBaseSelected] = useState<Set<string>>(new Set());
  const [overrideSelected, setOverrideSelected] = useState<Set<string>>(new Set());
  const [bulkExcludeOpen, setBulkExcludeOpen] = useState(false);
  const [bulkBusyEmails, setBulkBusyEmails] = useState<Set<string>>(new Set());
  const [historyOpen, setHistoryOpen] = useState(false);

  const departments = useFacultyDepartments();
  const snapshot = useFacultyOverrides(department || null);
  const history = useFacultyAuditLog(department || null, historyOpen);
  const save = useSaveFacultyOverride();
  const remove = useDeleteFacultyOverride();

  const data = snapshot.data;

  function isRowPending(email: string): boolean {
    if (bulkBusyEmails.has(email)) return true;
    if (save.isPending && save.variables?.email.toLowerCase() === email) return true;
    if (remove.isPending && remove.variables?.email.toLowerCase() === email) return true;
    return false;
  }

  function selectDepartment(next: string) {
    setDepartment(next);
    setFilter('');
    setBaseSelected(new Set());
    setOverrideSelected(new Set());
    setBulkExcludeOpen(false);
  }

  function toggleBase(email: string) {
    setBaseSelected((prev) => toggled(prev, email));
  }

  function toggleOverride(email: string) {
    setOverrideSelected((prev) => toggled(prev, email));
  }

  function exclude(member: FacultyMember, reason: string) {
    save.mutate({
      department,
      email: member.email,
      name: member.name,
      campus: member.campus,
      action: 'exclude',
      reason: reason || undefined,
    });
  }

  function add(input: FacultyIdentityInput & { reason?: string }) {
    return save.mutateAsync({ ...input, department, action: 'add' });
  }

  async function bulkRestore(emails: string[]) {
    setBulkBusyEmails(new Set(emails));
    await Promise.allSettled(emails.map((email) => remove.mutateAsync({ department, email })));
    setBulkBusyEmails(new Set());
    setBaseSelected(new Set());
  }

  async function bulkRemove(emails: string[]) {
    setBulkBusyEmails(new Set(emails));
    await Promise.allSettled(emails.map((email) => remove.mutateAsync({ department, email })));
    setBulkBusyEmails(new Set());
    setOverrideSelected(new Set());
  }

  async function confirmBulkExclude(members: FacultyMember[], reason: string) {
    setBulkBusyEmails(new Set(members.map((m) => m.email.toLowerCase())));
    await Promise.allSettled(
      members.map((m) =>
        save.mutateAsync({
          department,
          email: m.email,
          name: m.name,
          campus: m.campus,
          action: 'exclude',
          reason: reason || undefined,
        }),
      ),
    );
    setBulkBusyEmails(new Set());
    setBaseSelected(new Set());
    setBulkExcludeOpen(false);
  }

  const needle = filter.trim().toLowerCase();
  const matches = (name: string, email: string) =>
    !needle || name.toLowerCase().includes(needle) || email.toLowerCase().includes(needle);

  const filteredBaseFaculty = data?.baseFaculty.filter((f) => matches(f.name, f.email)) ?? [];
  const filteredOverrides = data?.overrides.filter((o) => matches(o.name, o.email)) ?? [];

  const excludedEmails = new Set(
    (data?.overrides ?? [])
      .filter((o) => o.action === 'exclude')
      .map((o) => o.email.toLowerCase()),
  );

  const selectedExcludable = data?.baseFaculty.filter(
    (f) => baseSelected.has(f.email.toLowerCase()) && !excludedEmails.has(f.email.toLowerCase()),
  ) ?? [];
  const selectedRestorable = [...baseSelected].filter((email) => excludedEmails.has(email));

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
            onChange={(e) => selectDepartment(e.target.value)}
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
          <label className="text-xs font-semibold text-slate-600">
            Search
            <div className="relative mt-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by name or email"
                className="block w-64 rounded-md border border-slate-300 bg-white py-2 pr-3 pl-8 text-sm font-normal text-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
              />
            </div>
          </label>
        )}

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
                {selectedExcludable.length > 0 || selectedRestorable.length > 0 ? (
                  <div className="mb-3">
                    {bulkExcludeOpen ? (
                      <ExcludeConfirmPanel
                        department={department}
                        members={selectedExcludable}
                        busy={bulkBusyEmails.size > 0}
                        onCancel={() => setBulkExcludeOpen(false)}
                        onConfirm={(reason) => void confirmBulkExclude(selectedExcludable, reason)}
                      />
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
                        <span className="text-xs font-semibold text-slate-600">
                          {baseSelected.size} selected
                        </span>
                        {selectedExcludable.length > 0 && (
                          <Button variant="danger" onClick={() => setBulkExcludeOpen(true)}>
                            Exclude {selectedExcludable.length} selected
                          </Button>
                        )}
                        {selectedRestorable.length > 0 && (
                          <Button
                            variant="secondary"
                            loading={bulkBusyEmails.size > 0}
                            onClick={() => void bulkRestore(selectedRestorable)}
                          >
                            Restore {selectedRestorable.length} selected
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}

                <BaseFacultyTable
                  department={department}
                  baseFaculty={filteredBaseFaculty}
                  overrides={data.overrides}
                  isRowPending={isRowPending}
                  selected={baseSelected}
                  onToggleSelect={toggleBase}
                  onExclude={exclude}
                  onRestore={(email) => remove.mutate({ department, email })}
                />
              </Section>

              <Section
                title="Overrides in force"
                description="Removing an override restores the default behaviour for that person."
              >
                {overrideSelected.size > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
                    <span className="text-xs font-semibold text-slate-600">
                      {overrideSelected.size} selected
                    </span>
                    <Button
                      variant="secondary"
                      loading={bulkBusyEmails.size > 0}
                      onClick={() => void bulkRemove([...overrideSelected])}
                    >
                      Remove {overrideSelected.size} selected
                    </Button>
                  </div>
                )}

                <OverrideTable
                  overrides={filteredOverrides}
                  isRowPending={isRowPending}
                  selected={overrideSelected}
                  onToggleSelect={toggleOverride}
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

              <section>
                <button
                  type="button"
                  onClick={() => setHistoryOpen((v) => !v)}
                  aria-expanded={historyOpen}
                  className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase hover:text-slate-700"
                >
                  <History className="h-3.5 w-3.5" aria-hidden="true" />
                  Override history
                  {historyOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>

                {historyOpen && (
                  <div className="mt-3">
                    <AuditHistoryPanel
                      history={history.data?.history}
                      isPending={history.isPending}
                      error={history.error}
                    />
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function toggled(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
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
