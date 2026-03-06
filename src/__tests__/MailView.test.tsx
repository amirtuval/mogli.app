import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Account, MessageMeta } from '../types/models'
import { useUIStore } from '../store/uiStore'
import MailView from '../components/MailView'

const MOCK_ACCOUNTS: Account[] = [
  { id: 'a1', email: 'work@test.com', display_name: 'Work', color: '#4f9cf9', history_id: '' },
]

const MOCK_MESSAGES: MessageMeta[] = [
  {
    id: 'm1',
    thread_id: 't1',
    account_id: 'a1',
    from: 'Alice',
    subject: 'Hello',
    snippet: 'Hey there...',
    date: Math.floor(Date.now() / 1000) - 300,
    unread: true,
    starred: false,
    labels: ['INBOX', 'UNREAD'],
  },
  {
    id: 'm2',
    thread_id: 't2',
    account_id: 'a1',
    from: 'Bob',
    subject: 'Meeting notes',
    snippet: 'Here are the notes...',
    date: Math.floor(Date.now() / 1000) - 600,
    unread: false,
    starred: false,
    labels: ['INBOX'],
  },
]

function renderMailView(props?: Partial<React.ComponentProps<typeof MailView>>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MailView
        accounts={props?.accounts ?? MOCK_ACCOUNTS}
        messages={props?.messages ?? MOCK_MESSAGES}
        isLoading={props?.isLoading ?? false}
      />
    </QueryClientProvider>,
  )
}

describe('MailView', () => {
  beforeEach(() => {
    useUIStore.setState({
      selectedLabel: 'INBOX',
      selectedThreadId: null,
      activeAccounts: ['a1'],
    })
  })

  it('should render email list with messages', () => {
    renderMailView()

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('should render detail pane placeholder when no thread selected', () => {
    renderMailView()

    expect(screen.getByText('Select a message')).toBeInTheDocument()
  })

  it('should pass loading state to email list', () => {
    renderMailView({ isLoading: true, messages: undefined })

    expect(screen.getByText(/Loading/)).toBeInTheDocument()
  })

  it('should render both list and detail panes', () => {
    const { container } = renderMailView()

    // MailView should contain the two-pane layout
    const mailView = container.querySelector('[class*="mailView"]')
    expect(mailView).toBeInTheDocument()
  })

  it('should show empty state when messages is empty array', () => {
    renderMailView({ messages: [] })

    expect(screen.getByText('No messages')).toBeInTheDocument()
  })
})
