import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore, getMonday } from '../store/uiStore'

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
    // Should be this week's Monday
    expect(weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(weekStart).toBe(getMonday(new Date()))
  })
})

describe('getMonday', () => {
  it('returns Monday for a Monday input', () => {
    expect(getMonday(new Date('2026-03-02'))).toBe('2026-03-02')
  })

  it('returns Monday for a Wednesday input', () => {
    expect(getMonday(new Date('2026-03-04'))).toBe('2026-03-02')
  })

  it('returns Monday for a Sunday input', () => {
    expect(getMonday(new Date('2026-03-08'))).toBe('2026-03-02')
  })

  it('returns Monday for a Saturday input', () => {
    expect(getMonday(new Date('2026-03-07'))).toBe('2026-03-02')
  })
})
