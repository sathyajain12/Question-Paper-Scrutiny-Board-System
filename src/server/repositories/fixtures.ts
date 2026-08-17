/**
 * Development fixtures — shaped exactly like the real Sheets rows so the UI
 * is built against realistic data. Replaced wholesale by the live repository;
 * nothing outside repositories/ imports this.
 */
import type {
  BoardDetail,
  FacultyMember,
  FacultyOverride,
} from '@shared/types';

export const FIXTURE_FACULTY: FacultyMember[] = [
  { email: 'abc@sssihl.edu.in', name: 'Dr. R. Krishnan', campus: 'Prasanthi Nilayam', department: 'Mathematics' },
  { email: 'dbc@sssihl.edu.in', name: 'Dr. S. Venkataraman', campus: 'Prasanthi Nilayam', department: 'Mathematics' },
  { email: 'sce@sssihl.edu.in', name: 'Dr. A. Narayan', campus: 'Brindavan', department: 'Mathematics' },
  { email: 'fdc@sssihl.edu.in', name: 'Dr. P. Lakshmi', campus: 'Anantapur', department: 'Mathematics' },
  { email: 'qqn@sssihl.edu.in', name: 'Dr. K. Subramanian', campus: 'Prasanthi Nilayam', department: 'Mathematics' },

  { email: 'v.ramesh@sssihl.edu.in', name: 'Dr. V. Ramesh', campus: 'Prasanthi Nilayam', department: 'Physics' },
  { email: 'g.mohan@sssihl.edu.in', name: 'Dr. G. Mohan', campus: 'Prasanthi Nilayam', department: 'Physics' },
  { email: 'n.sridevi@sssihl.edu.in', name: 'Dr. N. Sridevi', campus: 'Anantapur', department: 'Physics' },
  { email: 'b.raghavan@sssihl.edu.in', name: 'Dr. B. Raghavan', campus: 'Brindavan', department: 'Physics' },

  { email: 'm.anand@sssihl.edu.in', name: 'Dr. M. Anand', campus: 'Prasanthi Nilayam', department: 'Computer Science' },
  { email: 't.suresh@sssihl.edu.in', name: 'Dr. T. Suresh', campus: 'Prasanthi Nilayam', department: 'Computer Science' },
  { email: 'j.padma@sssihl.edu.in', name: 'Dr. J. Padma', campus: 'Anantapur', department: 'Computer Science' },
  { email: 'h.gopal@sssihl.edu.in', name: 'Dr. H. Gopal', campus: 'Brindavan', department: 'Computer Science' },

  { email: 'd.shanthi@sssihl.edu.in', name: 'Dr. D. Shanthi', campus: 'Anantapur', department: 'Chemistry' },
  { email: 'l.prakash@sssihl.edu.in', name: 'Dr. L. Prakash', campus: 'Prasanthi Nilayam', department: 'Chemistry' },
  { email: 'c.balaji@sssihl.edu.in', name: 'Dr. C. Balaji', campus: 'Prasanthi Nilayam', department: 'Chemistry' },
];

function facultyByEmail(email: string): FacultyMember {
  const found = FIXTURE_FACULTY.find((f) => f.email === email);
  if (!found) throw new Error(`Fixture faculty not found: ${email}`);
  return found;
}

const mathCourses = [
  { courseCode: 'MTH401', courseTitle: 'Real Analysis', semester: 'I', driveFolderId: 'fld-mth401' },
  { courseCode: 'MTH402', courseTitle: 'Linear Algebra', semester: 'I', driveFolderId: 'fld-mth402' },
  { courseCode: 'MTH403', courseTitle: 'Topology', semester: 'I', driveFolderId: 'fld-mth403' },
  { courseCode: 'MTH404', courseTitle: 'Complex Analysis', semester: 'II', driveFolderId: 'fld-mth404' },
  { courseCode: 'MTH405', courseTitle: 'Numerical Methods', semester: 'II', driveFolderId: 'fld-mth405' },
];

