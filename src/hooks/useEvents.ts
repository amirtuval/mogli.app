import { useMemo } from 'react'
import { useQueries, keepPreviousData } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import type { CalEvent } from '../types/models'
import type { CalendarViewMode } from '../store/uiStore'

/**
 * Compute the time range (unix seconds) for the given view mode and dates.
 */
function computeRange(
  viewMode: CalendarViewMode,
  weekStart: string,
  viewDate: string,
  weekStartDay: number,
): { timeMin: number; timeMax: number } {
  if (viewMode === 'day') {
    const timeMin = Math.floor(new Date(viewDate + 'T00:00:00').getTime() / 1000)
    return { timeMin, timeMax: timeMin + 24 * 60 * 60 }
  }
  if (viewMode === 'month') {
    const [y, m] = viewDate.split('-').map(Number)
    // Start from the beginning of the week containing the 1st
    const first = new Date(y, m - 1, 1)
    const dayOfWeek = first.getDay()
    const diff = (dayOfWeek - weekStartDay + 7) % 7
    first.setDate(first.getDate() - diff)
    // End at the end of the week containing the last day
    const last = new Date(y, m, 0) // last day of month
    const lastDay = last.getDay()
    const endDiff = (6 - lastDay + weekStartDay) % 7
    last.setDate(last.getDate() + endDiff + 1)
    return {
      timeMin: Math.floor(first.getTime() / 1000),
      timeMax: Math.floor(last.getTime() / 1000),
    }
  }
  // Week mode (default)
  const timeMin = Math.floor(new Date(weekStart + 'T00:00:00').getTime() / 1000)
  return { timeMin, timeMax: timeMin + 7 * 24 * 60 * 60 }
}

/**
 * Fetch events for the given accounts and calendars within a time range.
 *
 * Adapts the range based on viewMode:
 * - `day`: single day from viewDate
 * - `week`: 7 days from weekStart (default)
 * - `month`: full calendar grid for the month of viewDate
 *
 * Issues one query **per account** in parallel so each account's events stream
 * in independently — the first to finish renders immediately while others are
 * still loading. Uses `keepPreviousData` so the previous period's events stay
 * visible during navigation.
 */
export function useEvents(
  accountIds: string[],
  calendarIds: string[],
  weekStart: string,
  viewMode: CalendarViewMode = 'week',
  viewDate: string = weekStart,
  weekStartDay: number = 1,
) {
  const { timeMin, timeMax } = computeRange(viewMode, weekStart, viewDate, weekStartDay)

  const enabled = accountIds.length > 0 && calendarIds.length > 0

  const queries = useQueries({
    queries: accountIds.map((accountId) => ({
      queryKey: ['events', accountId, calendarIds, viewMode, timeMin, timeMax],
      queryFn: () =>
        invoke<CalEvent[]>('get_account_events', {
          accountId,
          calendarIds,
          timeMin,
          timeMax,
        }),
      enabled,
      placeholderData: keepPreviousData,
      refetchInterval: 1000 * 60 * 2, // 2 minutes
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
