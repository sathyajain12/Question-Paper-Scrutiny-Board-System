/**
 * Folding the Access tab into one entry per person.
 *
 * This is what decides authority, so the tests are mostly about what it
 * refuses: a row with no role, a stray blank, a department the sheet repeats.
 */
import { describe, expect, it } from 'vitest';
import { foldAccessRows } from './sheets';

const HEADER = ['email', 'role', 'department'];

describe('foldAccessRows', () => {
  it('collapses a HoD’s repeated rows into one entry', () => {
    const folded = foldAccessRows([
      HEADER,
      ['hod.cs@sssihl.edu.in', 'hod', 'Computer Science'],
      ['hod.cs@sssihl.edu.in', 'hod', 'Physics'],
    ]);

    expect(Object.keys(folded)).toHaveLength(1);
    expect(folded['hod.cs@sssihl.edu.in']?.departments).toEqual([
      'Computer Science',
      'Physics',
    ]);
  });

  it('gives an admin no departments', () => {
    const folded = foldAccessRows([HEADER, ['coe@sssihl.edu.in', 'admin', '']]);
    expect(folded['coe@sssihl.edu.in']?.role).toBe('admin');
    expect(folded['coe@sssihl.edu.in']?.departments).toEqual([]);
  });

  it('lower-cases the email so lookup is case-insensitive', () => {
    const folded = foldAccessRows([HEADER, ['COE@SSSIHL.edu.in', 'admin', '']]);
    expect(folded['coe@sssihl.edu.in']).toBeDefined();
  });

  it('ignores a row with an unrecognised role', () => {
    const folded = foldAccessRows([
      HEADER,
      ['someone@sssihl.edu.in', 'principal', 'Chemistry'],
    ]);
    expect(folded).toEqual({});
  });

  it('ignores blank rows and rows with no email', () => {
    const folded = foldAccessRows([
      HEADER,
      ['', 'admin', ''],
      ['   ', 'hod', 'Maths'],
    ]);
    expect(folded).toEqual({});
  });

  it('does not repeat a department listed twice', () => {
    const folded = foldAccessRows([
      HEADER,
      ['hod.maths@sssihl.edu.in', 'hod', 'Mathematics'],
      ['hod.maths@sssihl.edu.in', 'hod', 'Mathematics'],
    ]);
    expect(folded['hod.maths@sssihl.edu.in']?.departments).toEqual(['Mathematics']);
  });

  it('tolerates header spelling drift', () => {
    // "E-mail" and "Role " are the kind of edit a person makes in the sheet
    // without thinking; neither should cost anyone their access.
    const folded = foldAccessRows([
      ['E-mail', 'Role ', 'Department'],
      ['viewer@sssihl.edu.in', 'viewer', 'Mathematics'],
    ]);
    expect(folded['viewer@sssihl.edu.in']?.role).toBe('viewer');
  });

  it('falls back to the email local part when there is no name column', () => {
    const folded = foldAccessRows([HEADER, ['coe@sssihl.edu.in', 'admin', '']]);
    expect(folded['coe@sssihl.edu.in']?.name).toBe('coe');
  });

  it('uses a name column when the sheet has one', () => {
    const folded = foldAccessRows([
      ['email', 'name', 'role', 'department'],
      ['coe@sssihl.edu.in', 'Controller of Examinations', 'admin', ''],
    ]);
    expect(folded['coe@sssihl.edu.in']?.name).toBe('Controller of Examinations');
  });

  it('returns nothing for an empty tab', () => {
    expect(foldAccessRows([])).toEqual({});
    expect(foldAccessRows([HEADER])).toEqual({});
  });
});
