import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import type { Account, Calendar } from '../types/models'
import CalendarList from '../components/CalendarList'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

const MOCK_ACCOUNTS: Account[] = [
  {
    id: 'a1',
    email: 'work@example.com',
    display_name: 'Work',
    color: '#4f9cf9',
    history_id: '1',
    auth_expired: false,
  },
  {
    id: 'a2',
    email: 'personal@example.com',
    display_name: 'Personal',
    color: '#f97316',
    history_id: '1',
    auth_expired: false,
  },
]

const MOCK_CALENDARS: Calendar[] = [
  {
    id: 'primary',
    account_id: 'a1',
    name: 'Work Calendar',
    color: '#4f9cf9',
    enabled: true,
    primary: true,
  },
  {
    id: 'team@cal',
    account_id: 'a1',
    name: 'Team Calendar',
    color: '#34d399',
    enabled: true,
    primary: false,
  },
  {
    id: 'primary',
    account_id: 'a2',
    name: 'Personal Calendar',
    color: '#f97316',
    enabled: false,
    primary: true,
  },
]

describe('CalendarList', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
    vi.mocked(invoke).mockResolvedValue(undefined)
  })

  it('renders calendars grouped by account', () => {
    render(
      <Wrapper>
        <CalendarList accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} />
      </Wrapper>,
    )

    expect(screen.getByText('Work')).toBeDefined()
    expect(screen.getByText('Personal')).toBeDefined()
    expect(screen.getByText('Work Calendar')).toBeDefined()
    expect(screen.getByText('Team Calendar')).toBeDefined()
    expect(screen.getByText('Personal Calendar')).toBeDefined()
  })

  it('renders the "Calendars" section label', () => {
    render(
      <Wrapper>
        <CalendarList accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} />
      </Wrapper>,
    )

    expect(screen.getByText('Calendars')).toBeDefined()
  })

  it('calls set_calendar_enabled when clicking a calendar toggle', async () => {
    render(
      <Wrapper>
        <CalendarList accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} />
      </Wrapper>,
    )

    // Click the "Work Calendar" row to toggle it off
    const calendarItem = screen.getByText('Work Calendar')
    fireEvent.click(calendarItem.closest('[class*="calendarItem"]')!)

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('set_calendar_enabled', {
        accountId: 'a1',
        calendarId: 'primary',
        enabled: false,
      })
    })
  })

  it('shows checkmark for enabled calendars and account headers', () => {
    const { container } = render(
      <Wrapper>
        <CalendarList accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} />
      </Wrapper>,
    )

    const checkedBoxes = container.querySelectorAll('[class*="checkboxChecked"]')
    // Work account header (all enabled) + Work Calendar + Team Calendar = 3 checked
    // Personal account header is also "checked" (partial/dash) since it's not "noneEnabled"
    // Personal Calendar is disabled → not checked
    // Actually: Work header (allEnabled) + Work Cal + Team Cal = 3 checked
    // Personal header: noneEnabled=true, so NOT checked. Personal Cal: disabled, NOT checked.
    expect(checkedBoxes.length).toBe(3)
  })

  it('toggles all calendars in an account when clicking account header', async () => {
    render(
      <Wrapper>
        <CalendarList accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} />
      </Wrapper>,
    )

    // Click "Work" account header to toggle all Work calendars off
    const workHeader = screen.getByText('Work').closest('[class*="accountHeader"]')!
    fireEvent.click(workHeader)

    // Should call set_calendar_enabled for each enabled calendar in the Work account
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('set_calendar_enabled', {
        accountId: 'a1',
        calendarId: 'primary',
        enabled: false,
      })
      expect(invoke).toHaveBeenCalledWith('set_calendar_enabled', {
        accountId: 'a1',
        calendarId: 'team@cal',
        enabled: false,
      })
    })
  })

  it('enables all calendars in an account when some are disabled', async () => {
    // Personal account has its calendar disabled
    render(
      <Wrapper>
        <CalendarList accounts={MOCK_ACCOUNTS} calendars={MOCK_CALENDARS} />
      </Wrapper>,
    )

    // Click "Personal" account header to enable all
    const personalHeader = screen.getByText('Personal').closest('[class*="accountHeader"]')!
    fireEvent.click(personalHeader)

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('set_calendar_enabled', {
        accountId: 'a2',
        calendarId: 'primary',
        enabled: true,
      })
    })
  })

  it('does not render account groups with no calendars', () => {
    const accountsWithExtra: Account[] = [
      ...MOCK_ACCOUNTS,
      {
        id: 'a3',
        email: 'extra@example.com',
        display_name: 'Extra',
        color: '#a78bfa',
        history_id: '1',
        auth_expired: false,
      },
    ]

    render(
      <Wrapper>
        <CalendarList accounts={accountsWithExtra} calendars={MOCK_CALENDARS} />
      </Wrapper>,
    )

    // a3 has no calendars, so "Extra" should not appear as an account header
    expect(screen.queryByText('Extra')).toBeNull()
  })
})
