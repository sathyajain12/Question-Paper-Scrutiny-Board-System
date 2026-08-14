/**
 * Board lifecycle endpoints (docs/ARCHITECTURE.md §8).
 *
 * Note the shape: the client sends `boardId` only. Department, degree and
 * programme are resolved server-side from the board row, so a HoD cannot
 * act on another department by editing the payload.
 *
 * All mutations route through the BoardLock Durable Object, which serialises
 * writes and enforces the version check (§7).
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../env';
import { requireRole, requireBoardAccess } from '../middleware/auth';
import {
  approveBoardSchema,
  confirmScheduleSchema,
  offerDatesSchema,
  rejectBoardSchema,
  submitConstitutionSchema,
} from '@shared/schemas/board';

const boards = new Hono<Env>();

/** Role-scoped list + dashboard counts. */
boards.get('/', (c) => {
  void c;
  throw new Error('GET /api/boards not implemented'); // Phase 2
});

boards.get('/:boardId', requireBoardAccess, (c) => {
  void c;
  throw new Error('GET /api/boards/:boardId not implemented'); // Phase 2
});

// ── Mutations (Phase 3) ──────────────────────────────────────────────

boards.post(
  '/:boardId/constitution',
  requireBoardAccess,
  requireRole('hod'),
  zValidator('json', submitConstitutionSchema),
  (c) => {
    void c;
    throw new Error('submitConstitution not implemented');
  },
);

boards.post(
  '/:boardId/approve',
  requireRole('admin'),
  zValidator('json', approveBoardSchema),
  (c) => {
    void c;
    throw new Error('approve not implemented');
  },
);

boards.post(
  '/:boardId/reject',
  requireRole('admin'),
  zValidator('json', rejectBoardSchema),
  (c) => {
    void c;
    throw new Error('reject not implemented');
  },
);

boards.post(
  '/:boardId/dates',
  requireRole('admin'),
  zValidator('json', offerDatesSchema),
  (c) => {
    void c;
    throw new Error('offerDates not implemented');
  },
);

boards.post(
  '/:boardId/schedule',
  requireBoardAccess,
  requireRole('hod'),
  zValidator('json', confirmScheduleSchema),
  (c) => {
    void c;
    throw new Error('confirmSchedule not implemented');
  },
);

boards.post('/:boardId/appointment-email', requireRole('admin'), (c) => {
  void c;
  throw new Error('appointment email not implemented'); // Phase 5
});

export default boards;
