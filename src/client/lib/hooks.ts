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
  SessionUser,
} from '@shared/types';
import type { CheckType } from '@shared/constants/folder-spec';
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
