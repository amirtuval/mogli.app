import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import type { Account } from '../types/models'

export function useAccounts() {
  return useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => invoke<Account[]>('list_accounts'),
  })
}

export function useAddAccount() {
  const queryClient = useQueryClient()

  return useMutation<Account, string>({
    mutationFn: () => invoke<Account>('add_account'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useRemoveAccount() {
  const queryClient = useQueryClient()

  return useMutation<void, string, string>({
    mutationFn: (accountId: string) => invoke<void>('remove_account', { accountId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['calendars'] })
    },
  })
}

export function useReauthAccount() {
  const queryClient = useQueryClient()

  return useMutation<void, string, string>({
    mutationFn: (accountId: string) => invoke<void>('reauth_account', { accountId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}
