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
      const results = await Promise.all(
        accountIds.map((accountId) => invoke<Calendar[]>('list_calendars', { accountId })),
      )
      return results.flat()
    },
    enabled: accountIds.length > 0,
  })
}

export function useSetCalendarEnabled() {
  const queryClient = useQueryClient()

  return useMutation<void, string, { accountId: string; calendarId: string; enabled: boolean }>({
    mutationFn: ({ accountId, calendarId, enabled }) =>
      invoke<void>('set_calendar_enabled', { accountId, calendarId, enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendars'] })
    },
  })
}
