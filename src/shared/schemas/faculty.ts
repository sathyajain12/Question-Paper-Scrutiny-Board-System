/**
 * Faculty-override request schemas — imported by BOTH the admin form and the
 * Hono routes, so "what counts as a valid faculty record" is stated once.
 *
 * The old portal validated only that name and email were non-empty, in the
 * browser, and posted the department as a plain string. Here the shape is
 * shared and the department is still checked against the session server-side.
 */
import { z } from 'zod';

export const FACULTY_OVERRIDE_ACTIONS = ['exclude', 'add'] as const;

/** Emails are the identity of an override, so they are normalised on the way in. */
const facultyEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.');

export const department = z.string().trim().min(1, 'Select a department.');

/** The person an override refers to. Also drives the "add faculty" form. */
export const facultyIdentitySchema = z.object({
  email: facultyEmail,
  name: z
    .string()
    .trim()
    .min(2, 'Enter the faculty member’s full name.')
    .max(120),
  /** Optional: campus is a convenience for the HoD's list, not a key. */
  campus: z.string().trim().max(80).optional(),
});

export const saveFacultyOverrideSchema = facultyIdentitySchema.extend({
  department,
  action: z.enum(FACULTY_OVERRIDE_ACTIONS),
});

export const deleteFacultyOverrideSchema = z.object({
  department,
  email: facultyEmail,
});

export const departmentQuerySchema = z.object({ department });

/**
 * Campus lookup for the add-faculty form: either half may be blank, but not
 * both, or the lookup would scan for nothing.
 */
export const campusLookupSchema = z
  .object({
    name: z.string().trim().max(120).optional(),
    email: z.string().trim().toLowerCase().max(160).optional(),
  })
  .refine((q) => Boolean(q.name || q.email), 'Provide a name or an email.');

export type FacultyIdentityInput = z.infer<typeof facultyIdentitySchema>;
export type SaveFacultyOverrideInput = z.infer<typeof saveFacultyOverrideSchema>;
export type DeleteFacultyOverrideInput = z.infer<
  typeof deleteFacultyOverrideSchema
>;
