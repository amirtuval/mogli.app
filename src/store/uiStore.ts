import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export type Theme = 'light' | 'dark' | 'ultraDark'
export type AppView = 'mail' | 'calendar'

const VALID_THEMES: Theme[] = ['light', 'dark', 'ultraDark']

/** Get the Monday of the week containing the given date (ISO date string YYYY-MM-DD). */
export function getMonday(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  // getDay(): 0=Sun, 1=Mon, … 6=Sat → shift so Monday=0
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

interface UIState {
  theme: Theme
  activeView: AppView
  activeAccounts: string[] // account IDs that are toggled on
  selectedThreadId: string | null
  selectedLabel: string
  calendarWeekStart: string // ISO date string of the Monday

  setTheme: (theme: Theme) => void
  setActiveView: (view: AppView) => void
  toggleAccount: (accountId: string) => void
  setActiveAccounts: (accountIds: string[]) => void
  setSelectedThreadId: (threadId: string | null) => void
  setSelectedLabel: (label: string) => void
  setCalendarWeekStart: (monday: string) => void
  navigateWeek: (direction: -1 | 1) => void
  goToToday: () => void
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'dark',
  activeView: 'mail',
  activeAccounts: [],
  selectedThreadId: null,
  selectedLabel: 'INBOX',
  calendarWeekStart: getMonday(new Date()),

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
  setCalendarWeekStart: (monday) => set({ calendarWeekStart: monday }),
  navigateWeek: (direction) =>
    set((state) => {
      const [y, m, d] = state.calendarWeekStart.split('-').map(Number)
      const date = new Date(Date.UTC(y, m - 1, d + direction * 7))
      const iso = date.toISOString().slice(0, 10)
      return { calendarWeekStart: iso }
    }),
  goToToday: () => set({ calendarWeekStart: getMonday(new Date()) }),
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
