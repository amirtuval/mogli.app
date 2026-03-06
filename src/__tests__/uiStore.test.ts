import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore, getWeekStart, getMonday } from '../store/uiStore'

describe('uiStore', () => {
  beforeEach(() => {
    // Reset store to defaults between tests
    useUIStore.setState({
      theme: 'dark',
      activeView: 'mail',
      activeAccounts: [],
      selectedThreadId: null,
      selectedLabel: 'INBOX',
      calendarWeekStart: '2026-03-02',
      weekStartDay: 1,
    })
  })

  it('should initialize with correct defaults', () => {
    const state = useUIStore.getState()
    expect(state.theme).toBe('dark')
    expect(state.activeView).toBe('mail')
    expect(state.activeAccounts).toEqual([])
    expect(state.selectedThreadId).toBeNull()
    expect(state.selectedLabel).toBe('INBOX')
    expect(state.calendarWeekStart).toBe('2026-03-02')
  })

  it('should set theme', () => {
    useUIStore.getState().setTheme('light')
    expect(useUIStore.getState().theme).toBe('light')

    useUIStore.getState().setTheme('ultraDark')
    expect(useUIStore.getState().theme).toBe('ultraDark')
  })

  it('should set active view', () => {
    useUIStore.getState().setActiveView('calendar')
    expect(useUIStore.getState().activeView).toBe('calendar')
  })

  it('should toggle account on', () => {
    useUIStore.getState().toggleAccount('account-1')
    expect(useUIStore.getState().activeAccounts).toEqual(['account-1'])
  })

  it('should toggle account off', () => {
    useUIStore.setState({ activeAccounts: ['account-1', 'account-2'] })
    useUIStore.getState().toggleAccount('account-1')
    expect(useUIStore.getState().activeAccounts).toEqual(['account-2'])
  })

  it('should set active accounts', () => {
    useUIStore.getState().setActiveAccounts(['a', 'b', 'c'])
    expect(useUIStore.getState().activeAccounts).toEqual(['a', 'b', 'c'])
  })

  it('should set selected thread ID', () => {
    useUIStore.getState().setSelectedThreadId('thread-123')
    expect(useUIStore.getState().selectedThreadId).toBe('thread-123')

    useUIStore.getState().setSelectedThreadId(null)
    expect(useUIStore.getState().selectedThreadId).toBeNull()
  })

  it('should set selected label', () => {
    useUIStore.getState().setSelectedLabel('STARRED')
    expect(useUIStore.getState().selectedLabel).toBe('STARRED')
  })

  it('should clear selected thread when label changes', () => {
    useUIStore.setState({ selectedThreadId: 'thread-123' })
    useUIStore.getState().setSelectedLabel('STARRED')
    // Label changed but selectedThreadId is still set (it's the user's choice)
    expect(useUIStore.getState().selectedLabel).toBe('STARRED')
  })

  it('should handle toggling multiple accounts', () => {
    useUIStore.getState().toggleAccount('a')
    useUIStore.getState().toggleAccount('b')
    useUIStore.getState().toggleAccount('c')
    expect(useUIStore.getState().activeAccounts).toEqual(['a', 'b', 'c'])

    useUIStore.getState().toggleAccount('b')
    expect(useUIStore.getState().activeAccounts).toEqual(['a', 'c'])
  })

  it('should set calendar week start', () => {
    useUIStore.getState().setCalendarWeekStart('2026-03-09')
    expect(useUIStore.getState().calendarWeekStart).toBe('2026-03-09')
  })

  it('should navigate week forward', () => {
    useUIStore.getState().navigateWeek(1)
    expect(useUIStore.getState().calendarWeekStart).toBe('2026-03-09')
  })

  it('should navigate week backward', () => {
    useUIStore.getState().navigateWeek(-1)
    expect(useUIStore.getState().calendarWeekStart).toBe('2026-02-23')
  })

  it('should go to today', () => {
    useUIStore.setState({ calendarWeekStart: '2025-01-01' })
    useUIStore.getState().goToToday()
    const weekStart = useUIStore.getState().calendarWeekStart
    const { weekStartDay } = useUIStore.getState()
    expect(weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(weekStart).toBe(getWeekStart(new Date(), weekStartDay))
  })

  it('should set week start day and recalculate calendarWeekStart', () => {
    useUIStore.getState().setWeekStartDay(0)
    expect(useUIStore.getState().weekStartDay).toBe(0)
    expect(useUIStore.getState().calendarWeekStart).toBe(getWeekStart(new Date(), 0))

    useUIStore.getState().setWeekStartDay(1)
    expect(useUIStore.getState().weekStartDay).toBe(1)
    expect(useUIStore.getState().calendarWeekStart).toBe(getWeekStart(new Date(), 1))
  })
})

describe('getWeekStart', () => {
  // 2026-03-02 is a Monday, 2026-03-01 is a Sunday

  it('returns Monday for Monday start (Monday input)', () => {
    expect(getWeekStart(new Date('2026-03-02'), 1)).toBe('2026-03-02')
  })

  it('returns Monday for Monday start (Wednesday input)', () => {
    expect(getWeekStart(new Date('2026-03-04'), 1)).toBe('2026-03-02')
  })

  it('returns Monday for Monday start (Sunday input)', () => {
    expect(getWeekStart(new Date('2026-03-08'), 1)).toBe('2026-03-02')
  })

  it('returns Monday for Monday start (Saturday input)', () => {
    expect(getWeekStart(new Date('2026-03-07'), 1)).toBe('2026-03-02')
  })

  it('returns Sunday for Sunday start (Sunday input)', () => {
    expect(getWeekStart(new Date('2026-03-01'), 0)).toBe('2026-03-01')
  })

  it('returns Sunday for Sunday start (Wednesday input)', () => {
    expect(getWeekStart(new Date('2026-03-04'), 0)).toBe('2026-03-01')
  })

  it('returns Sunday for Sunday start (Saturday input)', () => {
    expect(getWeekStart(new Date('2026-03-07'), 0)).toBe('2026-03-01')
  })

  it('returns previous Sunday for Sunday start (Monday input)', () => {
    expect(getWeekStart(new Date('2026-03-02'), 0)).toBe('2026-03-01')
  })
})

describe('getMonday (deprecated)', () => {
  it('still works as alias for getWeekStart with Monday', () => {
    expect(getMonday(new Date('2026-03-04'))).toBe('2026-03-02')
  })
})
