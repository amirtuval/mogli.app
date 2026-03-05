import { useQuery } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import type { Thread } from '../types/models'

export function useThread(accountId: string | null, threadId: string | null) {
  return useQuery<Thread>({
    queryKey: ['thread', accountId, threadId],
    queryFn: () => invoke<Thread>('get_thread', { accountId, threadId }),
    enabled: !!accountId && !!threadId,
  })
}
