import { useQuery } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import type { CalEvent } from '../types/models'

/**
 * Fetch events for the given accounts and calendars within a time range.
 * `weekStart` is an ISO date string (YYYY-MM-DD) for the Monday of the week.
 */
export function useEvents(accountIds: string[], calendarIds: string[], weekStart: string) {
  // Compute time range: Monday 00:00 UTC → Sunday 23:59:59 UTC
  const timeMin = Math.floor(new Date(weekStart + 'T00:00:00Z').getTime() / 1000)
  const timeMax = timeMin + 7 * 24 * 60 * 60

  return useQuery<CalEvent[]>({
    queryKey: ['events', accountIds, calendarIds, weekStart],
    queryFn: () =>
      invoke<CalEvent[]>('get_events', {
        accountIds,
        calendarIds,
        timeMin,
        timeMax,
      }),
    enabled: accountIds.length > 0 && calendarIds.length > 0,
  })
}
