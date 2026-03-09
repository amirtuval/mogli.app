import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Account, Calendar } from '../types/models'
import { useUIStore } from '../store/uiStore'
import EventModal from '../components/EventModal'

const MOCK_ACCOUNTS: Account[] = [
  {
    id: 'a1',
    email: 'work@test.com',
    display_name: 'Work',
    color: '#4f9cf9',
    history_id: '',
  },
]

const MOCK_CALENDARS: Calendar[] = [
  {
    id: 'cal1',
    account_id: 'a1',
    name: 'Work Calendar',
    color: '#4f9cf9',
    primary: true,
    enabled: true,
  },
  {
    id: 'cal2',
    account_id: 'a1',
    name: 'Holidays',
    color: '#34d399',
    primary: false,
    enabled: true,
  },
]

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('EventModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUIStore.setState({
      showEventModal: true,
      eventModalDefaults: null,
    })
  })

  it('should render with "New Event" title', () => {
    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onCreated={vi.fn()} />,
    )

    expect(screen.getByText('New Event')).toBeInTheDocument()
  })

  it('should pre-fill date and time from defaults', () => {
    useUIStore.setState({
      showEventModal: true,
      eventModalDefaults: { date: '2026-03-15', startTime: '10:00', endTime: '11:00' },
    })

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onCreated={vi.fn()} />,
    )

    const dateInput = screen.getByDisplayValue('2026-03-15')
    expect(dateInput).toBeInTheDocument()

    const startInput = screen.getByDisplayValue('10:00')
    expect(startInput).toBeInTheDocument()

    const endInput = screen.getByDisplayValue('11:00')
    expect(endInput).toBeInTheDocument()
  })

  it('should show title validation error on empty submit', async () => {
    const user = userEvent.setup()

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onCreated={vi.fn()} />,
    )

    await user.click(screen.getByText('Save'))

    expect(screen.getByText('Title is required')).toBeInTheDocument()
  })

  it('should close modal on Discard click', async () => {
    const user = userEvent.setup()

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onCreated={vi.fn()} />,
    )

    await user.click(screen.getByText('Discard'))

    const state = useUIStore.getState()
    expect(state.showEventModal).toBe(false)
    expect(state.eventModalDefaults).toBeNull()
  })

  it('should hide time inputs when all-day is checked', async () => {
    const user = userEvent.setup()

    useUIStore.setState({
      showEventModal: true,
      eventModalDefaults: { date: '2026-03-15', startTime: '10:00', endTime: '11:00' },
    })

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onCreated={vi.fn()} />,
    )

    // Time inputs should be visible initially
    expect(screen.getByDisplayValue('10:00')).toBeInTheDocument()
    expect(screen.getByDisplayValue('11:00')).toBeInTheDocument()

    // Toggle all-day
    await user.click(screen.getByLabelText('All day'))

    // Time inputs should be hidden
    expect(screen.queryByDisplayValue('10:00')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('11:00')).not.toBeInTheDocument()
  })

  it('should default to primary calendar', () => {
    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onCreated={vi.fn()} />,
    )

    // The primary calendar name should appear in the selector button
    expect(screen.getByText('Work Calendar')).toBeInTheDocument()
  })
})
