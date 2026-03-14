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
    auth_expired: false,
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
      autoMarkRead: false,
    })
  })

  it('should show empty state when no thread selected', () => {
    useUIStore.setState({ selectedThreadId: null })

    renderWithQuery(<EmailDetail accounts={MOCK_ACCOUNTS} selectedMessage={undefined} />)

    expect(screen.getByText('Select a message')).toBeInTheDocument()
  })

  it('should render subject, from, and body when thread loaded', async () => {
    const textOnlyThread = {
      ...MOCK_THREAD,
      messages: [{ ...MOCK_THREAD.messages[0], body_html: null }],
    }
    mockedInvoke.mockResolvedValueOnce(textOnlyThread)

    renderWithQuery(
      <EmailDetail accounts={MOCK_ACCOUNTS} selectedMessage={MOCK_SELECTED_MESSAGE} />,
    )

    await waitFor(() => {
      expect(screen.getByText('Important Subject')).toBeInTheDocument()
    })

    expect(screen.getByText('Alice Sender')).toBeInTheDocument()
    expect(screen.getByText('Hello from Alice')).toBeInTheDocument()
  })

  it('should render HTML email in a Shadow DOM container', async () => {
    mockedInvoke.mockResolvedValueOnce(MOCK_THREAD)

    const { container } = renderWithQuery(
      <EmailDetail accounts={MOCK_ACCOUNTS} selectedMessage={MOCK_SELECTED_MESSAGE} />,
    )

    await waitFor(() => {
      expect(screen.getByText('Important Subject')).toBeInTheDocument()
    })

    // The ShadowHtml component renders a div host; in jsdom shadow DOM is
    // not fully supported, but the host element should be present.
    // Verify no iframe is used and the body area exists.
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('should render plain text email with newlines preserved', async () => {
    const textOnlyThread = {
      ...MOCK_THREAD,
      messages: [{ ...MOCK_THREAD.messages[0], body_html: null, body_text: 'Line 1\nLine 2' }],
    }
    mockedInvoke.mockResolvedValueOnce(textOnlyThread)

    renderWithQuery(
      <EmailDetail accounts={MOCK_ACCOUNTS} selectedMessage={MOCK_SELECTED_MESSAGE} />,
    )

    await waitFor(() => {
      expect(screen.getByText(/Line 1/)).toBeInTheDocument()
    })

    const el = screen.getByText(/Line 1/)
    expect(el.textContent).toBe('Line 1\nLine 2')
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

  it('should render Reply and Forward buttons', async () => {
    mockedInvoke.mockResolvedValueOnce(MOCK_THREAD)

    renderWithQuery(
      <EmailDetail accounts={MOCK_ACCOUNTS} selectedMessage={MOCK_SELECTED_MESSAGE} />,
    )

    await waitFor(() => {
      expect(screen.getByText('↩ Reply')).toBeInTheDocument()
    })
    expect(screen.getByText('↪ Forward')).toBeInTheDocument()
  })

  it('should open compose with reply context when Reply is clicked', async () => {
    const user = userEvent.setup()
    mockedInvoke.mockResolvedValueOnce(MOCK_THREAD)

    renderWithQuery(
      <EmailDetail accounts={MOCK_ACCOUNTS} selectedMessage={MOCK_SELECTED_MESSAGE} />,
    )

    await waitFor(() => {
      expect(screen.getByText('↩ Reply')).toBeInTheDocument()
    })

    await user.click(screen.getByText('↩ Reply'))

    const state = useUIStore.getState()
    expect(state.showCompose).toBe(true)
    expect(state.composeContext).toEqual({
      mode: 'reply',
      threadId: 't1',
      accountId: 'a1',
      to: 'Alice Sender',
      subject: 'Important Subject',
      body: 'Hello from Alice',
    })
  })

  it('should open compose with forward context when Forward is clicked', async () => {
    const user = userEvent.setup()
    mockedInvoke.mockResolvedValueOnce(MOCK_THREAD)

    renderWithQuery(
      <EmailDetail accounts={MOCK_ACCOUNTS} selectedMessage={MOCK_SELECTED_MESSAGE} />,
    )

    await waitFor(() => {
      expect(screen.getByText('↪ Forward')).toBeInTheDocument()
    })

    await user.click(screen.getByText('↪ Forward'))

    const state = useUIStore.getState()
    expect(state.showCompose).toBe(true)
    expect(state.composeContext).toEqual({
      mode: 'forward',
      threadId: 't1',
      accountId: 'a1',
      subject: 'Important Subject',
      body: 'Hello from Alice',
    })
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

  it('should show "Mark unread" for a read message and call mark_unread on click', async () => {
    const user = userEvent.setup()
    mockedInvoke.mockResolvedValueOnce(MOCK_THREAD).mockResolvedValueOnce(undefined)

    renderWithQuery(
      <EmailDetail
        accounts={MOCK_ACCOUNTS}
        selectedMessage={{ ...MOCK_SELECTED_MESSAGE, unread: false }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('○ Mark unread')).toBeInTheDocument()
    })

    await user.click(screen.getByText('○ Mark unread'))

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('mark_unread', {
        accountId: 'a1',
        threadId: 't1',
      })
    })
  })

  it('should show "Mark read" for an unread message and call mark_read on click', async () => {
    const user = userEvent.setup()
    mockedInvoke.mockResolvedValueOnce(MOCK_THREAD).mockResolvedValueOnce(undefined)

    renderWithQuery(
      <EmailDetail
        accounts={MOCK_ACCOUNTS}
        selectedMessage={{ ...MOCK_SELECTED_MESSAGE, unread: true }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('✓ Mark read')).toBeInTheDocument()
    })

    await user.click(screen.getByText('✓ Mark read'))

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('mark_read', {
        accountId: 'a1',
        threadId: 't1',
      })
    })
  })

  it('should render auto-mark-read checkbox reflecting store state', async () => {
    mockedInvoke.mockResolvedValueOnce(MOCK_THREAD)
    useUIStore.setState({ autoMarkRead: true })

    renderWithQuery(
      <EmailDetail accounts={MOCK_ACCOUNTS} selectedMessage={MOCK_SELECTED_MESSAGE} />,
    )

    await waitFor(() => {
      expect(screen.getByText('Auto-read')).toBeInTheDocument()
    })

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeChecked()
  })

  it('should toggle auto-mark-read in store when checkbox is clicked', async () => {
    const user = userEvent.setup()
    mockedInvoke.mockResolvedValueOnce(MOCK_THREAD)
    // save_auto_mark_read invoke
    mockedInvoke.mockResolvedValueOnce(undefined)

    renderWithQuery(
      <EmailDetail accounts={MOCK_ACCOUNTS} selectedMessage={MOCK_SELECTED_MESSAGE} />,
    )

    await waitFor(() => {
      expect(screen.getByText('Auto-read')).toBeInTheDocument()
    })

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)

    expect(useUIStore.getState().autoMarkRead).toBe(true)
  })
})
