import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import type { Account, MessageMeta, Thread } from '../types/models'
import { useUIStore } from '../store/uiStore'
import EmailDetail from '../components/EmailDetail'

const mockedInvoke = vi.mocked(invoke)

const MOCK_ACCOUNTS: Account[] = [
  {
    id: 'a1',
    email: 'work@test.com',
    display_name: 'Work',
    color: '#4f9cf9',
    history_id: '',
  },
]

const MOCK_SELECTED_MESSAGE: MessageMeta = {
  id: 'm1',
  thread_id: 't1',
  account_id: 'a1',
  from: 'Alice Sender',
  subject: 'Important Subject',
  snippet: 'Hey there...',
  date: 1700000000,
  unread: false,
  starred: false,
  labels: ['INBOX'],
}

const MOCK_THREAD: Thread = {
  id: 't1',
  account_id: 'a1',
  messages: [
    {
      id: 'm1',
      from: 'Alice Sender',
      to: ['me@test.com'],
      subject: 'Important Subject',
      body_html: '<p>Hello from Alice</p>',
      body_text: 'Hello from Alice',
      date: 1700000000,
      attachments: [],
    },
  ],
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('EmailDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUIStore.setState({
      selectedThreadId: 't1',
      theme: 'dark',
    })
  })

  it('should show empty state when no thread selected', () => {
    useUIStore.setState({ selectedThreadId: null })

    renderWithQuery(<EmailDetail accounts={MOCK_ACCOUNTS} selectedMessage={undefined} />)

    expect(screen.getByText('Select a message')).toBeInTheDocument()
  })

  it('should render subject, from, and body when thread loaded', async () => {
    mockedInvoke.mockResolvedValueOnce(MOCK_THREAD)

    renderWithQuery(
      <EmailDetail accounts={MOCK_ACCOUNTS} selectedMessage={MOCK_SELECTED_MESSAGE} />,
    )

    await waitFor(() => {
      expect(screen.getByText('Important Subject')).toBeInTheDocument()
    })

    expect(screen.getByText('Alice Sender')).toBeInTheDocument()
    expect(screen.getByText('Hello from Alice')).toBeInTheDocument()
  })

  it('should show account tag pill with correct name', async () => {
    mockedInvoke.mockResolvedValueOnce(MOCK_THREAD)

    renderWithQuery(
      <EmailDetail accounts={MOCK_ACCOUNTS} selectedMessage={MOCK_SELECTED_MESSAGE} />,
    )

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
    })
  })

  it('should render Reply and Forward stub buttons', async () => {
    mockedInvoke.mockResolvedValueOnce(MOCK_THREAD)

    renderWithQuery(
      <EmailDetail accounts={MOCK_ACCOUNTS} selectedMessage={MOCK_SELECTED_MESSAGE} />,
    )

    await waitFor(() => {
      expect(screen.getByText('↩ Reply')).toBeInTheDocument()
    })
    expect(screen.getByText('↪ Forward')).toBeInTheDocument()
  })

  it('should call archive_thread when Archive is clicked', async () => {
    const user = userEvent.setup()
    // First call: get_thread, second call: archive_thread
    mockedInvoke.mockResolvedValueOnce(MOCK_THREAD).mockResolvedValueOnce(undefined)

    renderWithQuery(
      <EmailDetail accounts={MOCK_ACCOUNTS} selectedMessage={MOCK_SELECTED_MESSAGE} />,
    )

    await waitFor(() => {
      expect(screen.getByText('Archive')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Archive'))

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('archive_thread', {
        accountId: 'a1',
        threadId: 't1',
      })
    })
  })

  it('should clear selectedThreadId after successful archive', async () => {
    const user = userEvent.setup()
    mockedInvoke.mockResolvedValueOnce(MOCK_THREAD).mockResolvedValueOnce(undefined)

    renderWithQuery(
      <EmailDetail accounts={MOCK_ACCOUNTS} selectedMessage={MOCK_SELECTED_MESSAGE} />,
    )

    await waitFor(() => {
      expect(screen.getByText('Archive')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Archive'))

    await waitFor(() => {
      expect(useUIStore.getState().selectedThreadId).toBeNull()
    })
  })
})
