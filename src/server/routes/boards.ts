/**
 * Board lifecycle endpoints (docs/ARCHITECTURE.md §8).
 *
 * Note the shape: the client sends `boardId` only. Department, degree and
 * programme are resolved server-side from the board row, so a HoD cannot
 * act on another department by editing the payload.
 *
 * Phase 3 will route the mutations through the BoardLock Durable Object;
 * today the repository performs the version check directly.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../env';
import { requireRole, requireBoardAccess } from '../middleware/auth';
import { getRepo } from '../repositories';
import {
  approveBoardSchema,
  confirmScheduleSchema,
  offerDatesSchema,
  rejectBoardSchema,
  submitConstitutionSchema,
} from '@shared/schemas/board';

const boards = new Hono<Env>();

/** Role-scoped list + dashboard counts, in one round trip. */
boards.get('/', async (c) => {
  const user = c.get('user');
  const repo = await getRepo(c.env);

  const [items, counts] = await Promise.all([
    repo.listBoards(user),
    repo.countByStatus(user),
  ]);

  return c.json({ boards: items, counts });
});

boards.get('/:boardId', requireBoardAccess, async (c) => {
  const repo = await getRepo(c.env);
  const board = await repo.getBoard(c.req.param('boardId'));
  if (!board) return c.json({ error: 'Board not found' }, 404);

  // The picker needs the department's faculty alongside the board.
  const faculty = await repo.listFaculty(board.department);
  return c.json({ board, faculty });
});

// ── Mutations ────────────────────────────────────────────────────────

boards.post(
  '/:boardId/constitution',
  requireBoardAccess,
  requireRole('hod'),
  zValidator('json', submitConstitutionSchema),
  async (c) => {
    const { facultyEmails, version } = c.req.valid('json');
    const repo = await getRepo(c.env);
    const board = await repo.submitConstitution(
      c.req.param('boardId'),
      c.get('user'),
      facultyEmails,
      version,
    );
    return c.json({ board });
  },
);

boards.post(
  '/:boardId/approve',
  requireRole('admin'),
  zValidator('json', approveBoardSchema),
  async (c) => {
    const repo = await getRepo(c.env);
    const board = await repo.approve(
      c.req.param('boardId'),
      c.get('user'),
      c.req.valid('json').version,
    );
    return c.json({ board });
  },
);

boards.post(
  '/:boardId/reject',
  requireRole('admin'),
  zValidator('json', rejectBoardSchema),
  async (c) => {
    const { reason, version } = c.req.valid('json');
    const repo = await getRepo(c.env);
    const board = await repo.reject(
      c.req.param('boardId'),
      c.get('user'),
      reason,
      version,
    );
    return c.json({ board });
  },
);

boards.post(
  '/:boardId/dates',
  requireRole('admin'),
  zValidator('json', offerDatesSchema),
  async (c) => {
    const { dates, version } = c.req.valid('json');
    const repo = await getRepo(c.env);
    const board = await repo.offerDates(
      c.req.param('boardId'),
      c.get('user'),
      dates,
      version,
    );
    return c.json({ board });
  },
);

boards.post(
  '/:boardId/schedule',
  requireBoardAccess,
  requireRole('hod'),
  zValidator('json', confirmScheduleSchema),
  async (c) => {
    const { dates, time, version } = c.req.valid('json');
    const repo = await getRepo(c.env);
    const board = await repo.confirmSchedule(
      c.req.param('boardId'),
      c.get('user'),
      dates,
      time,
      version,
    );
    return c.json({ board });
  },
);

boards.post('/:boardId/appointment-email', requireRole('admin'), (c) => {
  void c;
  throw new Error('appointment email not implemented'); // Phase 5
});

export default boards;
