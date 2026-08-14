import { AlertCircle, Check, FolderX, Minus } from 'lucide-react';
import type { CheckResult, FolderCheck } from '@shared/types';
import { foldersFor, type CheckType } from '@shared/constants/folder-spec';

/**
 * The course × folder matrix.
 *
 * Columns come from foldersFor(), so a folder rename is a one-line change in
 * shared/constants/folder-spec.ts rather than a hunt through markup — the
 * failure mode the old portal had, where a UI label drifted from the folder
 * name it described (docs §11 item 7).
 */
export function CheckMatrix({
  result,
  type,
  problemsOnly,
}: {
  result: CheckResult;
  type: CheckType;
  problemsOnly: boolean;
}) {
  const specs = foldersFor(type);

  const isProblem = (row: CheckResult['rows'][number]) =>
    specs.some(
      (spec) => spec.required && row.folders[spec.key]?.status !== 'found',
    );

  const rows = problemsOnly ? result.rows.filter(isProblem) : result.rows;

  if (rows.length === 0) {
    return (
      <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Every required file is present for all {result.rows.length} courses.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
      <table className="w-full border-collapse bg-white text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs tracking-wide text-slate-600 uppercase">
            <th scope="col" className="px-3 py-2.5">Course</th>
            {specs.map((spec) => (
              <th key={spec.key} scope="col" className="px-3 py-2.5 text-center">
                {spec.label}
                {spec.required && (
                  <span className="ml-1 text-red-500" title="Required">*</span>
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.courseCode}>
              <th scope="row" className="px-3 py-2.5 text-left font-normal">
                <span className="font-mono font-semibold text-brand-700">
                  {row.courseCode}
                </span>
                <span className="block text-xs text-slate-500">
                  {row.courseTitle}
                </span>
              </th>

              {specs.map((spec) => (
                <td key={spec.key} className="px-3 py-2.5 text-center">
                  <Cell
                    check={row.folders[spec.key]}
                    required={spec.required}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Every state pairs an icon with text — colour alone would fail colour-blind
 * users and greyscale printouts (docs §11 item 8).
 */
function Cell({
  check,
  required,
}: {
  check: FolderCheck | undefined;
  required: boolean;
}) {
  if (!check) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  if (check.status === 'folderNotFound') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">
        <FolderX className="h-3.5 w-3.5" aria-hidden="true" />
        No folder
      </span>
    );
  }

  if (check.status === 'missing') {
    // An optional folder being empty is information, not a failure.
    return required ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Missing
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        None
      </span>
    );
  }

  const label = (
    <>
      <Check className="h-3.5 w-3.5" aria-hidden="true" />
      {check.fileCount} file{check.fileCount === 1 ? '' : 's'}
    </>
  );

  return check.folderUrl ? (
    <a
      href={check.folderUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 hover:underline"
    >
      {label}
    </a>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
      {label}
    </span>
  );
}
