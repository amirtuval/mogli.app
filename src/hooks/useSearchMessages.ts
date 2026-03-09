import { useQuery } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import type { MessageMeta } from '../types/models'

/**
 * Search messages across active accounts using Gmail's q parameter.
 * Only fires when searchQuery is non-empty.
 */
export function useSearchMessages(activeAccountIds: string[], searchQuery: string) {
  const enabled = activeAccountIds.length > 0 && searchQuery.length > 0

  const { data, isLoading } = useQuery({
    queryKey: ['search', searchQuery, activeAccountIds],
    queryFn: () =>
      invoke<MessageMeta[]>('search_messages', {
        accountIds: activeAccountIds,
        query: searchQuery,
      }),
    enabled,
  })

  return { data, isLoading: enabled && isLoading }
}
