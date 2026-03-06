import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account } from '../types/models'
import { useUIStore } from '../store/uiStore'
import TopBar from '../components/TopBar'

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

describe('TopBar', () => {
  beforeEach(() => {
    useUIStore.setState({
      activeView: 'mail',
      calendarWeekStart: '2026-03-02',
      activeAccounts: ['a1', 'a2'],
    })
  })

  it('should render account avatars in mail mode', () => {
    render(<TopBar activeAccounts={MOCK_ACCOUNTS} />)

    expect(screen.getByText('W')).toBeInTheDocument()
    expect(screen.getByText('P')).toBeInTheDocument()
  })

  it('should show calendar navigation in calendar mode', () => {
    useUIStore.setState({ activeView: 'calendar' })
    render(<TopBar activeAccounts={MOCK_ACCOUNTS} />)

    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('‹')).toBeInTheDocument()
    expect(screen.getByText('›')).toBeInTheDocument()
  })

  it('should show month name and week number in calendar mode', () => {
    useUIStore.setState({ activeView: 'calendar', calendarWeekStart: '2026-03-02' })
    render(<TopBar activeAccounts={MOCK_ACCOUNTS} />)

    expect(screen.getByText('March 2026')).toBeInTheDocument()
    expect(screen.getByText(/Week \d+/)).toBeInTheDocument()
  })

  it('should navigate to previous week on ‹ click', async () => {
    useUIStore.setState({ activeView: 'calendar', calendarWeekStart: '2026-03-09' })
    const user = userEvent.setup()
    render(<TopBar activeAccounts={MOCK_ACCOUNTS} />)

    await user.click(screen.getByText('‹'))
    expect(useUIStore.getState().calendarWeekStart).toBe('2026-03-02')
  })

  it('should navigate to next week on › click', async () => {
    useUIStore.setState({ activeView: 'calendar', calendarWeekStart: '2026-03-02' })
    const user = userEvent.setup()
    render(<TopBar activeAccounts={MOCK_ACCOUNTS} />)

    await user.click(screen.getByText('›'))
    expect(useUIStore.getState().calendarWeekStart).toBe('2026-03-09')
  })

  it('should navigate to today on Today click', async () => {
    useUIStore.setState({ activeView: 'calendar', calendarWeekStart: '2026-01-05' })
    const user = userEvent.setup()
    render(<TopBar activeAccounts={MOCK_ACCOUNTS} />)

    await user.click(screen.getByText('Today'))
    // Should jump to current week, not the old date
    expect(useUIStore.getState().calendarWeekStart).not.toBe('2026-01-05')
  })

  it('should render avatars in calendar mode too', () => {
    useUIStore.setState({ activeView: 'calendar' })
    render(<TopBar activeAccounts={MOCK_ACCOUNTS} />)

    expect(screen.getByText('W')).toBeInTheDocument()
    expect(screen.getByText('P')).toBeInTheDocument()
  })

  it('should render with no accounts', () => {
    render(<TopBar activeAccounts={[]} />)

    // Should render without crashing
    expect(document.querySelector('[class*="topBar"]')).toBeInTheDocument()
  })
})
