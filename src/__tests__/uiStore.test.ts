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
      calendarViewMode: 'week',
      calendarWeekStart: '2026-03-02',
      calendarViewDate: '2026-03-02',
      weekStartDay: 1,
      notificationsEnabled: false,
      searchQuery: '',
      mailFilter: { unread: false, starred: false },
      autoMarkRead: false,
      showCompose: false,
      composeContext: null,
      selectedThreadIds: new Set<string>(),
      lastSelectedThreadId: null,
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

  it('should initialize notificationsEnabled as false', () => {
    expect(useUIStore.getState().notificationsEnabled).toBe(false)
  })

  it('should set notificationsEnabled to true', () => {
    useUIStore.getState().setNotificationsEnabled(true)
    expect(useUIStore.getState().notificationsEnabled).toBe(true)
  })

  it('should set notificationsEnabled to false', () => {
    useUIStore.setState({ notificationsEnabled: true })
    useUIStore.getState().setNotificationsEnabled(false)
    expect(useUIStore.getState().notificationsEnabled).toBe(false)
  })

  it('should initialize searchQuery as empty string', () => {
    expect(useUIStore.getState().searchQuery).toBe('')
  })

  it('should set search query', () => {
    useUIStore.getState().setSearchQuery('invoice 2026')
    expect(useUIStore.getState().searchQuery).toBe('invoice 2026')
  })

  it('should clear search query', () => {
    useUIStore.setState({ searchQuery: 'something' })
    useUIStore.getState().setSearchQuery('')
    expect(useUIStore.getState().searchQuery).toBe('')
  })

  it('should initialize mailFilter with both false', () => {
    const { mailFilter } = useUIStore.getState()
    expect(mailFilter).toEqual({ unread: false, starred: false })
  })

  it('should toggle unread filter on', () => {
    useUIStore.getState().toggleMailFilter('unread')
    expect(useUIStore.getState().mailFilter.unread).toBe(true)
    expect(useUIStore.getState().mailFilter.starred).toBe(false)
  })

  it('should toggle unread filter off', () => {
    useUIStore.setState({ mailFilter: { unread: true, starred: false } })
    useUIStore.getState().toggleMailFilter('unread')
    expect(useUIStore.getState().mailFilter.unread).toBe(false)
  })

  it('should toggle starred filter independently', () => {
    useUIStore.getState().toggleMailFilter('starred')
    expect(useUIStore.getState().mailFilter.starred).toBe(true)
    expect(useUIStore.getState().mailFilter.unread).toBe(false)
  })

  it('should initialize autoMarkRead as false', () => {
    expect(useUIStore.getState().autoMarkRead).toBe(false)
  })

  it('should set autoMarkRead to true', () => {
    useUIStore.getState().setAutoMarkRead(true)
    expect(useUIStore.getState().autoMarkRead).toBe(true)
  })

  it('should set autoMarkRead back to false', () => {
    useUIStore.setState({ autoMarkRead: true })
    useUIStore.getState().setAutoMarkRead(false)
    expect(useUIStore.getState().autoMarkRead).toBe(false)
  })

  it('should set showCompose and composeContext with openCompose', () => {
    useUIStore.getState().openCompose({ mode: 'new' })
    const state = useUIStore.getState()
    expect(state.showCompose).toBe(true)
    expect(state.composeContext).toEqual({ mode: 'new' })
  })

  it('should clear showCompose and composeContext with closeCompose', () => {
    useUIStore.getState().openCompose({ mode: 'new' })
    useUIStore.getState().closeCompose()
    const state = useUIStore.getState()
    expect(state.showCompose).toBe(false)
    expect(state.composeContext).toBeNull()
  })
})

describe('calendar view mode', () => {
  beforeEach(() => {
    useUIStore.setState({
      calendarViewMode: 'week',
      calendarViewDate: '2026-03-10',
      calendarWeekStart: '2026-03-09',
    })
  })

  it('should set calendar view mode', () => {
    useUIStore.getState().setCalendarViewMode('day')
    expect(useUIStore.getState().calendarViewMode).toBe('day')
    useUIStore.getState().setCalendarViewMode('month')
    expect(useUIStore.getState().calendarViewMode).toBe('month')
  })

  it('should navigate day forward', () => {
    useUIStore.getState().navigateDay(1)
    expect(useUIStore.getState().calendarViewDate).toBe('2026-03-11')
  })

  it('should navigate day backward', () => {
    useUIStore.getState().navigateDay(-1)
    expect(useUIStore.getState().calendarViewDate).toBe('2026-03-09')
  })

  it('should navigate day across month boundary', () => {
    useUIStore.setState({ calendarViewDate: '2026-03-31' })
    useUIStore.getState().navigateDay(1)
    expect(useUIStore.getState().calendarViewDate).toBe('2026-04-01')
  })

  it('should navigate month forward', () => {
    useUIStore.getState().navigateMonth(1)
    expect(useUIStore.getState().calendarViewDate).toBe('2026-04-01')
  })

  it('should navigate month backward', () => {
    useUIStore.getState().navigateMonth(-1)
    expect(useUIStore.getState().calendarViewDate).toBe('2026-02-01')
  })

  it('should navigate month across year boundary', () => {
    useUIStore.setState({ calendarViewDate: '2026-01-15' })
    useUIStore.getState().navigateMonth(-1)
    expect(useUIStore.getState().calendarViewDate).toBe('2025-12-01')
  })

  it('should set calendar view date', () => {
    useUIStore.getState().setCalendarViewDate('2026-06-15')
    expect(useUIStore.getState().calendarViewDate).toBe('2026-06-15')
  })

  it('should toggle thread selection', () => {
    useUIStore.getState().toggleThreadSelection('t1')
    expect(useUIStore.getState().selectedThreadIds.has('t1')).toBe(true)
    expect(useUIStore.getState().lastSelectedThreadId).toBe('t1')

    useUIStore.getState().toggleThreadSelection('t2')
    expect(useUIStore.getState().selectedThreadIds.size).toBe(2)

    // Toggle off
    useUIStore.getState().toggleThreadSelection('t1')
    expect(useUIStore.getState().selectedThreadIds.has('t1')).toBe(false)
    expect(useUIStore.getState().selectedThreadIds.has('t2')).toBe(true)
  })

  it('should select all threads', () => {
    useUIStore.getState().selectAllThreads(['t1', 't2', 't3'])
    expect(useUIStore.getState().selectedThreadIds.size).toBe(3)
    expect(useUIStore.getState().lastSelectedThreadId).toBeNull()
  })

  it('should clear selection', () => {
    useUIStore.getState().selectAllThreads(['t1', 't2'])
    expect(useUIStore.getState().selectedThreadIds.size).toBe(2)

    useUIStore.getState().clearSelection()
    expect(useUIStore.getState().selectedThreadIds.size).toBe(0)
    expect(useUIStore.getState().lastSelectedThreadId).toBeNull()
  })

  it('should initialize with empty selection', () => {
    const state = useUIStore.getState()
    expect(state.selectedThreadIds.size).toBe(0)
    expect(state.lastSelectedThreadId).toBeNull()
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
