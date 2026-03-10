import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { invoke } from '@tauri-apps/api/core'
import type { ActiveReminder } from '../types/models'
import { useUIStore } from '../store/uiStore'
import ReminderPopup from '../components/ReminderPopup'

const mockedInvoke = vi.mocked(invoke)

const MOCK_REMINDER: ActiveReminder = {
  eventId: 'ev-1',
  title: 'Team Standup',
  start: Math.floor(Date.now() / 1000) + 300, // 5 min from now
  calendarName: 'Work',
  calendarColor: '#4f9cf9',
  minutesUntil: 5,
  receivedAt: Date.now(),
}

const MOCK_REMINDER_2: ActiveReminder = {
  eventId: 'ev-2',
  title: 'Lunch Break',
  start: Math.floor(Date.now() / 1000) + 600,
  calendarName: 'Personal',
  calendarColor: '#f97316',
  minutesUntil: 10,
  receivedAt: Date.now(),
}

describe('ReminderPopup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUIStore.setState({ activeReminders: [] })
  })

  it('renders nothing when there are no reminders', () => {
    const { container } = render(<ReminderPopup />)
    expect(container.querySelector('[data-testid="reminder-popup"]')).toBeNull()
  })

  it('renders a reminder card with title and calendar name', () => {
    useUIStore.setState({ activeReminders: [MOCK_REMINDER] })
    render(<ReminderPopup />)

    expect(screen.getByText('Team Standup')).toBeInTheDocument()
    expect(screen.getByText('Work')).toBeInTheDocument()
  })

  it('renders multiple reminder cards', () => {
    useUIStore.setState({ activeReminders: [MOCK_REMINDER, MOCK_REMINDER_2] })
    render(<ReminderPopup />)

    expect(screen.getByText('Team Standup')).toBeInTheDocument()
    expect(screen.getByText('Lunch Break')).toBeInTheDocument()
  })

  it('dismisses a reminder when ✕ is clicked', async () => {
    const user = userEvent.setup()
    useUIStore.setState({ activeReminders: [MOCK_REMINDER] })
    render(<ReminderPopup />)

    const dismissBtn = screen.getByRole('button', { name: 'Dismiss' })
    await user.click(dismissBtn)

    expect(useUIStore.getState().activeReminders).toHaveLength(0)
    expect(mockedInvoke).toHaveBeenCalledWith('dismiss_reminder', { eventId: 'ev-1' })
  })

  it('shows snooze dropdown and snoozes for selected duration', async () => {
    const user = userEvent.setup()
    useUIStore.setState({ activeReminders: [MOCK_REMINDER] })
    render(<ReminderPopup />)

    const snoozeBtn = screen.getByText('Snooze ▾')
    await user.click(snoozeBtn)

    // Snooze dropdown should appear
    expect(screen.getByText('5 min')).toBeInTheDocument()
    expect(screen.getByText('10 min')).toBeInTheDocument()
    expect(screen.getByText('15 min')).toBeInTheDocument()
    expect(screen.getByText('30 min')).toBeInTheDocument()
    expect(screen.getByText('1 hour')).toBeInTheDocument()

    await user.click(screen.getByText('10 min'))

    // Reminder should be removed from active list
    expect(useUIStore.getState().activeReminders).toHaveLength(0)
    // Backend should be called with snooze
    expect(mockedInvoke).toHaveBeenCalledWith('snooze_reminder', {
      eventId: 'ev-1',
      snoozeMinutes: 10,
    })
  })

  it('shows time text for upcoming events', () => {
    useUIStore.setState({ activeReminders: [MOCK_REMINDER] })
    render(<ReminderPopup />)

    // Should show "Starting in X min" text
    const popup = screen.getByTestId('reminder-popup')
    const timeText = within(popup).getByText(/starting in/i)
    expect(timeText).toBeInTheDocument()
  })

  it('deduplicates reminders in the store', () => {
    const payload = {
      event_id: 'ev-1',
      title: 'Team Standup',
      start: Math.floor(Date.now() / 1000) + 300,
      calendar_name: 'Work',
      calendar_color: '#4f9cf9',
      minutes_until: 5,
    }

    useUIStore.getState().addReminder(payload)
    useUIStore.getState().addReminder(payload) // duplicate

    expect(useUIStore.getState().activeReminders).toHaveLength(1)
  })

  it('limits display to 5 reminder cards', () => {
    const reminders = Array.from({ length: 7 }, (_, i) => ({
      ...MOCK_REMINDER,
      eventId: `ev-${i}`,
      title: `Event ${i}`,
    }))
    useUIStore.setState({ activeReminders: reminders })
    render(<ReminderPopup />)

    const popup = screen.getByTestId('reminder-popup')
    // Direct children of the container are the card elements
    const cards = popup.querySelectorAll(':scope > div')
    expect(cards).toHaveLength(5)
  })

  it('applies calendar color to the card border', () => {
    useUIStore.setState({ activeReminders: [MOCK_REMINDER] })
    render(<ReminderPopup />)

    const popup = screen.getByTestId('reminder-popup')
    const card = popup.querySelector('[class*="card"]') as HTMLElement
    expect(card.style.borderLeft).toBe('3px solid rgb(79, 156, 249)')
  })
})
