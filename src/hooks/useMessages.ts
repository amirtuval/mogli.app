import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import type { MessageMeta } from '../types/models'

/**
 * Fetch messages for the given accounts and label.
 *
 * Issues one query **per account** in parallel so each account's messages
 * stream in independently — the first to finish renders immediately.
 */
export function useMessages(activeAccountIds: string[], selectedLabel: string) {
  const enabled = activeAccountIds.length > 0

  const queries = useQueries({
    queries: activeAccountIds.map((accountId) => ({
      queryKey: ['messages', accountId, selectedLabel],
      queryFn: () =>
        invoke<MessageMeta[]>('get_account_messages', {
          accountId,
          label: selectedLabel,
          pageToken: null,
        }),
      enabled,
    })),
  })

  const data = useMemo(() => {
    const merged: MessageMeta[] = []
    for (const q of queries) {
      if (q.data) merged.push(...q.data)
    }
    merged.sort((a, b) => b.date - a.date)
    return merged.length > 0 ? merged : undefined
  }, [queries])

  const isLoading = queries.some((q) => q.isLoading)

  return { data, isLoading }
}
