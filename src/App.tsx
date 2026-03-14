import { useEffect, useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { Account } from './types/models'
import {
  useUIStore,
  initTheme,
  initWeekStartDay,
  initNotifications,
  initAutoMarkRead,
  initMailFilter,
  initCalendarViewMode,
} from './store/uiStore'
import { applyTheme } from './styles/theme'
import { useAccounts } from './hooks/useAccounts'
import { useMessages } from './hooks/useMessages'
import { useSearchMessages } from './hooks/useSearchMessages'
import { useAllCalendars } from './hooks/useCalendars'
import { useEvents } from './hooks/useEvents'
import WelcomePage from './components/WelcomePage'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import MailView from './components/MailView'
import CalendarView from './components/CalendarView'
import MonthView from './components/MonthView'
import NotificationBanner from './components/NotificationBanner'
import UpdateBanner from './components/UpdateBanner'
import ComposeModal from './components/ComposeModal'
import EventModal from './components/EventModal'
import type { ReminderPayload } from './types/models'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      retry: 1,
    },
  },
})

function AppShell() {
  const theme = useUIStore((s) => s.theme)
  const activeView = useUIStore((s) => s.activeView)
  const activeAccounts = useUIStore((s) => s.activeAccounts)
  const selectedLabel = useUIStore((s) => s.selectedLabel)
  const calendarWeekStart = useUIStore((s) => s.calendarWeekStart)
  const calendarViewMode = useUIStore((s) => s.calendarViewMode)
  const calendarViewDate = useUIStore((s) => s.calendarViewDate)
  const weekStartDay = useUIStore((s) => s.weekStartDay)
  const setActiveAccounts = useUIStore((s) => s.setActiveAccounts)
  const searchQuery = useUIStore((s) => s.searchQuery)
  const showCompose = useUIStore((s) => s.showCompose)
  const showEventModal = useUIStore((s) => s.showEventModal)

  const { data: accounts = [] } = useAccounts()

  // Filter out expired accounts so data hooks don't try to fetch with revoked tokens
  const healthyAccountIds = useMemo(
    () => activeAccounts.filter((id) => !accounts.find((a) => a.id === id)?.auth_expired),
    [activeAccounts, accounts],
  )

  const { data: messages, isLoading: messagesLoading } = useMessages(
    healthyAccountIds,
    selectedLabel,
  )
  const { data: searchResults, isLoading: searchLoading } = useSearchMessages(
    healthyAccountIds,
    searchQuery,
  )

  // When searching, show search results; otherwise show label-filtered messages
  const activeMessages = searchQuery ? searchResults : messages
  const activeMessagesLoading = searchQuery ? searchLoading : messagesLoading

  // Fetch calendars for all active accounts
  const { data: calendars = [] } = useAllCalendars(healthyAccountIds)

  // Compute enabled calendar IDs for event fetching
  const enabledCalendarIds = useMemo(
    () => calendars.filter((c) => c.enabled).map((c) => c.id),
    [calendars],
  )

  // Fetch events for the current view period
  const {
    data: events,
    isLoading: eventsLoading,
    isFetching: eventsFetching,
  } = useEvents(
    healthyAccountIds,
    enabledCalendarIds,
    calendarWeekStart,
    calendarViewMode,
    calendarViewDate,
    weekStartDay,
  )

  // Apply theme CSS vars whenever theme changes
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // When accounts load, activate all of them if none are active
  useEffect(() => {
    if (accounts.length > 0 && activeAccounts.length === 0) {
      setActiveAccounts(accounts.map((a) => a.id))
    }
  }, [accounts, activeAccounts.length, setActiveAccounts])

  // Listen for background sync events to refresh messages
  useEffect(() => {
    const unlisten = listen('mail:new', () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] })
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  // Listen for notification:open_thread events to pre-select a thread.
  // Don't switch the active view — the event fires for every new message
  // during background sync, not only when the user clicks a notification.
  useEffect(() => {
    const unlisten = listen<{ thread_id: string; account_id: string }>(
      'notification:open_thread',
      (event) => {
        useUIStore.getState().setSelectedThreadId(event.payload.thread_id)
      },
    )
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  // Listen for calendar reminder events from the background reminder checker
  useEffect(() => {
    const unlisten = listen<ReminderPayload>('calendar:reminder', (event) => {
      useUIStore.getState().addReminder(event.payload)
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  // Resolve active account objects (must be before early return — hooks are unconditional)
  const activeAccountObjects = useMemo(
    () => accounts.filter((a) => activeAccounts.includes(a.id)),
    [accounts, activeAccounts],
  )

  const unreadCount = useMemo(
    () => messages?.filter((m) => m.unread && activeAccounts.includes(m.account_id)).length ?? 0,
    [messages, activeAccounts],
  )

  // Update tray tooltip with unread count
  useEffect(() => {
    invoke('set_tray_badge', { count: unreadCount }).catch(() => {
      // Tray not available — ignore
    })
  }, [unreadCount])

  // Show welcome page if no accounts
  if (accounts.length === 0) {
    return (
      <WelcomePage
        onContinue={(newAccounts: Account[]) => {
          queryClient.invalidateQueries({ queryKey: ['accounts'] })
          setActiveAccounts(newAccounts.map((a) => a.id))
        }}
      />
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <Sidebar accounts={accounts} unreadCount={unreadCount} calendars={calendars} />
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
          background: 'var(--bg-app)',
          color: 'var(--text-primary)',
        }}
      >
        <UpdateBanner />
        <NotificationBanner />
        <TopBar activeAccounts={activeAccountObjects} />
        {activeView === 'mail' && (
          <MailView
            accounts={accounts}
            messages={activeMessages}
            isLoading={activeMessagesLoading}
          />
        )}
        {activeView === 'calendar' && calendarViewMode === 'month' && (
          <MonthView
            events={events}
            calendars={calendars}
            accounts={accounts}
            isFetching={eventsFetching}
          />
        )}
        {activeView === 'calendar' && calendarViewMode !== 'month' && (
          <CalendarView
            events={events}
            calendars={calendars}
            accounts={accounts}
            isLoading={eventsLoading}
            isFetching={eventsFetching}
          />
        )}
      </main>
      {showCompose && <ComposeModal accounts={accounts} />}
      {showEventModal && (
        <EventModal
          accounts={accounts}
          calendars={calendars}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['events'] })
          }}
        />
      )}
    </div>
  )
}

function App() {
  // Load persisted theme from backend store, then apply CSS vars
  useEffect(() => {
    // Apply default immediately, then override with persisted value
    applyTheme(useUIStore.getState().theme)
    initTheme()
    initWeekStartDay()
    initNotifications()
    initAutoMarkRead()
    initMailFilter()
    initCalendarViewMode()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  )
}

export default App
