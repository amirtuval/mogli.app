import { useMemo } from 'react'
import { useQueries, keepPreviousData } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import type { CalEvent } from '../types/models'

/**
 * Fetch events for the given accounts and calendars within a time range.
 * `weekStart` is an ISO date string (YYYY-MM-DD) for the first day of the week.
 *
 * Issues one query **per account** in parallel so each account's events stream
 * in independently — the first to finish renders immediately while others are
 * still loading. Uses `keepPreviousData` so the previous week's events stay
 * visible during navigation.
 */
export function useEvents(accountIds: string[], calendarIds: string[], weekStart: string) {
  const timeMin = Math.floor(new Date(weekStart + 'T00:00:00Z').getTime() / 1000)
  const timeMax = timeMin + 7 * 24 * 60 * 60

  const enabled = accountIds.length > 0 && calendarIds.length > 0

  const queries = useQueries({
    queries: accountIds.map((accountId) => ({
      queryKey: ['events', accountId, calendarIds, weekStart],
      queryFn: () =>
        invoke<CalEvent[]>('get_account_events', {
          accountId,
          calendarIds,
          timeMin,
          timeMax,
        }),
      enabled,
      placeholderData: keepPreviousData,
    })),
  })

  // Merge all per-account results into a single sorted array
  const data = useMemo(() => {
    const merged: CalEvent[] = []
    for (const q of queries) {
      if (q.data) merged.push(...q.data)
    }
    merged.sort((a, b) => a.start - b.start)
    return merged.length > 0 ? merged : undefined
  }, [queries])

  const isLoading = queries.some((q) => q.isLoading)
  const isFetching = queries.some((q) => q.isFetching)

  return { data, isLoading, isFetching }
}
