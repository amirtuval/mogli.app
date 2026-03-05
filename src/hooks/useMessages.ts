import { useQuery } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import type { MessageMeta } from '../types/models'

export function useMessages(activeAccountIds: string[], selectedLabel: string) {
  return useQuery<MessageMeta[]>({
    queryKey: ['messages', activeAccountIds, selectedLabel],
    queryFn: () =>
      invoke<MessageMeta[]>('get_messages', {
        accountIds: activeAccountIds,
        label: selectedLabel,
        pageToken: null,
      }),
    enabled: activeAccountIds.length > 0,
  })
}
