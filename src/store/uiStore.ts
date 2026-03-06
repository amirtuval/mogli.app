import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export type Theme = 'light' | 'dark' | 'ultraDark'
export type AppView = 'mail' | 'calendar'

/** 0 = Sunday, 1 = Monday */
export type WeekStartDay = 0 | 1

const VALID_THEMES: Theme[] = ['light', 'dark', 'ultraDark']

/** Detect the locale's first day of week. Returns 0 (Sun) or 1 (Mon). */
function detectWeekStartDay(): WeekStartDay {
  try {
    // Intl.Locale.prototype.weekInfo is available in modern browsers
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      weekInfo?: { firstDay: number }
      getWeekInfo?: () => { firstDay: number }
    }
    const info = locale.weekInfo ?? locale.getWeekInfo?.()
    if (info) {
      // weekInfo.firstDay: 1=Mon … 7=Sun
      return info.firstDay === 7 ? 0 : 1
    }
  } catch {
    // Fallback
  }
  // Default to Monday (ISO standard)
  return 1
}

/**
 * Get the first day of the week containing the given date.
 * `weekStartDay`: 0 = Sunday, 1 = Monday.
 * Returns an ISO date string YYYY-MM-DD.
 */
export function getWeekStart(date: Date, weekStartDay: WeekStartDay = 1): string {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun … 6=Sat
  const diff = (day - weekStartDay + 7) % 7
  d.setDate(d.getDate() - diff)
  return d.toISOString().slice(0, 10)
}

/** @deprecated Use getWeekStart instead */
export const getMonday = (date: Date): string => getWeekStart(date, 1)

interface UIState {
  theme: Theme
  activeView: AppView
  activeAccounts: string[] // account IDs that are toggled on
  selectedThreadId: string | null
  selectedLabel: string
  calendarWeekStart: string // ISO date string of the week's first day
  weekStartDay: WeekStartDay // 0 = Sunday, 1 = Monday

  setTheme: (theme: Theme) => void
  setActiveView: (view: AppView) => void
  toggleAccount: (accountId: string) => void
  setActiveAccounts: (accountIds: string[]) => void
  setSelectedThreadId: (threadId: string | null) => void
  setSelectedLabel: (label: string) => void
  setCalendarWeekStart: (start: string) => void
  navigateWeek: (direction: -1 | 1) => void
  goToToday: () => void
}

const initialWeekStartDay = detectWeekStartDay()

export const useUIStore = create<UIState>((set, get) => ({
  theme: 'dark',
  activeView: 'mail',
  activeAccounts: [],
  selectedThreadId: null,
  selectedLabel: 'INBOX',
  weekStartDay: initialWeekStartDay,
  calendarWeekStart: getWeekStart(new Date(), initialWeekStartDay),

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
  setCalendarWeekStart: (start) => set({ calendarWeekStart: start }),
  navigateWeek: (direction) =>
    set((state) => {
      const [y, m, d] = state.calendarWeekStart.split('-').map(Number)
      const date = new Date(Date.UTC(y, m - 1, d + direction * 7))
      const iso = date.toISOString().slice(0, 10)
      return { calendarWeekStart: iso }
    }),
  goToToday: () => set({ calendarWeekStart: getWeekStart(new Date(), get().weekStartDay) }),
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