const physicsCourses = [
  { courseCode: 'PHY401', courseTitle: 'Classical Mechanics', semester: 'I', driveFolderId: 'fld-phy401' },
  { courseCode: 'PHY402', courseTitle: 'Quantum Mechanics', semester: 'I', driveFolderId: 'fld-phy402' },
  { courseCode: 'PHY403', courseTitle: 'Electrodynamics', semester: 'II', driveFolderId: 'fld-phy403' },
  { courseCode: 'PHY404', courseTitle: 'Statistical Physics', semester: 'II', driveFolderId: 'fld-phy404' },
];

const csCourses = [
  { courseCode: 'CSC501', courseTitle: 'Advanced Algorithms', semester: 'I', driveFolderId: 'fld-csc501' },
  { courseCode: 'CSC502', courseTitle: 'Machine Learning', semester: 'I', driveFolderId: 'fld-csc502' },
  { courseCode: 'CSC503', courseTitle: 'Distributed Systems', semester: 'II', driveFolderId: 'fld-csc503' },
  { courseCode: 'CSC504', courseTitle: 'Compiler Design', semester: 'II', driveFolderId: 'fld-csc504' },
  { courseCode: 'CSC505', courseTitle: 'Computer Networks', semester: 'II', driveFolderId: 'fld-csc505' },
  { courseCode: 'CSC506', courseTitle: 'Information Security', semester: 'II', driveFolderId: 'fld-csc506' },
];

const chemCourses = [
  { courseCode: 'CHE401', courseTitle: 'Organic Chemistry', semester: 'I', driveFolderId: 'fld-che401' },
  { courseCode: 'CHE402', courseTitle: 'Physical Chemistry', semester: 'I', driveFolderId: 'fld-che402' },
  { courseCode: 'CHE403', courseTitle: 'Inorganic Chemistry', semester: 'II', driveFolderId: 'fld-che403' },
];

/**
 * One board per status, so every UI state is reachable in development
 * without clicking through the whole workflow first.
 */
