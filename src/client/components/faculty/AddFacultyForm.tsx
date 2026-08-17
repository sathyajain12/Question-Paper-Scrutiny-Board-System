import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import {
  facultyIdentitySchema,
  type FacultyIdentityInput,
} from '@shared/schemas/faculty';
import { useCampusLookup } from '@/lib/hooks';
import { Button } from '../ui/Button';

const BLANK = { name: '', email: '', campus: '' };

/**
 * Adds someone who has no Faculty row for this department — visiting staff,
 * or a setter recorded only on another campus.
 *
 * Validation uses the same Zod schema the Worker validates with, so the
 * messages the admin sees are the rules that actually apply.
 */
export function AddFacultyForm({
  department,
  saving,
  onAdd,
}: {
  department: string;
  saving: boolean;
  onAdd: (input: FacultyIdentityInput) => Promise<unknown>;
}) {
  const [fields, setFields] = useState(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Campus is looked up on blur rather than per keystroke, and never
  // overwrites a value the admin typed themselves.
  const [lookup, setLookup] = useState({ name: '', email: '' });
  const [campusEdited, setCampusEdited] = useState(false);
  const { data: lookedUp } = useCampusLookup(lookup.name, lookup.email);

  useEffect(() => {
    const campus = lookedUp?.campus;
    if (!campus || campusEdited) return;
    setFields((prev) => (prev.campus ? prev : { ...prev, campus }));
  }, [lookedUp, campusEdited]);

  function set(key: keyof typeof BLANK, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setErrors(({ [key]: _dropped, ...rest }) => rest);
  }

  function submit() {
    const parsed = facultyIdentitySchema.safeParse(fields);

    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0] ?? 'form'),
            issue.message,
          ]),
        ),
      );
      return;
    }

    setErrors({});
    void onAdd(parsed.data)
      .then(() => {
        setFields(BLANK);
        setLookup({ name: '', email: '' });
        setCampusEdited(false);
      })
      // The parent renders the failure; keep what was typed so it can be fixed.
      .catch(() => {});
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="rounded-lg bg-slate-50 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-start">
        <Field
          label="Full name"
          value={fields.name}
          error={errors.name}
          placeholder="Dr. A. Sharma"
          onChange={(v) => set('name', v)}
          onBlur={() =>
            setLookup((prev) => ({ ...prev, name: fields.name.trim() }))
          }
        />

        <Field
          label="Email"
          type="email"
          value={fields.email}
          error={errors.email}
          placeholder="name@sssihl.edu.in"
          onChange={(v) => set('email', v)}
          onBlur={() =>
            setLookup((prev) => ({ ...prev, email: fields.email.trim() }))
          }
        />

        <Field
          label="Campus"
          value={fields.campus}
          error={errors.campus}
          placeholder="Prasanthi Nilayam"
          hint="Filled in automatically where we know it."
          onChange={(v) => {
            setCampusEdited(true);
            set('campus', v);
          }}
        />

        <div className="sm:pt-6">
          <Button type="submit" loading={saving}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Add to {department}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  error,
  hint,
  placeholder,
  type = 'text',
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  type?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={Boolean(error)}
        className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm font-normal text-slate-800 focus:ring-1 focus:outline-none ${
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
            : 'border-slate-300 focus:border-brand-500 focus:ring-brand-500'
        }`}
      />
      {error ? (
        <span role="alert" className="mt-1 block font-normal text-red-700">
          {error}
        </span>
      ) : (
        hint && <span className="mt-1 block font-normal text-slate-500">{hint}</span>
      )}
    </label>
  );
}
