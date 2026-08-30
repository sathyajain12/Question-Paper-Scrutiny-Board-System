/** Central query keys so mutations can invalidate precisely. */
import type { CheckType } from '@shared/constants/folder-spec';

export const queryKeys = {
  me: ['me'] as const,
  boards: ['boards'] as const,
  board: (boardId: string) => ['boards', boardId] as const,
  faculty: {
    departments: ['faculty', 'departments'] as const,
    overrides: (department: string) =>
      ['faculty', 'overrides', department] as const,
    campus: (name: string, email: string) =>
      ['faculty', 'campus', name, email] as const,
    audit: (department: string) => ['faculty', 'audit', department] as const,
  },
  check: (boardId: string, type: CheckType) => ['check', boardId, type] as const,
  catalog: {
    degrees: ['catalog', 'degrees'] as const,
    departments: (degree: string) => ['catalog', 'departments', degree] as const,
    programmes: (degree: string, department: string) =>
      ['catalog', 'programmes', degree, department] as const,
  },
} as const;
