import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import type { Calendar } from '../types/models'

export function useCalendars(accountId: string | undefined) {
  return useQuery<Calendar[]>({
    queryKey: ['calendars', accountId],
    queryFn: () => invoke<Calendar[]>('list_calendars', { accountId }),
    enabled: !!accountId,
  })
}

export function useAllCalendars(accountIds: string[]) {
  return useQuery<Calendar[]>({
    queryKey: ['calendars', 'all', accountIds],
    queryFn: async () => {
      const results = await Promise.allSettled(
        accountIds.map((accountId) => invoke<Calendar[]>('list_calendars', { accountId })),
      )
      return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    },
    enabled: accountIds.length > 0,
    refetchInterval: 1000 * 60 * 2, // 2 minutes
  })
}

export function useSetCalendarEnabled() {
  const queryClient = useQueryClient()

  return useMutation<
    void,
    string,
    { accountId: string; calendarId: string; enabled: boolean },
    { previous: [readonly unknown[], Calendar[] | undefined][] }
  >({
    mutationFn: ({ accountId, calendarId, enabled }) =>
      invoke<void>('set_calendar_enabled', { accountId, calendarId, enabled }),
    onMutate: async ({ accountId, calendarId, enabled }) => {
      // Cancel any in-flight calendar queries so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['calendars'] })

      // Snapshot current data for rollback
      const previous = queryClient.getQueriesData<Calendar[]>({ queryKey: ['calendars'] })

      // Optimistically update all calendar query caches
      queryClient.setQueriesData<Calendar[]>({ queryKey: ['calendars'] }, (old) =>
        old?.map((cal) =>
          cal.account_id === accountId && cal.id === calendarId ? { ...cal, enabled } : cal,
        ),
      )

      return { previous }
    },
    onError: (_err, _vars, context) => {
      // Rollback on failure
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      // Refetch calendars to ensure consistency, and refetch events
      // so disabled calendars' events disappear
      queryClient.invalidateQueries({ queryKey: ['calendars'] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
  })
}
