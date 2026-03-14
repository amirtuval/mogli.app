import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account, MessageMeta } from '../types/models'
import { useUIStore } from '../store/uiStore'
import EmailList from '../components/EmailList'

const MOCK_ACCOUNTS: Account[] = [
  {
    id: 'a1',
    email: 'work@test.com',
    display_name: 'Work',
    color: '#4f9cf9',
    history_id: '',
    auth_expired: false,
  },
  {
    id: 'a2',
    email: 'personal@test.com',
    display_name: 'Personal',
    color: '#f97316',
    history_id: '',
    auth_expired: false,
  },
]

const MOCK_MESSAGES: MessageMeta[] = [
  {
    id: 'm1',
    thread_id: 't1',
    account_id: 'a1',
    from: 'Alice',
    subject: 'Hello',
    snippet: 'Hey there...',
    date: Math.floor(Date.now() / 1000) - 300, // 5 min ago
    unread: true,
    starred: false,
    labels: ['INBOX', 'UNREAD'],
  },
  {
    id: 'm2',
    thread_id: 't2',
    account_id: 'a2',
    from: 'Bob',
    subject: 'Re: Meeting',
    snippet: 'Sounds good',
    date: Math.floor(Date.now() / 1000) - 86400, // yesterday
    unread: false,
    starred: true,
    labels: ['INBOX', 'STARRED'],
  },
]

