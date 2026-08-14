import { useState } from 'react';
import { CalendarCheck, ChevronDown, Users } from 'lucide-react';
import type { BoardSummary } from '@shared/types';
import { formatDateLong } from '@/lib/format';
import {
  useBoard,
  useConfirmSchedule,
  useSubmitConstitution,
} from '@/lib/hooks';
import { StatusBadge } from '../ui/StatusBadge';
import { ErrorState, LoadingState } from '../ui/states';
import { FacultyPicker } from './FacultyPicker';
import { SessionPicker } from './SessionPicker';

/** One card per programme, showing whatever the current status calls for. */
export function BoardCard({ summary }: { summary: BoardSummary }) {
  const { data, isPending, error } = useBoard(summary.boardId);
  const submit = useSubmitConstitution(summary.boardId);
  const schedule = useConfirmSchedule(summary.boardId);

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <header className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-bold text-brand-600">
          {summary.programme}
        </h3>
        <StatusBadge status={summary.status} />
        {data && <CourseDisclosure board={data.board} />}
      </header>

      {isPending && <LoadingState />}
      {error && <ErrorState error={error} />}

      {data && (
        <>
          {(submit.error || schedule.error) && (
            <div className="mt-3">
              <ErrorState error={submit.error ?? schedule.error} />
            </div>
          )}

          {summary.status === 'Rejected' && data.board.rejectionReason && (
            <div
              role="alert"
              className="mt-3 rounded-md border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              <p className="font-semibold">Modifications required</p>
              <p className="mt-0.5">{data.board.rejectionReason}</p>
            </div>
          )}

          {(summary.status === 'NotSubmitted' || summary.status === 'Rejected') && (
            <FacultyPicker
              faculty={data.faculty}
              chairpersonName={data.board.chairperson?.name ?? '—'}
              initialSelection={data.board.members.map((m) => m.email)}
              submitting={submit.isPending}
              onSubmit={(facultyEmails) =>
                submit.mutate({ facultyEmails, version: data.board.version })
              }
            />
          )}

          {/* Only when read-only: while the picker is open it already shows
              the current selection, so chips below it just duplicate it. */}
          {summary.status !== 'NotSubmitted' &&
            summary.status !== 'Rejected' &&
            data.board.members.length > 0 && (
              <MemberList names={data.board.members.map((m) => m.name)} />
            )}

          {summary.status === 'Submitted' && (
            <p className="mt-3 text-sm text-slate-600">
              Submitted — awaiting approval from the Controller of Examinations.
            </p>
          )}

          {summary.status === 'Approved' &&
            (data.board.availableDates.length > 0 ? (
              <>
                <hr className="mt-4 border-slate-200" />
                <p className="mt-4 text-sm font-semibold text-slate-700">
                  Select your preferred session date(s) and time
                </p>
                <SessionPicker
                  availableDates={data.board.availableDates}
                  submitting={schedule.isPending}
                  onConfirm={(dates, time) =>
                    schedule.mutate({ dates, time, version: data.board.version })
                  }
                />
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-600">
                Approved. The administrator will share available session dates
                shortly.
              </p>
            ))}

          {summary.status === 'Locked' && (
            <div className="mt-3 rounded-md bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                Scheduled
              </p>
              <p className="mt-1 text-sm text-emerald-800">
                {data.board.availableDates
                  .filter((d) => d.isSelected)
                  .map((d) => formatDateLong(d.date))
                  .join(' · ')}
                {data.board.sessionTime && ` at ${data.board.sessionTime}`}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function MemberList({ names }: { names: string[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Users className="h-4 w-4 text-slate-400" aria-hidden="true" />
      {names.map((name) => (
        <span
          key={name}
          className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700"
        >
          {name}
        </span>
      ))}
    </div>
  );
}

/** Course codes, collapsed by default — the list gets long. */
function CourseDisclosure({
  board,
}: {
  board: { courses: { courseCode: string; courseTitle: string }[] };
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="ml-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
      >
        {board.courses.length} courses
        <ChevronDown
          className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul className="mt-2 max-w-md space-y-1 rounded-md bg-slate-50 p-3">
          {board.courses.map((course) => (
            <li key={course.courseCode} className="flex gap-2 text-xs">
              <span className="font-mono font-semibold text-brand-700">
                {course.courseCode}
              </span>
              <span className="text-slate-600">{course.courseTitle}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
