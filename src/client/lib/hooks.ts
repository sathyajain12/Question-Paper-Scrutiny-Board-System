/**
 * Server-state hooks. Every mutation invalidates the affected board plus the
 * list, so the admin dashboard counts stay honest after an approval.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BoardDetail,
  BoardSummary,
  CheckResult,
  DashboardCounts,
  FacultyMember,
  FacultyOverride,
  SessionUser,
} from '@shared/types';
import type { CheckType } from '@shared/constants/folder-spec';
import type { SaveFacultyOverrideInput } from '@shared/schemas/faculty';
import { api } from './api';
import { queryKeys } from './query-keys';

interface BoardListResponse {
  boards: BoardSummary[];
  counts: DashboardCounts;
}

interface BoardDetailResponse {
  board: BoardDetail;
  faculty: FacultyMember[];
}

/** One department's override picture — see server/routes/faculty.ts. */
export interface FacultyOverridesResponse {
  department: string;
  /** Straight from the Faculty tab, overrides not applied. */
  baseFaculty: FacultyMember[];
  overrides: FacultyOverride[];
  /** What HoDs in this department currently see in their picker. */
  effective: FacultyMember[];
}

export function useSession() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.get<SessionUser>('/me'),
    staleTime: Infinity,
    retry: false,
  });
}

export function useBoards() {
  return useQuery({
    queryKey: queryKeys.boards,
    queryFn: () => api.get<BoardListResponse>('/boards'),
  });
}

export function useBoard(boardId: string | null) {
  return useQuery({
    queryKey: queryKeys.board(boardId ?? ''),
    queryFn: () => api.get<BoardDetailResponse>(`/boards/${boardId}`),
    enabled: Boolean(boardId),
  });
}

/**
 * Drive checks are slow even against real Drive, so they run only when the
 * user asks — `enabled` stays false until a board is chosen.
 */
export function useCheck(boardId: string | null, type: CheckType) {
  return useQuery({
    queryKey: queryKeys.check(boardId ?? '', type),
    queryFn: () =>
      api.get<CheckResult>(`/checks/${type}?boardId=${encodeURIComponent(boardId!)}`),
    enabled: Boolean(boardId),
    staleTime: 60_000,
  });
}

// ── Faculty overrides (admin) ────────────────────────────────────────

export function useFacultyDepartments() {
  return useQuery({
    queryKey: queryKeys.faculty.departments,
    queryFn: () => api.get<{ departments: string[] }>('/faculty/departments'),
    staleTime: 15 * 60_000, // Near-static, same as the catalogue cache.
  });
}

export function useFacultyOverrides(department: string | null) {
  return useQuery({
    queryKey: queryKeys.faculty.overrides(department ?? ''),
    queryFn: () =>
      api.get<FacultyOverridesResponse>(
        `/faculty/overrides?department=${encodeURIComponent(department!)}`,
      ),
    enabled: Boolean(department),
  });
}

/**
 * Campus autofill for the add-faculty form. Disabled until the caller has
 * something to look up, so typing doesn't fire a request per keystroke.
 */
export function useCampusLookup(name: string, email: string) {
  return useQuery({
    queryKey: queryKeys.faculty.campus(name, email),
    queryFn: () => {
      const params = new URLSearchParams();
      if (name) params.set('name', name);
      if (email) params.set('email', email);
      return api.get<{ campus: string | null }>(`/faculty/campus?${params}`);
    },
    enabled: Boolean(name || email),
    staleTime: Infinity,
  });
}

/**
 * Both override mutations return the fresh department snapshot, so we seed the
 * cache with it instead of refetching. Board queries are invalidated too:
 * `listFaculty` applies overrides, so a HoD's picker changes as a result.
 */
function useOverrideMutation<TInput>(
  mutationFn: (input: TInput) => Promise<FacultyOverridesResponse>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (snapshot) => {
      queryClient.setQueryData(
        queryKeys.faculty.overrides(snapshot.department),
        snapshot,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
    },
  });
}

export const useSaveFacultyOverride = () =>
  useOverrideMutation((input: SaveFacultyOverrideInput) =>
    api.post<FacultyOverridesResponse>('/faculty/overrides', input),
  );

export const useDeleteFacultyOverride = () =>
  useOverrideMutation((input: { department: string; email: string }) =>
    api.del<FacultyOverridesResponse>(
      `/faculty/overrides?department=${encodeURIComponent(input.department)}&email=${encodeURIComponent(input.email)}`,
    ),
  );

/**
 * Shared mutation wiring. On success we refresh both the detail and the list;
 * on a 409 the caller surfaces "someone else changed this" and the refetch
 * hands the user the current version (docs §7).
 */
function useBoardMutation<TInput>(
  boardId: string,
  path: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: TInput) =>
      api.post<{ board: BoardDetail }>(`/boards/${boardId}/${path}`, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
    },
  });
}

export const useSubmitConstitution = (boardId: string) =>
  useBoardMutation<{ facultyEmails: string[]; version: number }>(
    boardId,
    'constitution',
  );

export const useApproveBoard = (boardId: string) =>
  useBoardMutation<{ version: number }>(boardId, 'approve');

export const useRejectBoard = (boardId: string) =>
  useBoardMutation<{ reason: string; version: number }>(boardId, 'reject');

export const useOfferDates = (boardId: string) =>
  useBoardMutation<{ dates: string[]; version: number }>(boardId, 'dates');

export const useConfirmSchedule = (boardId: string) =>
  useBoardMutation<{ dates: string[]; time: string; version: number }>(
    boardId,
    'schedule',
  );