describe('EmailList', () => {
  beforeEach(() => {
    useUIStore.setState({
      selectedThreadId: null,
      activeAccounts: ['a1', 'a2'],
      selectedLabel: 'INBOX',
      mailFilter: { unread: false, starred: false },
      selectedThreadIds: new Set<string>(),
      lastSelectedThreadId: null,
    })
  })

  it('should render correct number of rows', () => {
    render(
      <EmailList
        messages={MOCK_MESSAGES}
        accounts={MOCK_ACCOUNTS}
        isLoading={false}
        selectedLabel="INBOX"
      />,
    )

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('2 threads · Inbox')).toBeInTheDocument()
  })

  it('should show skeleton rows when loading', () => {
    const { container } = render(
      <EmailList
        messages={undefined}
        accounts={MOCK_ACCOUNTS}
        isLoading={true}
        selectedLabel="INBOX"
      />,
    )

    expect(screen.getByText(/Loading/)).toBeInTheDocument()
    // Should render skeleton placeholder rows
    const skeletons = container.querySelectorAll('[class*="skeleton"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('should show starred indicator', () => {
    render(
      <EmailList
        messages={MOCK_MESSAGES}
        accounts={MOCK_ACCOUNTS}
        isLoading={false}
        selectedLabel="INBOX"
      />,
    )

    // Bob's message is starred
    expect(screen.getByText('★')).toBeInTheDocument()
  })

  it('should show unread dot for unread messages', () => {
    const { container } = render(
      <EmailList
        messages={MOCK_MESSAGES}
        accounts={MOCK_ACCOUNTS}
        isLoading={false}
        selectedLabel="INBOX"
      />,
    )

    // Should have exactly one unread dot (Alice's message)
    const unreadDots = container.querySelectorAll('[class*="unreadDot"]')
    expect(unreadDots.length).toBe(1)
  })

  it('should set selectedThreadId on click', async () => {
    const user = userEvent.setup()

    render(
      <EmailList
        messages={MOCK_MESSAGES}
        accounts={MOCK_ACCOUNTS}
        isLoading={false}
        selectedLabel="INBOX"
      />,
    )

    await user.click(screen.getByText('Alice'))
    expect(useUIStore.getState().selectedThreadId).toBe('t1')
  })

  it('should show empty state when no messages', () => {
    render(
      <EmailList messages={[]} accounts={MOCK_ACCOUNTS} isLoading={false} selectedLabel="INBOX" />,
    )

    expect(screen.getByText('No messages')).toBeInTheDocument()
  })

  it('should show search result count when searchQuery is set', () => {
    render(
      <EmailList
        messages={MOCK_MESSAGES}
        accounts={MOCK_ACCOUNTS}
        isLoading={false}
        selectedLabel="INBOX"
        searchQuery="Hello"
      />,
    )

    expect(screen.getByText('2 results · "Hello"')).toBeInTheDocument()
  })

  it('should show "No results found" when searching with empty results', () => {
    render(
      <EmailList
        messages={[]}
        accounts={MOCK_ACCOUNTS}
        isLoading={false}
        selectedLabel="INBOX"
        searchQuery="nonexistent"
      />,
    )

    expect(screen.getByText('No results found')).toBeInTheDocument()
  })

  it('should render filter chip buttons', () => {
    render(
      <EmailList
        messages={MOCK_MESSAGES}
        accounts={MOCK_ACCOUNTS}
        isLoading={false}
        selectedLabel="INBOX"
      />,
    )

    expect(screen.getByText('Unread')).toBeInTheDocument()
    expect(screen.getByText('Starred')).toBeInTheDocument()
  })

  it('should toggle mailFilter.unread in the store when Unread chip is clicked', async () => {
    const user = userEvent.setup()
    render(
      <EmailList
        messages={MOCK_MESSAGES}
        accounts={MOCK_ACCOUNTS}
        isLoading={false}
        selectedLabel="INBOX"
      />,
    )

    // Filter is off initially
    expect(useUIStore.getState().mailFilter.unread).toBe(false)

    await user.click(screen.getByText('Unread'))

    // Clicking the chip toggles the store flag (server-side filter via query key)
    expect(useUIStore.getState().mailFilter.unread).toBe(true)
  })

  it('should toggle mailFilter.starred in the store when Starred chip is clicked', async () => {
    const user = userEvent.setup()
    render(
      <EmailList
        messages={MOCK_MESSAGES}
        accounts={MOCK_ACCOUNTS}
        isLoading={false}
        selectedLabel="INBOX"
      />,
    )

    // Filter is off initially
    expect(useUIStore.getState().mailFilter.starred).toBe(false)

    await user.click(screen.getByText('Starred'))

    // Clicking the chip toggles the store flag (server-side filter via query key)
    expect(useUIStore.getState().mailFilter.starred).toBe(true)
  })

  it('should deduplicate messages by thread_id showing one row per thread', () => {
    const threadedMessages: MessageMeta[] = [
      {
        id: 'm1',
        thread_id: 't1',
        account_id: 'a1',
        from: 'Alice',
        subject: 'Hello',
        snippet: 'First message',
        date: Math.floor(Date.now() / 1000) - 600,
        unread: false,
        starred: false,
        labels: ['INBOX'],
      },
      {
        id: 'm2',
        thread_id: 't1', // same thread
        account_id: 'a1',
        from: 'Bob',
        subject: 'Re: Hello',
        snippet: 'Reply message',
        date: Math.floor(Date.now() / 1000) - 300, // newer
        unread: false,
        starred: false,
        labels: ['INBOX'],
      },
      {
        id: 'm3',
        thread_id: 't2', // different thread
        account_id: 'a1',
        from: 'Charlie',
        subject: 'Other',
        snippet: 'Other thread',
        date: Math.floor(Date.now() / 1000) - 100,
        unread: false,
        starred: false,
        labels: ['INBOX'],
      },
    ]

    render(
      <EmailList
        messages={threadedMessages}
        accounts={MOCK_ACCOUNTS}
        isLoading={false}
        selectedLabel="INBOX"
      />,
    )

    // Should show 2 threads, not 3 messages
    expect(screen.getByText('2 threads · Inbox')).toBeInTheDocument()
    // Latest message in thread t1 (Bob's reply) should be shown
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Charlie')).toBeInTheDocument()
    // Alice's older message in same thread should NOT appear as separate row
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })

  it('should show thread as unread if any message in thread is unread', () => {
    const threadedMessages: MessageMeta[] = [
      {
        id: 'm1',
        thread_id: 't1',
        account_id: 'a1',
        from: 'Alice',
        subject: 'Hello',
        snippet: 'First message',
        date: Math.floor(Date.now() / 1000) - 600,
        unread: true, // older message is unread
        starred: false,
        labels: ['INBOX', 'UNREAD'],
      },
      {
        id: 'm2',
        thread_id: 't1', // same thread
        account_id: 'a1',
        from: 'Bob',
        subject: 'Re: Hello',
        snippet: 'Reply',
        date: Math.floor(Date.now() / 1000) - 300, // newer, but read
        unread: false,
        starred: false,
        labels: ['INBOX'],
      },
    ]

    const { container } = render(
      <EmailList
        messages={threadedMessages}
        accounts={MOCK_ACCOUNTS}
        isLoading={false}
        selectedLabel="INBOX"
      />,
    )

    // Thread should show unread dot (aggregated from older unread message)
    const unreadDots = container.querySelectorAll('[class*="unreadDot"]')
    expect(unreadDots.length).toBe(1)

    // Thread row should show the newest message (Bob) with unread styling
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('should show "No matching messages" when filter is active and server returns no results', () => {
    // Pre-set filter in store (simulates user having clicked Unread)
    useUIStore.setState({ mailFilter: { unread: true, starred: false } })

    render(
      <EmailList messages={[]} accounts={MOCK_ACCOUNTS} isLoading={false} selectedLabel="INBOX" />,
    )

    expect(screen.getByText('No matching messages')).toBeInTheDocument()
  })

  it('should render checkboxes on each email row', () => {
    const { container } = render(
      <EmailList
        messages={MOCK_MESSAGES}
        accounts={MOCK_ACCOUNTS}
        isLoading={false}
        selectedLabel="INBOX"
      />,
    )

    // Each row should have a checkbox input
    const checkboxes = container.querySelectorAll('[class*="checkbox"] input[type="checkbox"]')
    expect(checkboxes.length).toBe(2)
  })

  it('should render select-all checkbox in header', () => {
    const { container } = render(
      <EmailList
        messages={MOCK_MESSAGES}
        accounts={MOCK_ACCOUNTS}
        isLoading={false}
        selectedLabel="INBOX"
      />,
    )

    const selectAll = container.querySelector('[class*="selectAllCheckbox"] input[type="checkbox"]')
    expect(selectAll).toBeInTheDocument()
  })

  it('should toggle thread selection when checkbox is clicked', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <EmailList
        messages={MOCK_MESSAGES}
        accounts={MOCK_ACCOUNTS}
        isLoading={false}
        selectedLabel="INBOX"
      />,
    )

    const checkboxes = container.querySelectorAll('[class*="checkbox"] input[type="checkbox"]')
    await user.click(checkboxes[0])

    expect(useUIStore.getState().selectedThreadIds.has('t1')).toBe(true)
    expect(useUIStore.getState().selectedThreadIds.size).toBe(1)
  })

  it('should show selected count in header when threads are selected', () => {
    useUIStore.setState({ selectedThreadIds: new Set(['t1']) })

    render(
      <EmailList
        messages={MOCK_MESSAGES}
        accounts={MOCK_ACCOUNTS}
        isLoading={false}
        selectedLabel="INBOX"
      />,
    )

    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('should select all threads when select-all checkbox is clicked', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <EmailList
        messages={MOCK_MESSAGES}
        accounts={MOCK_ACCOUNTS}
        isLoading={false}
        selectedLabel="INBOX"
      />,
    )

    const selectAll = container.querySelector(
      '[class*="selectAllCheckbox"] input[type="checkbox"]',
    ) as HTMLInputElement
    await user.click(selectAll)

    expect(useUIStore.getState().selectedThreadIds.size).toBe(2)
    expect(useUIStore.getState().selectedThreadIds.has('t1')).toBe(true)
    expect(useUIStore.getState().selectedThreadIds.has('t2')).toBe(true)
  })

  it('should hide filter chips when selection is active', () => {
    useUIStore.setState({ selectedThreadIds: new Set(['t1']) })

    render(
      <EmailList
        messages={MOCK_MESSAGES}
        accounts={MOCK_ACCOUNTS}
        isLoading={false}
        selectedLabel="INBOX"
      />,
    )

    expect(screen.queryByText('Unread')).not.toBeInTheDocument()
    expect(screen.queryByText('Starred')).not.toBeInTheDocument()
  })
})
