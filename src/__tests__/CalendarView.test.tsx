import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useUIStore } from '../store/uiStore'
import type { CalEvent, Account } from '../types/models'
import CalendarView from '../components/CalendarView'

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
  },
  {
    id: 'a2',
    email: 'personal@example.com',
    display_name: 'Personal',
    color: '#f97316',
    history_id: '1',
  },
]

// Create events on a known Monday week (2026-03-02 is a Monday)
const MONDAY = '2026-03-02'

function makeEvent(overrides: Partial<CalEvent> = {}): CalEvent {
  return {
    id: 'ev1',
    account_id: 'a1',
    calendar_id: 'primary',
    title: 'Test Event',
    // Wednesday 2026-03-04 09:00 UTC
    start: new Date('2026-03-04T09:00:00Z').getTime() / 1000,
    end: new Date('2026-03-04T10:00:00Z').getTime() / 1000,
    all_day: false,
    location: null,
    description: null,
    color: null,
    ...overrides,
  }
}

describe('CalendarView', () => {
  beforeEach(() => {
    useUIStore.setState({
      theme: 'dark',
      activeView: 'calendar',
      calendarWeekStart: MONDAY,
      weekStartDay: 1,
    })
  })

  it('renders 7 day headers with correct names from dates', () => {
    render(
      <Wrapper>
        <CalendarView events={[]} accounts={MOCK_ACCOUNTS} isLoading={false} />
      </Wrapper>,
    )

    // Day names are derived from the actual dates via toLocaleDateString
    const start = new Date(MONDAY + 'T00:00:00')
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const name = d.toLocaleDateString(undefined, { weekday: 'short' })
      expect(screen.getByText(name)).toBeDefined()
    }
  })

  it('renders time slots 07:00–21:00', () => {
    render(
      <Wrapper>
        <CalendarView events={[]} accounts={MOCK_ACCOUNTS} isLoading={false} />
      </Wrapper>,
    )

    expect(screen.getByText('07:00')).toBeDefined()
    expect(screen.getByText('12:00')).toBeDefined()
    expect(screen.getByText('22:00')).toBeDefined()
  })

  it('renders timed events with title', () => {
    const events = [makeEvent({ title: 'Q2 Roadmap Sync' })]

    render(
      <Wrapper>
        <CalendarView events={events} accounts={MOCK_ACCOUNTS} isLoading={false} />
      </Wrapper>,
    )

    expect(screen.getAllByText('Q2 Roadmap Sync').length).toBeGreaterThan(0)
  })

  it('renders all-day events in the strip', () => {
    const events = [
      makeEvent({
        id: 'ad1',
        title: 'Holiday',
        start: new Date('2026-03-04T00:00:00Z').getTime() / 1000,
        end: new Date('2026-03-05T00:00:00Z').getTime() / 1000,
        all_day: true,
      }),
    ]

    render(
      <Wrapper>
        <CalendarView events={events} accounts={MOCK_ACCOUNTS} isLoading={false} />
      </Wrapper>,
    )

    expect(screen.getAllByText('Holiday').length).toBeGreaterThan(0)
  })

  it('treats events spanning 24h+ as all-day even if all_day is false', () => {
    const events = [
      makeEvent({
        id: 'holiday1',
        title: 'Purim',
        start: new Date('2026-03-04T00:00:00Z').getTime() / 1000,
        end: new Date('2026-03-05T00:00:00Z').getTime() / 1000,
        all_day: false, // Holiday calendar may not set this
      }),
    ]

    const { container } = render(
      <Wrapper>
        <CalendarView events={events} accounts={MOCK_ACCOUNTS} isLoading={false} />
      </Wrapper>,
    )

    // Should appear in the all-day strip, not as a timed event block
    expect(container.querySelector('[class*="allDayEvent"]')).toBeDefined()
    expect(container.querySelector('[class*="allDayEvent"]')?.textContent).toContain('Purim')
  })

  it('shows loading state', () => {
    render(
      <Wrapper>
        <CalendarView events={undefined} accounts={MOCK_ACCOUNTS} isLoading={true} />
      </Wrapper>,
    )

    expect(screen.getByText('Loading calendar…')).toBeDefined()
  })

  it('positions timed events using correct top offset', () => {
    // CalendarView uses local getHours(), so create an event at a known local time
    const startLocal = new Date(2026, 2, 4, 9, 0, 0) // Mar 4 2026, 09:00 local
    const endLocal = new Date(2026, 2, 4, 10, 0, 0) // Mar 4 2026, 10:00 local
    const events = [
      makeEvent({
        start: startLocal.getTime() / 1000,
        end: endLocal.getTime() / 1000,
      }),
    ]

    const { container } = render(
      <Wrapper>
        <CalendarView events={events} accounts={MOCK_ACCOUNTS} isLoading={false} />
      </Wrapper>,
    )

    const eventBlock = container.querySelector('[class*="eventBlock"]') as HTMLElement
    expect(eventBlock).toBeDefined()
    // 09:00 local → top = 9 * 56 = 504px
    expect(eventBlock.style.top).toBe('504px')
    // 1 hour = 56px - 2 = 54px height
    expect(eventBlock.style.height).toBe('54px')
  })

  it('renders multiple events from different accounts', () => {
    const events = [
      makeEvent({ id: 'ev1', title: 'Work Meeting', account_id: 'a1' }),
      makeEvent({
        id: 'ev2',
        title: 'Personal Gym',
        account_id: 'a2',
        start: new Date('2026-03-04T07:00:00Z').getTime() / 1000,
        end: new Date('2026-03-04T08:00:00Z').getTime() / 1000,
      }),
    ]

    render(
      <Wrapper>
        <CalendarView events={events} accounts={MOCK_ACCOUNTS} isLoading={false} />
      </Wrapper>,
    )

    expect(screen.getAllByText('Work Meeting').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Personal Gym').length).toBeGreaterThan(0)
  })

  it('renders overlapping events side-by-side', () => {
    const startLocal = new Date(2026, 2, 4, 10, 0, 0) // Mar 4 2026, 10:00 local
    const endLocal = new Date(2026, 2, 4, 11, 0, 0) // Mar 4 2026, 11:00 local
    const events = [
      makeEvent({
        id: 'ev1',
        title: 'Meeting A',
        start: startLocal.getTime() / 1000,
        end: endLocal.getTime() / 1000,
      }),
      makeEvent({
        id: 'ev2',
        title: 'Meeting B',
        start: startLocal.getTime() / 1000,
        end: endLocal.getTime() / 1000,
      }),
    ]

    const { container } = render(
      <Wrapper>
        <CalendarView events={events} accounts={MOCK_ACCOUNTS} isLoading={false} />
      </Wrapper>,
    )

    const blocks = container.querySelectorAll('[class*="eventBlock"]') as NodeListOf<HTMLElement>
    expect(blocks.length).toBe(2)

    // They should have different left positions (side by side, not stacked)
    const lefts = Array.from(blocks).map((b) => b.style.left)
    expect(lefts[0]).not.toBe(lefts[1])

    // Each should be ~50% width
    const widths = Array.from(blocks).map((b) => b.style.width)
    expect(widths[0]).toContain('50%')
    expect(widths[1]).toContain('50%')
  })

  it('highlights today column with special day number styling', () => {
    // Set week to contain today
    const now = new Date()
    const day = now.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(now)
    monday.setDate(now.getDate() + diff)
    const todayWeek = monday.toISOString().slice(0, 10)

    useUIStore.setState({ calendarWeekStart: todayWeek })

    const { container } = render(
      <Wrapper>
        <CalendarView events={[]} accounts={MOCK_ACCOUNTS} isLoading={false} />
      </Wrapper>,
    )

    // There should be exactly one element with the dayNumberToday class
    const todayHighlighted = container.querySelectorAll('[class*="dayNumberToday"]')
    expect(todayHighlighted.length).toBe(1)
    expect(todayHighlighted[0].textContent).toBe(now.getDate().toString())
  })

  // ── Drag & drop tests ──

  it('renders resize handles on timed event blocks', () => {
    const startLocal = new Date(2026, 2, 4, 9, 0, 0)
    const endLocal = new Date(2026, 2, 4, 10, 0, 0)
    const events = [
      makeEvent({
        start: startLocal.getTime() / 1000,
        end: endLocal.getTime() / 1000,
      }),
    ]

    render(
      <Wrapper>
        <CalendarView events={events} accounts={MOCK_ACCOUNTS} isLoading={false} />
      </Wrapper>,
    )

    const handle = screen.getByTestId('resize-handle-ev1')
    expect(handle).toBeDefined()
  })

  it('does not render resize handles on all-day events', () => {
    const events = [
      makeEvent({
        id: 'ad1',
        title: 'Holiday',
        start: new Date('2026-03-04T00:00:00Z').getTime() / 1000,
        end: new Date('2026-03-05T00:00:00Z').getTime() / 1000,
        all_day: true,
      }),
    ]

    render(
      <Wrapper>
        <CalendarView events={events} accounts={MOCK_ACCOUNTS} isLoading={false} />
      </Wrapper>,
    )

    expect(screen.queryByTestId('resize-handle-ad1')).toBeNull()
  })

  it('renders event blocks with data-testid for drag interaction', () => {
    const startLocal = new Date(2026, 2, 4, 14, 0, 0)
    const endLocal = new Date(2026, 2, 4, 15, 0, 0)
    const events = [
      makeEvent({
        id: 'ev-drag',
        title: 'Draggable Event',
        start: startLocal.getTime() / 1000,
        end: endLocal.getTime() / 1000,
      }),
    ]

    render(
      <Wrapper>
        <CalendarView events={events} accounts={MOCK_ACCOUNTS} isLoading={false} />
      </Wrapper>,
    )

    const block = screen.getByTestId('event-block-ev-drag')
    expect(block).toBeDefined()
    expect(block.textContent).toContain('Draggable Event')
  })
})
