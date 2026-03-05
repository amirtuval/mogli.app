import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'ultraDark'
export type AppView = 'mail' | 'calendar'

interface UIState {
  theme: Theme
  activeView: AppView
  activeAccounts: string[] // account IDs that are toggled on
  selectedThreadId: string | null
  selectedLabel: string

  setTheme: (theme: Theme) => void
  setActiveView: (view: AppView) => void
  toggleAccount: (accountId: string) => void
  setActiveAccounts: (accountIds: string[]) => void
  setSelectedThreadId: (threadId: string | null) => void
  setSelectedLabel: (label: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'dark',
  activeView: 'mail',
  activeAccounts: [],
  selectedThreadId: null,
  selectedLabel: 'INBOX',

  setTheme: (theme) => set({ theme }),
  setActiveView: (view) => set({ activeView: view }),
  toggleAccount: (accountId) =>
    set((state) => ({
      activeAccounts: state.activeAccounts.includes(accountId)
        ? state.activeAccounts.filter((id) => id !== accountId)
        : [...state.activeAccounts, accountId],
    })),
  setActiveAccounts: (accountIds) => set({ activeAccounts: accountIds }),
  setSelectedThreadId: (threadId) => set({ selectedThreadId: threadId }),
  setSelectedLabel: (label) => set({ selectedLabel: label }),
}))