export const FIXTURE_BOARDS: BoardDetail[] = [
  {
    boardId: 'msc-mathematics-2026',
    degree: 'Master of Science',
    degreeShort: 'M.Sc.',
    department: 'Mathematics',
    programme: 'M.Sc. Mathematics',
    status: 'NotSubmitted',
    courseCount: mathCourses.length,
    courses: mathCourses,
    chairperson: null,
    members: [],
    availableDates: [],
    sessionTime: null,
    submittedBy: null,
    submittedAt: null,
    actionBy: null,
    actionAt: null,
    rejectionReason: null,
    version: 1,
  },
  {
    boardId: 'msc-physics-2026',
    degree: 'Master of Science',
    degreeShort: 'M.Sc.',
    department: 'Physics',
    programme: 'M.Sc. Physics',
    status: 'Submitted',
    courseCount: physicsCourses.length,
    courses: physicsCourses,
    chairperson: facultyByEmail('v.ramesh@sssihl.edu.in'),
    members: [
      facultyByEmail('g.mohan@sssihl.edu.in'),
      facultyByEmail('n.sridevi@sssihl.edu.in'),
    ],
    availableDates: [],
    sessionTime: null,
    submittedBy: 'v.ramesh@sssihl.edu.in',
    submittedAt: '2026-08-10T09:24:00Z',
    actionBy: null,
    actionAt: null,
    rejectionReason: null,
    version: 3,
  },
  {
    boardId: 'mtech-computer-science-2026',
    degree: 'Master of Technology',
    degreeShort: 'M.Tech.',
    department: 'Computer Science',
    programme: 'M.Tech. Computer Science',
    status: 'Approved',
    courseCount: csCourses.length,
    courses: csCourses,
    chairperson: facultyByEmail('m.anand@sssihl.edu.in'),
    members: [
      facultyByEmail('t.suresh@sssihl.edu.in'),
      facultyByEmail('j.padma@sssihl.edu.in'),
      facultyByEmail('h.gopal@sssihl.edu.in'),
    ],
    availableDates: [
      { date: '2026-09-14', isSelected: false },
      { date: '2026-09-15', isSelected: false },
      { date: '2026-09-18', isSelected: false },
    ],
    sessionTime: null,
    submittedBy: 'm.anand@sssihl.edu.in',
    submittedAt: '2026-08-06T11:02:00Z',
    actionBy: 'coe@sssihl.edu.in',
    actionAt: '2026-08-08T15:40:00Z',
    rejectionReason: null,
    version: 5,
  },
  {
    boardId: 'msc-chemistry-2026',
    degree: 'Master of Science',
    degreeShort: 'M.Sc.',
    department: 'Chemistry',
    programme: 'M.Sc. Chemistry',
    status: 'Rejected',
    courseCount: chemCourses.length,
    courses: chemCourses,
    chairperson: facultyByEmail('d.shanthi@sssihl.edu.in'),
    members: [facultyByEmail('l.prakash@sssihl.edu.in')],
    availableDates: [],
    sessionTime: null,
    submittedBy: 'd.shanthi@sssihl.edu.in',
    submittedAt: '2026-08-05T10:15:00Z',
    actionBy: 'coe@sssihl.edu.in',
    actionAt: '2026-08-07T09:00:00Z',
    rejectionReason:
      'Only one faculty member nominated. The Board requires two or three senior faculty per academic programme.',
    version: 4,
  },
  {
    boardId: 'bsc-mathematics-2026',
    degree: 'Bachelor of Science',
    degreeShort: 'B.Sc.',
    department: 'Mathematics',
    programme: 'B.Sc. Mathematics (Hons.)',
    status: 'Locked',
    courseCount: 4,
    courses: mathCourses.slice(0, 4),
    chairperson: facultyByEmail('r.krishnan@sssihl.edu.in'),
    members: [
      facultyByEmail('s.venkataraman@sssihl.edu.in'),
      facultyByEmail('a.narayan@sssihl.edu.in'),
    ],
    availableDates: [
      { date: '2026-09-02', isSelected: true },
      { date: '2026-09-03', isSelected: true },
      { date: '2026-09-05', isSelected: false },
    ],
    sessionTime: '9:30 AM',
    submittedBy: 'r.krishnan@sssihl.edu.in',
    submittedAt: '2026-07-28T08:30:00Z',
    actionBy: 'coe@sssihl.edu.in',
    actionAt: '2026-07-30T12:00:00Z',
    rejectionReason: null,
    version: 8,
  },
];

/**
 * One of each override kind, on the Mathematics board that starts in
 * NotSubmitted — so the effect on the HoD's picker is visible in development
 * without configuring anything first.
 */
export const FIXTURE_FACULTY_OVERRIDES: FacultyOverride[] = [
  {
    department: 'Mathematics',
    email: 'p.lakshmi@sssihl.edu.in',
    name: 'Dr. P. Lakshmi',
    campus: 'Anantapur',
    action: 'exclude',
    createdBy: 'coe@sssihl.edu.in',
    createdAt: '2026-08-11T06:20:00Z',
  },
  {
    department: 'Mathematics',
    email: 's.anantharaman@sssihl.edu.in',
    name: 'Dr. S. Anantharaman',
    campus: 'Prasanthi Nilayam',
    action: 'add',
    createdBy: 'coe@sssihl.edu.in',
    createdAt: '2026-08-12T04:45:00Z',
  },
];

/** Who can sign in during development. Mirrors the `Access` tab. */
export const FIXTURE_ACCESS = [
  { email: 'coe@sssihl.edu.in', name: 'Controller of Examinations', role: 'admin' as const, departments: [] },
  {
    email: 'hod.maths@sssihl.edu.in',
    name: 'Dr. R. Krishnan',
    role: 'hod' as const,
    departments: ['Mathematics'],
  },
  {
    email: 'hod.cs@sssihl.edu.in',
    name: 'Dr. M. Anand',
    role: 'hod' as const,
    // A HoD holding two departments — exercises the multi-board layout.
    departments: ['Computer Science', 'Physics'],
  },
];
