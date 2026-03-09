import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export type Theme = 'light' | 'dark' | 'ultraDark'
export type AppView = 'mail' | 'calendar'

/** 0 = Sunday, 1 = Monday */
export type WeekStartDay = 0 | 1

const VALID_THEMES: Theme[] = ['light', 'dark', 'ultraDark']

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
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
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
  notificationsEnabled: boolean // OS notification permission granted
  searchQuery: string // active mail search query (empty = no search)
  mailFilter: { unread: boolean; starred: boolean } // client-side filter chips
  autoMarkRead: boolean // auto-mark threads as read after 2s delay

  setTheme: (theme: Theme) => void
  setActiveView: (view: AppView) => void
  toggleAccount: (accountId: string) => void
  setActiveAccounts: (accountIds: string[]) => void
  setSelectedThreadId: (threadId: string | null) => void
  setSelectedLabel: (label: string) => void
  setCalendarWeekStart: (start: string) => void
  setWeekStartDay: (day: WeekStartDay) => void
  navigateWeek: (direction: -1 | 1) => void
  goToToday: () => void
  setNotificationsEnabled: (enabled: boolean) => void
  setSearchQuery: (query: string) => void
  toggleMailFilter: (key: 'unread' | 'starred') => void
  setAutoMarkRead: (enabled: boolean) => void
}

export const useUIStore = create<UIState>((set, get) => ({
  theme: 'dark',
  activeView: 'mail',
  activeAccounts: [],
  selectedThreadId: null,
  selectedLabel: 'INBOX',
  weekStartDay: 1,
  calendarWeekStart: getWeekStart(new Date(), 1),
  notificationsEnabled: false,
  searchQuery: '',
  mailFilter: { unread: false, starred: false },
  autoMarkRead: false,

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
  setWeekStartDay: (day) => {
    const weekStart = getWeekStart(new Date(), day)
    set({ weekStartDay: day, calendarWeekStart: weekStart })
    // Persist to disk (fire-and-forget)
    invoke('save_week_start_day', { day }).catch((e: unknown) =>
      console.warn('Failed to persist week start day:', e),
    )
  },
  navigateWeek: (direction) =>
    set((state) => {
      const [y, m, d] = state.calendarWeekStart.split('-').map(Number)
      const date = new Date(y, m - 1, d + direction * 7)
      const yyyy = date.getFullYear()
      const mm = String(date.getMonth() + 1).padStart(2, '0')
      const dd = String(date.getDate()).padStart(2, '0')
      return { calendarWeekStart: `${yyyy}-${mm}-${dd}` }
    }),
  goToToday: () => set({ calendarWeekStart: getWeekStart(new Date(), get().weekStartDay) }),
  setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  toggleMailFilter: (key) =>
    set((state) => ({
      mailFilter: { ...state.mailFilter, [key]: !state.mailFilter[key] },
    })),
  setAutoMarkRead: (enabled) => {
    set({ autoMarkRead: enabled })
    invoke('save_auto_mark_read', { enabled }).catch((e: unknown) =>
      console.warn('Failed to persist auto-mark-read:', e),
    )
  },
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

/** Load the persisted week start day from the backend store and apply it. */
export async function initWeekStartDay(): Promise<void> {
  try {
    const saved = await invoke<number>('load_week_start_day')
    if (saved === 0 || saved === 1) {
      useUIStore.getState().setWeekStartDay(saved as WeekStartDay)
    }
  } catch {
    // First launch or store unavailable — keep default (Monday)
  }
}

/** Check OS notification permission and update the store. */
export async function initNotifications(): Promise<void> {
  try {
    const granted = await invoke<boolean>('is_notification_granted')
    useUIStore.getState().setNotificationsEnabled(granted)
  } catch {
    // Plugin unavailable — keep default (false)
  }
}

/** Load the persisted auto-mark-read preference from the backend store. */
export async function initAutoMarkRead(): Promise<void> {
  try {
    const saved = await invoke<boolean>('load_auto_mark_read')
    useUIStore.setState({ autoMarkRead: saved })
  } catch {
    // First launch or store unavailable — keep default (false)
  }
}
