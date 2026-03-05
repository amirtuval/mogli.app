import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account, MessageMeta } from '../types/models'
import { useUIStore } from '../store/uiStore'
import EmailList from '../components/EmailList'

const MOCK_ACCOUNTS: Account[] = [
  { id: 'a1', email: 'work@test.com', display_name: 'Work', color: '#4f9cf9', history_id: '' },
  {
    id: 'a2',
    email: 'personal@test.com',
    display_name: 'Personal',
    color: '#f97316',
    history_id: '',
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
})
