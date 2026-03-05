import { useEffect, useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { listen } from '@tauri-apps/api/event'
import type { Account } from './types/models'
import { useUIStore } from './store/uiStore'
import { applyTheme } from './styles/theme'
import { useAccounts } from './hooks/useAccounts'
import { useMessages } from './hooks/useMessages'
import WelcomePage from './components/WelcomePage'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import MailView from './components/MailView'

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
  const setActiveAccounts = useUIStore((s) => s.setActiveAccounts)

  const { data: accounts = [] } = useAccounts()
  const { data: messages, isLoading: messagesLoading } = useMessages(activeAccounts, selectedLabel)

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

  // Resolve active account objects
  const activeAccountObjects = useMemo(
    () => accounts.filter((a) => activeAccounts.includes(a.id)),
    [accounts, activeAccounts],
  )

  const unreadCount = useMemo(
    () =>
      messages?.filter((m) => m.unread && activeAccounts.includes(m.account_id)).length ?? 0,
    [messages, activeAccounts],
  )

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <Sidebar accounts={accounts} unreadCount={unreadCount} />
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
        {activeView === 'mail' && (
          <>
            <TopBar activeAccounts={activeAccountObjects} />
            <MailView
              accounts={accounts}
              messages={messages}
              isLoading={messagesLoading}
            />
          </>
        )}
        {activeView === 'calendar' && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            Calendar view will be added in Phase 3
          </div>
        )}
      </main>
    </div>
  )
}

function App() {
  // Apply default theme on mount
  useEffect(() => {
    applyTheme(useUIStore.getState().theme)
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  )
}

export default App
