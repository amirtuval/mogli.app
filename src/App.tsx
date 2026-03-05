import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      retry: 1,
    },
  },
})

interface Account {
  id: string
  email: string
  display_name: string
  color: string
  history_id: string
}

interface MessageMeta {
  id: string
  thread_id: string
  account_id: string
  from: string
  subject: string
  snippet: string
  date: number
  unread: boolean
  starred: boolean
  labels: string[]
}

/**
 * Phase 1 Debug View — intentionally unstyled.
 * Validates OAuth flow and Gmail API access.
 * Removed entirely in Phase 2.
 */
function DebugView() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [messages, setMessages] = useState<MessageMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAccounts = async () => {
    try {
      setError(null)
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<Account[]>('list_accounts')
      setAccounts(result)
    } catch (e) {
      setError(String(e))
    }
  }

  const addAccount = async () => {
    try {
      setLoading(true)
      setError(null)
      const { invoke } = await import('@tauri-apps/api/core')
      const account = await invoke<Account>('add_account')
      setAccounts((prev) => [...prev, account])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const fetchMessages = async (accountId: string) => {
    try {
      setLoading(true)
      setError(null)
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<MessageMeta[]>('get_messages', {
        accountIds: [accountId],
        label: 'INBOX',
        pageToken: null,
      })
      setMessages(result)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  return (
    <div style={{ padding: 24, fontFamily: 'monospace' }}>
      <h1>⬡ Mogly — Debug View (Phase 1)</h1>

      {error && (
        <div
          style={{ color: '#f43f5e', marginBottom: 16, padding: 8, border: '1px solid #f43f5e' }}
        >
          Error: {error}
        </div>
      )}

      <section>
        <h2>Accounts</h2>
        <button onClick={addAccount} disabled={loading}>
          {loading ? 'Adding...' : 'Add Account'}
        </button>

        {accounts.length === 0 ? (
          <p>No accounts configured.</p>
        ) : (
          <pre style={{ background: '#1a1a1e', color: '#e8e8ec', padding: 16, borderRadius: 4 }}>
            {JSON.stringify(accounts, null, 2)}
          </pre>
        )}
      </section>

      {accounts.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2>Messages</h2>
          {accounts.map((account) => (
            <button
              key={account.id}
              onClick={() => fetchMessages(account.id)}
              disabled={loading}
              style={{ marginRight: 8 }}
            >
              Fetch from {account.email}
            </button>
          ))}

          {messages.length > 0 && (
            <pre
              style={{
                background: '#1a1a1e',
                color: '#e8e8ec',
                padding: 16,
                borderRadius: 4,
                maxHeight: 500,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(messages, null, 2)}
            </pre>
          )}
        </section>
      )}
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DebugView />
    </QueryClientProvider>
  )
}

export default App
