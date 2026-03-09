import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Account, Calendar } from '../types/models'
import { useUIStore } from '../store/uiStore'
import Sidebar from '../components/Sidebar'

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

const MOCK_CALENDARS: Calendar[] = [
  {
    id: 'cal1',
    account_id: 'a1',
    name: 'Work Calendar',
    color: '#4f9cf9',
    enabled: true,
    primary: true,
  },
]

function renderSidebar(props?: Partial<React.ComponentProps<typeof Sidebar>>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <Sidebar
        accounts={props?.accounts ?? MOCK_ACCOUNTS}
        unreadCount={props?.unreadCount ?? 3}
        calendars={props?.calendars ?? MOCK_CALENDARS}
      />
    </QueryClientProvider>,
  )
}

describe('Sidebar', () => {
  beforeEach(() => {
    useUIStore.setState({
      theme: 'dark',
      activeView: 'mail',
      activeAccounts: ['a1', 'a2'],
      selectedLabel: 'INBOX',
      weekStartDay: 1,
    })
  })

  it('should render logo and theme buttons', () => {
    renderSidebar()

    expect(screen.getByText('Mogly')).toBeInTheDocument()
    // Three theme buttons (light, dark, ultraDark)
    expect(screen.getByTitle('Light')).toBeInTheDocument()
    expect(screen.getByTitle('Dark')).toBeInTheDocument()
    expect(screen.getByTitle('Ultra Dark')).toBeInTheDocument()
  })

  it('should render mail and calendar navigation buttons', () => {
    renderSidebar()

    expect(screen.getByText('Mail')).toBeInTheDocument()
    expect(screen.getByText('Calendar')).toBeInTheDocument()
  })

  it('should show unread badge on mail nav button and inbox label', () => {
    renderSidebar({ unreadCount: 5 })

    // Badge appears on both the nav button and the Inbox label
    const badges = screen.getAllByText('5')
    expect(badges).toHaveLength(2)
  })

  it('should render account list', () => {
    renderSidebar()

    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('Personal')).toBeInTheDocument()
    expect(screen.getByText('work@test.com')).toBeInTheDocument()
    expect(screen.getByText('personal@test.com')).toBeInTheDocument()
  })

  it('should toggle account on click', async () => {
    const user = userEvent.setup()
    renderSidebar()

    await user.click(screen.getByText('Work'))
    // a1 should now be toggled off
    expect(useUIStore.getState().activeAccounts).not.toContain('a1')
  })

  it('should show labels in mail mode', () => {
    renderSidebar()

    expect(screen.getByText('Inbox')).toBeInTheDocument()
    expect(screen.getByText('Starred')).toBeInTheDocument()
    expect(screen.getByText('Sent')).toBeInTheDocument()
    expect(screen.getByText('Drafts')).toBeInTheDocument()
  })

  it('should switch to calendar view on calendar nav click', async () => {
    const user = userEvent.setup()
    renderSidebar()

    await user.click(screen.getByText('Calendar'))
    expect(useUIStore.getState().activeView).toBe('calendar')
  })

  it('should show week start toggle in calendar mode', () => {
    useUIStore.setState({ activeView: 'calendar' })
    renderSidebar()

    expect(screen.getByText('Week starts on')).toBeInTheDocument()
    expect(screen.getByText('Sun')).toBeInTheDocument()
    expect(screen.getByText('Mon')).toBeInTheDocument()
  })

  it('should change selected label on click', async () => {
    const user = userEvent.setup()
    renderSidebar()

    await user.click(screen.getByText('Starred'))
    expect(useUIStore.getState().selectedLabel).toBe('STARRED')
  })

  it('should show add account button', () => {
    renderSidebar()

    expect(screen.getByText('+ Add account')).toBeInTheDocument()
  })

  it('should show Compose button in mail mode', () => {
    useUIStore.setState({ activeView: 'mail' })
    renderSidebar()

    expect(screen.getByText('+ Compose')).toBeInTheDocument()
  })

  it('should not show Compose button in calendar mode', () => {
    useUIStore.setState({ activeView: 'calendar' })
    renderSidebar()

    expect(screen.queryByText('+ Compose')).not.toBeInTheDocument()
  })

  it('should open compose modal when Compose is clicked', async () => {
    const user = userEvent.setup()
    useUIStore.setState({ activeView: 'mail' })
    renderSidebar()

    await user.click(screen.getByText('+ Compose'))

    const state = useUIStore.getState()
    expect(state.showCompose).toBe(true)
    expect(state.composeContext).toEqual({ mode: 'new' })
  })
})
