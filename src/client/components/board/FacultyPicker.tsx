import { useState } from 'react';
import type { FacultyMember } from '@shared/types';
import {
  MAX_BOARD_MEMBERS,
  MIN_BOARD_MEMBERS,
} from '@shared/schemas/board';
import { Button } from '../ui/Button';

/**
 * Faculty selection with the board-size rule actually enforced.
 *
 * The old portal displayed "2 or 3 senior faculty" but `enforceFacultyLimit`
 * had been reduced to updating a counter, so a HoD could submit 1 or 9
 * (docs §11 item 3). Here the limit is enforced in the UI *and* by the same
 * Zod schema the Worker uses, so neither side can drift.
 */
export function FacultyPicker({
  faculty,
  chairpersonName,
  initialSelection,
  submitting,
  onSubmit,
}: {
  faculty: FacultyMember[];
  chairpersonName: string;
  initialSelection: string[];
  submitting: boolean;
  onSubmit: (emails: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(initialSelection);

  const atLimit = selected.length >= MAX_BOARD_MEMBERS;
  const valid =
    selected.length >= MIN_BOARD_MEMBERS && selected.length <= MAX_BOARD_MEMBERS;

  function toggle(email: string) {
    setSelected((prev) =>
      prev.includes(email)
        ? prev.filter((e) => e !== email)
        : prev.length < MAX_BOARD_MEMBERS
          ? [...prev, email]
          : prev,
    );
  }

  return (
    <div className="mt-4">
      <div className="rounded-md bg-brand-50 px-4 py-3">
        <p className="text-sm font-semibold text-brand-700">
          Select facult memebers for the QPSB( {MIN_BOARD_MEMBERS} or {MAX_BOARD_MEMBERS} Senior faculty members per academic programme)
        </p>
        <p aria-live="polite" className="mt-0.5 text-sm text-slate-600">
          {selected.length} selected
          {atLimit && ' — maximum reached'}
        </p>
      </div>

      <p className="mt-4 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        Chairperson
      </p>
      <p className="mt-1 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
        {chairpersonName}
      </p>

      <fieldset className="mt-4">
        <legend className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Faculty members
        </legend>

        <ul className="mt-2 divide-y divide-slate-100 rounded-md ring-1 ring-slate-200">
          {faculty.map((f) => {
            const checked = selected.includes(f.email);
            return (
              <li key={f.email}>
                <label
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-slate-50 ${!checked && atLimit ? 'opacity-50' : ''
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && atLimit}
                    onChange={() => toggle(f.email)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  <span className="font-medium text-slate-800">{f.name}</span>
                  <span className="ml-auto text-xs text-slate-500">{f.campus}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="mt-4">
        <Button
          onClick={() => onSubmit(selected)}
          disabled={!valid}
          loading={submitting}
        >
          Submit QPSB Constitution
        </Button>
        {!valid && (
          <p className="mt-2 text-xs text-slate-500">
            Select at least {MIN_BOARD_MEMBERS} faculty members to submit.
          </p>
        )}
      </div>
    </div>
  );
}
