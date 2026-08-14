/**
 * Request schemas — imported by BOTH the React forms and the Hono routes,
 * so a rule is defined exactly once. See docs/ARCHITECTURE.md §11 item 3:
 * the old portal displayed the "2 or 3 faculty" rule but enforced it nowhere.
 */
import { z } from 'zod';

/** QPSB board size, per the constitution rules. */
export const MIN_BOARD_MEMBERS = 2;
export const MAX_BOARD_MEMBERS = 3;

/** Session start times offered to HoDs. */
export const SESSION_TIMES = [
  '9:30 AM',
  '10:30 AM',
  '11:30 AM',
  '12:30 PM',
  '2:30 PM',
  '3:30 PM',
  '4:30 PM',
] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (yyyy-mm-dd)');

/** Echoed on every mutation for the optimistic-concurrency check (§7). */
const version = z.number().int().nonnegative();

export const submitConstitutionSchema = z.object({
  version,
  facultyEmails: z
    .array(z.string().email())
    .min(MIN_BOARD_MEMBERS, `Select at least ${MIN_BOARD_MEMBERS} faculty members.`)
    .max(MAX_BOARD_MEMBERS, `Select at most ${MAX_BOARD_MEMBERS} faculty members.`)
    .refine((e) => new Set(e).size === e.length, 'Duplicate faculty selected.'),
});

export const approveBoardSchema = z.object({ version });

export const rejectBoardSchema = z.object({
  version,
  reason: z
    .string()
    .trim()
    .min(10, 'Give the HoD a usable reason (at least 10 characters).')
    .max(1000),
});

export const offerDatesSchema = z.object({
  version,
  dates: z
    .array(isoDate)
    .min(1, 'Offer at least one date.')
    .max(4, 'At most four dates may be offered.')
    .refine((d) => new Set(d).size === d.length, 'Duplicate dates.'),
});

export const confirmScheduleSchema = z.object({
  version,
  dates: z.array(isoDate).min(1, 'Select at least one date.'),
  time: z.enum(SESSION_TIMES),
});

export type SubmitConstitutionInput = z.infer<typeof submitConstitutionSchema>;
export type RejectBoardInput = z.infer<typeof rejectBoardSchema>;
export type OfferDatesInput = z.infer<typeof offerDatesSchema>;
export type ConfirmScheduleInput = z.infer<typeof confirmScheduleSchema>;
