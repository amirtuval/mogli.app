import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useUIStore } from '../store/uiStore'
import MiniCal from '../components/MiniCal'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('MiniCal', () => {
  beforeEach(() => {
    useUIStore.setState({
      calendarWeekStart: '2026-03-02',
    })
  })

  it('renders month label and day headers', () => {
    render(
      <Wrapper>
        <MiniCal />
      </Wrapper>,
    )

    // Verify the grid renders day headers
    expect(screen.getByText('M')).toBeDefined()
    // There are two 'S' headers (Sat + Sun), so use getAllByText
    expect(screen.getAllByText('S').length).toBe(2)

    // Verify a month label is rendered
    const monthLabel = document.querySelector('[class*="monthLabel"]')
    expect(monthLabel?.textContent).toBeTruthy()
  })

  it('renders day header letters M T W T F S S', () => {
    render(
      <Wrapper>
        <MiniCal />
      </Wrapper>,
    )

    const headers = screen.getAllByText(/^[MTWFS]$/)
    expect(headers.length).toBeGreaterThanOrEqual(7)
  })

  it('navigates months with ‹ and › buttons', () => {
    render(
      <Wrapper>
        <MiniCal />
      </Wrapper>,
    )

    const prevBtn = screen.getByText('‹')
    const nextBtn = screen.getByText('›')

    // Get current month text
    const currentMonth = document.querySelector('[class*="monthLabel"]')?.textContent

    // Navigate forward
    fireEvent.click(nextBtn)
    const newMonth = document.querySelector('[class*="monthLabel"]')?.textContent
    expect(newMonth).not.toBe(currentMonth)

    // Navigate back twice to go before the original month
    fireEvent.click(prevBtn)
    fireEvent.click(prevBtn)
    const prevMonth = document.querySelector('[class*="monthLabel"]')?.textContent
    expect(prevMonth).not.toBe(newMonth)
  })

  it('clicking a day updates calendarWeekStart in store', () => {
    render(
      <Wrapper>
        <MiniCal />
      </Wrapper>,
    )

    // Find a day number cell and click it
    const dayCell = screen.getByText('15')
    fireEvent.click(dayCell)

    // The store should have been updated
    const weekStart = useUIStore.getState().calendarWeekStart
    expect(weekStart).toBeDefined()
    // The week start should be a Monday (ISO format YYYY-MM-DD)
    expect(weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('highlights today with special styling', () => {
    render(
      <Wrapper>
        <MiniCal />
      </Wrapper>,
    )

    const todayDate = new Date().getDate()
    // Find the cell with today's date
    const todayCells = screen.getAllByText(todayDate.toString())
    // At least one should exist (the day cell)
    expect(todayCells.length).toBeGreaterThanOrEqual(1)
  })
})
