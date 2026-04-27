import { useQuery } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'

/**
 * Fetch the total inbox unread thread count across the given accounts.
 *
 * Uses the Gmail Labels API (server-side count) so the result is accurate
 * regardless of how many messages the message list has fetched.
 */
export function useUnreadCount(activeAccountIds: string[]) {
  return useQuery({
    queryKey: ['unreadCount', ...activeAccountIds],
    queryFn: () => invoke<number>('get_inbox_unread_count', { accountIds: activeAccountIds }),
    enabled: activeAccountIds.length > 0,
  })
}
