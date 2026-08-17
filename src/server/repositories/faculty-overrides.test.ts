/**
 * Faculty overrides against the mock repository.
 *
 * The rule worth protecting: overrides are applied on the *read* path, so the
 * HoD's picker and the submit validation cannot disagree about who is
 * selectable. The old portal filtered in the browser only.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createMockRepo, resetMockData } from './mock-sheets';
import { FIXTURE_ACCESS } from './fixtures';
import type { SessionUser } from '@shared/types';

const admin = FIXTURE_ACCESS[0] as SessionUser;
const mathsHod = FIXTURE_ACCESS[1] as SessionUser;

const DEPT = 'Physics';
const VISITING = {
  email: 'visiting.prof@example.edu',
  name: 'Prof. V. Iyer',
  campus: 'Brindavan',
};

describe('faculty overrides', () => {
  let repo: ReturnType<typeof createMockRepo>;

  beforeEach(() => {
    resetMockData();
    repo = createMockRepo();
  });

  it('hides an excluded member from listFaculty but keeps the Faculty row', async () => {
    const [first] = await repo.listBaseFaculty(DEPT);

    await repo.saveFacultyOverride(
      { ...first!, action: 'exclude' },
      admin,
    );

    const effective = await repo.listFaculty(DEPT);
    expect(effective.map((f) => f.email)).not.toContain(first!.email);

    const base = await repo.listBaseFaculty(DEPT);
    expect(base.map((f) => f.email)).toContain(first!.email);
  });

  it('surfaces an added member who has no Faculty row', async () => {
    await repo.saveFacultyOverride(
      { department: DEPT, ...VISITING, action: 'add' },
      admin,
    );

    const effective = await repo.listFaculty(DEPT);
    expect(effective.map((f) => f.email)).toContain(VISITING.email);
    expect(effective.find((f) => f.email === VISITING.email)?.department).toBe(DEPT);
  });

  it('upserts by (department, email) rather than stacking rows', async () => {
    const [first] = await repo.listBaseFaculty(DEPT);

    await repo.saveFacultyOverride(
      { ...first!, action: 'exclude' },
      admin,
    );
    await repo.saveFacultyOverride(
      { ...first!, campus: 'Anantapur', action: 'exclude' },
      admin,
    );

    const overrides = await repo.listFacultyOverrides(DEPT);
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.campus).toBe('Anantapur');
  });

  it('restores the default list when the override is deleted', async () => {
    const [first] = await repo.listBaseFaculty(DEPT);

    await repo.saveFacultyOverride(
      { ...first!, action: 'exclude' },
      admin,
    );
    await repo.deleteFacultyOverride(DEPT, first!.email, admin);

    expect((await repo.listFaculty(DEPT)).map((f) => f.email)).toContain(
      first!.email,
    );
    expect(await repo.listFacultyOverrides(DEPT)).toHaveLength(0);
  });

  it('treats deleting a missing override as a no-op', async () => {
    await expect(
      repo.deleteFacultyOverride(DEPT, 'nobody@example.edu', admin),
    ).resolves.toBeUndefined();
  });

  it('rejects adding someone who already has a Faculty row', async () => {
    const [first] = await repo.listBaseFaculty(DEPT);

    await expect(
      repo.saveFacultyOverride(
        { ...first!, action: 'add' },
        admin,
      ),
    ).rejects.toThrow(/already appears/);
  });

  it('rejects excluding someone with no Faculty row', async () => {
    await expect(
      repo.saveFacultyOverride(
        { department: DEPT, ...VISITING, action: 'exclude' },
        admin,
      ),
    ).rejects.toThrow(/no Faculty record/);
  });

  // The point of the whole feature: the server, not the UI, decides.
  it('refuses a nomination of an excluded faculty member', async () => {
    const board = await repo.getBoard('msc-mathematics-2026');
    const selectable = await repo.listFaculty('Mathematics');
    const [a, b] = selectable;

    await repo.saveFacultyOverride(
      { department: 'Mathematics', email: a!.email, name: a!.name, campus: a!.campus, action: 'exclude' },
      admin,
    );

    await expect(
      repo.submitConstitution(
        board!.boardId,
        mathsHod,
        [a!.email, b!.email],
        board!.version,
      ),
    ).rejects.toThrow(/not available for nomination/);
  });

  it('accepts a nomination of an admin-added faculty member', async () => {
    const board = await repo.getBoard('msc-mathematics-2026');

    await repo.saveFacultyOverride(
      { department: 'Mathematics', ...VISITING, action: 'add' },
      admin,
    );

    const [other] = (await repo.listFaculty('Mathematics')).filter(
      (f) => f.email !== VISITING.email,
    );

    const updated = await repo.submitConstitution(
      board!.boardId,
      mathsHod,
      [VISITING.email, other!.email],
      board!.version,
    );

    expect(updated.status).toBe('Submitted');
    expect(updated.members.map((m) => m.email)).toContain(VISITING.email);
  });

  it('applies the seeded Mathematics fixtures to the effective list', async () => {
    const effective = await repo.listFaculty('Mathematics');
    const emails = effective.map((f) => f.email);

    expect(emails).not.toContain('p.lakshmi@sssihl.edu.in'); // excluded
    expect(emails).toContain('s.anantharaman@sssihl.edu.in'); // added
  });

  it('fills the campus in from an existing record', async () => {
    expect(await repo.findCampus({ email: 'g.mohan@sssihl.edu.in' })).toBe(
      'Prasanthi Nilayam',
    );
    expect(await repo.findCampus({ name: 'Dr. N. Sridevi' })).toBe('Anantapur');
    expect(await repo.findCampus({ email: 'nobody@example.edu' })).toBeNull();
  });

  it('lists every department that has faculty', async () => {
    expect(await repo.listDepartments()).toEqual([
      'Chemistry',
      'Computer Science',
      'Mathematics',
      'Physics',
    ]);
  });
});
