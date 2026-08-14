import { useState } from 'react';
import type { BoardDate } from '@shared/types';
import { SESSION_TIMES } from '@shared/schemas/board';
import { formatDateLong } from '@/lib/format';
import { Button } from '../ui/Button';

/**
 * The HoD picks one or more of the dates the admin offered, plus a single
 * start time that applies to all of them — which is how the original portal
 * behaved, though it stored the result as "date | time;date | time".
 */
export function SessionPicker({
  availableDates,
  submitting,
  onConfirm,
}: {
  availableDates: BoardDate[];
  submitting: boolean;
  onConfirm: (dates: string[], time: string) => void;
}) {
  const [dates, setDates] = useState<string[]>([]);
  const [time, setTime] = useState<string>('');

  const valid = dates.length > 0 && time !== '';

  return (
    <div className="mt-4 space-y-5">
      <fieldset>
        <legend className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Select date(s)
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {availableDates.map(({ date }) => {
            const checked = dates.includes(date);
            return (
              <label
                key={date}
                className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1 transition ${
                  checked
                    ? 'bg-brand-600 text-white ring-brand-600'
                    : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() =>
                    setDates((prev) =>
                      prev.includes(date)
                        ? prev.filter((d) => d !== date)
                        : [...prev, date],
                    )
                  }
                />
                {formatDateLong(date)}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Commencement time
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {SESSION_TIMES.map((t) => (
            <label
              key={t}
              className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm ring-1 transition ${
                time === t
                  ? 'bg-brand-600 font-semibold text-white ring-brand-600'
                  : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="session-time"
                className="sr-only"
                checked={time === t}
                onChange={() => setTime(t)}
              />
              {t}
            </label>
          ))}
        </div>
      </fieldset>

      <Button
        onClick={() => onConfirm(dates, time)}
        disabled={!valid}
        loading={submitting}
      >
        Confirm date &amp; time
      </Button>
    </div>
  );
}
