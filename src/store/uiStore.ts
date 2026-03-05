import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export type Theme = 'light' | 'dark' | 'ultraDark'
export type AppView = 'mail' | 'calendar'

const VALID_THEMES: Theme[] = ['light', 'dark', 'ultraDark']

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

  setTheme: (theme) => {
    set({ theme })
    // Persist to disk (fire-and-forget)
    invoke('save_theme', { theme }).catch((e: unknown) =>
      console.warn('Failed to persist theme:', e),
    )
  },
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

/** Load the persisted theme from the backend store and apply it. */
export async function initTheme(): Promise<void> {
  try {
    const saved = await invoke<string>('load_theme')
    if (VALID_THEMES.includes(saved as Theme)) {
      useUIStore.getState().setTheme(saved as Theme)
    }
  } catch {
    // First launch or store unavailable — keep default
  }
}
