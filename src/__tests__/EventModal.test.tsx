import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
    auth_expired: false,
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

  it('should render with "New Event" title in create mode', () => {
    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    expect(screen.getByText('New Event')).toBeInTheDocument()
  })

  it('should render with "Edit Event" title in edit mode', () => {
    useUIStore.setState({
      showEventModal: true,
      eventModalDefaults: {
        mode: 'edit',
        date: '2026-03-15',
        startTime: '10:00',
        endTime: '11:00',
        eventId: 'ev1',
        accountId: 'a1',
        calendarId: 'cal1',
        title: 'Existing Event',
      },
    })

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    expect(screen.getByText('Edit Event')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Existing Event')).toBeInTheDocument()
  })

  it('should pre-fill date and time from defaults', () => {
    useUIStore.setState({
      showEventModal: true,
      eventModalDefaults: {
        mode: 'create',
        date: '2026-03-15',
        startTime: '10:00',
        endTime: '11:00',
      },
    })

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    const dateInputs = screen.getAllByDisplayValue('2026-03-15')
    expect(dateInputs).toHaveLength(2) // start date + end date

    const startInput = screen.getByDisplayValue('10:00')
    expect(startInput).toBeInTheDocument()

    const endInput = screen.getByDisplayValue('11:00')
    expect(endInput).toBeInTheDocument()
  })

  it('should show title validation error on empty submit', async () => {
    const user = userEvent.setup()

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    await user.click(screen.getByText('Save'))

    expect(screen.getByText('Title is required')).toBeInTheDocument()
  })

  it('should close modal on Discard click', async () => {
    const user = userEvent.setup()

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
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
      eventModalDefaults: {
        mode: 'create',
        date: '2026-03-15',
        startTime: '10:00',
        endTime: '11:00',
      },
    })

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
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
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    // The primary calendar name should appear in the selector button
    expect(screen.getByText('Work Calendar')).toBeInTheDocument()
  })

  it('should render Repeat dropdown with recurrence options', () => {
    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    expect(screen.getByText('Repeat')).toBeInTheDocument()
    expect(screen.getByText('Does not repeat')).toBeInTheDocument()
    expect(screen.getByText('Daily')).toBeInTheDocument()
    expect(screen.getByText('Weekly')).toBeInTheDocument()
    expect(screen.getByText('Monthly')).toBeInTheDocument()
    expect(screen.getByText('Yearly')).toBeInTheDocument()
  })

  it('should render Reminders section with default reminder', () => {
    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    expect(screen.getByText('Reminders')).toBeInTheDocument()
    expect(screen.getByText('+ Add reminder')).toBeInTheDocument()
  })

  it('should add and remove reminders', async () => {
    const user = userEvent.setup()

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    // Initially one reminder, no remove button (since there's only 1)
    const addBtn = screen.getByText('+ Add reminder')
    await user.click(addBtn)

    // Now two reminders — remove buttons should appear
    const removeBtns = screen.getAllByText('✕')
    // Filter to only the reminder remove buttons (not the close button)
    const reminderRemoveBtns = removeBtns.filter((btn) =>
      btn.classList.toString().includes('removeReminder'),
    )
    expect(reminderRemoveBtns.length).toBe(2)

    // Remove one
    await user.click(reminderRemoveBtns[0])

    // Back to one reminder — no remove button
    const afterRemoveBtns = screen
      .getAllByText('✕')
      .filter((btn) => btn.classList.toString().includes('removeReminder'))
    expect(afterRemoveBtns.length).toBe(0)
  })

  it('should show Delete button only in edit mode', () => {
    // Create mode — no delete button
    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  })

  it('should show Delete button in edit mode', () => {
    useUIStore.setState({
      showEventModal: true,
      eventModalDefaults: {
        mode: 'edit',
        date: '2026-03-15',
        startTime: '10:00',
        endTime: '11:00',
        eventId: 'ev1',
        accountId: 'a1',
        calendarId: 'cal1',
        title: 'Test',
      },
    })

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('should allow changing recurrence to Weekly', async () => {
    const user = userEvent.setup()

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    const repeatSelect = screen.getByDisplayValue('Does not repeat')
    await user.selectOptions(repeatSelect, 'weekly')

    expect((repeatSelect as HTMLSelectElement).value).toBe('weekly')
  })

  it('should preserve event duration when changing start time', () => {
    useUIStore.setState({
      showEventModal: true,
      eventModalDefaults: {
        mode: 'create',
        date: '2026-03-10',
        startTime: '10:00',
        endTime: '11:30',
      },
    })

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    const startInput = screen.getByDisplayValue('10:00') as HTMLInputElement
    const endInput = screen.getByDisplayValue('11:30') as HTMLInputElement

    // Change start time from 10:00 to 14:00 — end should adjust to 15:30
    fireEvent.change(startInput, { target: { value: '14:00' } })

    // End time should have been adjusted to maintain the 1.5h duration
    expect(endInput.value).toBe('15:30')
  })

  it('should not change start time when changing end time', () => {
    useUIStore.setState({
      showEventModal: true,
      eventModalDefaults: {
        mode: 'create',
        date: '2026-03-10',
        startTime: '10:00',
        endTime: '11:30',
      },
    })

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    const startInput = screen.getByDisplayValue('10:00') as HTMLInputElement
    const endInput = screen.getByDisplayValue('11:30') as HTMLInputElement

    // Change end time — start should stay unchanged
    fireEvent.change(endInput, { target: { value: '13:00' } })

    expect(startInput.value).toBe('10:00')
  })

  it('should close modal when Escape key is pressed', async () => {
    const user = userEvent.setup()

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    await user.keyboard('{Escape}')

    const state = useUIStore.getState()
    expect(state.showEventModal).toBe(false)
    expect(state.eventModalDefaults).toBeNull()
  })

  it('should attempt save when Ctrl+Enter is pressed', async () => {
    const user = userEvent.setup()

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    // With empty title, Ctrl+Enter should trigger validation error
    await user.keyboard('{Control>}{Enter}{/Control}')

    expect(screen.getByText('Title is required')).toBeInTheDocument()
  })

  it('should render the Guests section with input', () => {
    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    expect(screen.getByText('Guests')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Add guest email')).toBeInTheDocument()
    expect(screen.getByText('Add')).toBeInTheDocument()
  })

  it('should add and remove guests', async () => {
    const user = userEvent.setup()

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    const guestInput = screen.getByPlaceholderText('Add guest email')

    await user.type(guestInput, 'alice@example.com')
    await user.click(screen.getByText('Add'))

    // Email appears in guest chip (and possibly availability row)
    expect(screen.getAllByText('alice@example.com').length).toBeGreaterThanOrEqual(1)
    expect((guestInput as HTMLInputElement).value).toBe('')

    // Add another guest
    await user.type(guestInput, 'bob@example.com')
    await user.click(screen.getByText('Add'))

    expect(screen.getAllByText('bob@example.com').length).toBeGreaterThanOrEqual(1)

    // Remove first guest using the ✕ button next to their email
    const removeButtons = screen
      .getAllByText('✕')
      .filter((btn) => btn.classList.toString().includes('removeGuest'))
    expect(removeButtons.length).toBe(2)

    await user.click(removeButtons[0])
    // After removal, alice should not appear in guest chips
    const aliceChips = screen
      .queryAllByText('alice@example.com')
      .filter((el) => el.closest('[class*="guestChip"]'))
    expect(aliceChips.length).toBe(0)
    expect(screen.getAllByText('bob@example.com').length).toBeGreaterThanOrEqual(1)
  })

  it('should not add duplicate or invalid guest emails', async () => {
    const user = userEvent.setup()

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    const guestInput = screen.getByPlaceholderText('Add guest email')

    // Add a valid guest
    await user.type(guestInput, 'alice@example.com')
    await user.click(screen.getByText('Add'))
    // Count guest chips specifically (email also appears in availability row)
    const chipsBefore = screen
      .getAllByText('alice@example.com')
      .filter((el) => el.closest('[class*="guestChip"]'))
    expect(chipsBefore.length).toBe(1)

    // Try adding the same email again
    await user.type(guestInput, 'alice@example.com')
    await user.click(screen.getByText('Add'))
    // Should still only have one guest chip
    const chipsAfter = screen
      .getAllByText('alice@example.com')
      .filter((el) => el.closest('[class*="guestChip"]'))
    expect(chipsAfter.length).toBe(1)

    // Try adding an invalid email
    await user.type(guestInput, 'not-an-email')
    await user.click(screen.getByText('Add'))
    expect(screen.queryByText('not-an-email')).not.toBeInTheDocument()
  })

  it('should add guest via Enter key', async () => {
    const user = userEvent.setup()

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    const guestInput = screen.getByPlaceholderText('Add guest email')

    await user.type(guestInput, 'carol@example.com{Enter}')
    expect(screen.getAllByText('carol@example.com').length).toBeGreaterThanOrEqual(1)
  })

  it('should show conference join link in edit mode when URL exists', () => {
    useUIStore.setState({
      showEventModal: true,
      eventModalDefaults: {
        mode: 'edit',
        date: '2026-03-15',
        startTime: '10:00',
        endTime: '11:00',
        eventId: 'ev1',
        accountId: 'a1',
        calendarId: 'cal1',
        title: 'Meeting',
        conferenceUrl: 'https://meet.google.com/abc-defg-hij',
      },
    })

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    expect(screen.getByText('▶ Join video call')).toBeInTheDocument()
  })

  it('should show existing attendees in edit mode', () => {
    useUIStore.setState({
      showEventModal: true,
      eventModalDefaults: {
        mode: 'edit',
        date: '2026-03-15',
        startTime: '10:00',
        endTime: '11:00',
        eventId: 'ev1',
        accountId: 'a1',
        calendarId: 'cal1',
        title: 'Team Meeting',
        attendees: [
          { email: 'alice@test.com', displayName: 'Alice', responseStatus: 'accepted' },
          { email: 'bob@test.com', responseStatus: 'needsAction' },
        ],
      },
    })

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    expect(screen.getByText('Alice (alice@test.com)')).toBeInTheDocument()
    expect(screen.getAllByText('bob@test.com').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('accepted')).toBeInTheDocument()
    expect(screen.getByText('needsAction')).toBeInTheDocument()
  })

  it('should show availability section when guests are present', async () => {
    const user = userEvent.setup()

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    // No availability panel without guests
    expect(screen.queryByTestId('availability-panel')).not.toBeInTheDocument()

    // Add a guest to trigger the availability panel
    const guestInput = screen.getByPlaceholderText('Add guest email')
    await user.type(guestInput, 'alice@example.com')
    await user.click(screen.getByText('Add'))

    expect(screen.getByTestId('availability-panel')).toBeInTheDocument()
  })

  it('should not show availability section for all-day events', () => {
    useUIStore.setState({
      showEventModal: true,
      eventModalDefaults: {
        mode: 'edit',
        date: '2026-03-15',
        allDay: true,
        eventId: 'ev1',
        accountId: 'a1',
        calendarId: 'cal1',
        title: 'All Day Event',
        attendees: [{ email: 'alice@test.com', responseStatus: 'accepted' }],
      },
    })

    renderWithQuery(
      <EventModal accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} onSaved={vi.fn()} />,
    )

    // Has a guest but is all-day, so no availability panel
    expect(screen.queryByTestId('availability-panel')).not.toBeInTheDocument()
  })
})
