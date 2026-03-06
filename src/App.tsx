import { useEffect, useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { listen } from '@tauri-apps/api/event'
import type { Account } from './types/models'
import { useUIStore, initTheme } from './store/uiStore'
import { applyTheme } from './styles/theme'
import { useAccounts } from './hooks/useAccounts'
import { useMessages } from './hooks/useMessages'
import { useAllCalendars } from './hooks/useCalendars'
import { useEvents } from './hooks/useEvents'
import WelcomePage from './components/WelcomePage'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import MailView from './components/MailView'
import CalendarView from './components/CalendarView'

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
  const setActiveAccounts = useUIStore((s) => s.setActiveAccounts)

  const { data: accounts = [] } = useAccounts()
  const { data: messages, isLoading: messagesLoading } = useMessages(activeAccounts, selectedLabel)

  // Fetch calendars for all active accounts
  const { data: calendars = [] } = useAllCalendars(activeAccounts)

  // Compute enabled calendar IDs for event fetching
  const enabledCalendarIds = useMemo(
    () => calendars.filter((c) => c.enabled).map((c) => c.id),
    [calendars],
  )

  // Fetch events for the current week
  const { data: events, isLoading: eventsLoading } = useEvents(
    activeAccounts,
    enabledCalendarIds,
    calendarWeekStart,
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

  // Resolve active account objects (must be before early return — hooks are unconditional)
  const activeAccountObjects = useMemo(
    () => accounts.filter((a) => activeAccounts.includes(a.id)),
    [accounts, activeAccounts],
  )

  const unreadCount = useMemo(
    () => messages?.filter((m) => m.unread && activeAccounts.includes(m.account_id)).length ?? 0,
    [messages, activeAccounts],
  )

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
        <TopBar activeAccounts={activeAccountObjects} />
        {activeView === 'mail' && (
          <MailView accounts={accounts} messages={messages} isLoading={messagesLoading} />
        )}
        {activeView === 'calendar' && (
          <CalendarView events={events} accounts={accounts} isLoading={eventsLoading} />
        )}
      </main>
    </div>
  )
}

function App() {
  // Load persisted theme from backend store, then apply CSS vars
  useEffect(() => {
    // Apply default immediately, then override with persisted value
    applyTheme(useUIStore.getState().theme)
    initTheme()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  )
}

export default App
