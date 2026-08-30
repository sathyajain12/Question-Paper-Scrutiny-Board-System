/**
 * Faculty overrides — the admin-only screen for adjusting which faculty a HoD
 * may nominate (visiting staff, ward conflicts, people with no Faculty row).
 *
 * Every response returns the whole department snapshot: the raw Faculty rows,
 * the overrides, and the resulting list the HoD sees. The old portal made the
 * browser derive that third list by cross-referencing two tables, which is
 * how the UI and the server could disagree about who was selectable.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../env';
import { requireRole } from '../middleware/auth';
import { getRepo } from '../repositories';
import type { BoardRepo } from '../repositories';
import {
  activeNominationsQuerySchema,
  campusLookupSchema,
  departmentQuerySchema,
  deleteFacultyOverrideSchema,
  saveFacultyOverrideSchema,
} from '@shared/schemas/faculty';

const faculty = new Hono<Env>();

// The whole surface is admin-only: overrides change what every HoD in the
// department can nominate.
faculty.use('*', requireRole('admin'));

/** One department's full picture, in a single round trip. */
async function snapshot(repo: BoardRepo, department: string) {
  const [baseFaculty, overrides, effective] = await Promise.all([
    repo.listBaseFaculty(department),
    repo.listFacultyOverrides(department),
    repo.listFaculty(department),
  ]);

  return { department, baseFaculty, overrides, effective };
}

faculty.get('/departments', async (c) => {
  const repo = await getRepo(c.env);
  return c.json({ departments: await repo.listDepartments() });
});

faculty.get('/campus', zValidator('query', campusLookupSchema), async (c) => {
  const repo = await getRepo(c.env);
  return c.json({ campus: await repo.findCampus(c.req.valid('query')) });
});

faculty.get(
  '/overrides',
  zValidator('query', departmentQuerySchema),
  async (c) => {
    const repo = await getRepo(c.env);
    return c.json(await snapshot(repo, c.req.valid('query').department));
  },
);

faculty.post(
  '/overrides',
  zValidator('json', saveFacultyOverrideSchema),
  async (c) => {
    const input = c.req.valid('json');
    const repo = await getRepo(c.env);

    await repo.saveFacultyOverride(
      { ...input, campus: input.campus ?? '' },
      c.get('user'),
    );

    return c.json(await snapshot(repo, input.department));
  },
);

faculty.delete(
  '/overrides',
  zValidator('query', deleteFacultyOverrideSchema),
  async (c) => {
    const { department, email } = c.req.valid('query');
    const repo = await getRepo(c.env);

    await repo.deleteFacultyOverride(department, email, c.get('user'));

    return c.json(await snapshot(repo, department));
  },
);

/** Heads-up before an admin excludes someone already nominated somewhere. */
faculty.get(
  '/nominations',
  zValidator('query', activeNominationsQuerySchema),
  async (c) => {
    const { department, email } = c.req.valid('query');
    const repo = await getRepo(c.env);
    return c.json({ nominations: await repo.findActiveNominations(department, email) });
  },
);

/** Full override history for a department, including removed overrides. */
faculty.get(
  '/audit',
  zValidator('query', departmentQuerySchema),
  async (c) => {
    const repo = await getRepo(c.env);
    return c.json({ history: await repo.listFacultyAuditLog(c.req.valid('query').department) });
  },
);

export default faculty;
