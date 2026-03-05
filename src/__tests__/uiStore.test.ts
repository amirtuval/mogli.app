import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '../store/uiStore'

describe('uiStore', () => {
  beforeEach(() => {
    // Reset store to defaults between tests
    useUIStore.setState({
      theme: 'dark',
      activeView: 'mail',
      activeAccounts: [],
      selectedThreadId: null,
      selectedLabel: 'INBOX',
    })
  })

  it('should initialize with correct defaults', () => {
    const state = useUIStore.getState()
    expect(state.theme).toBe('dark')
    expect(state.activeView).toBe('mail')
    expect(state.activeAccounts).toEqual([])
    expect(state.selectedThreadId).toBeNull()
    expect(state.selectedLabel).toBe('INBOX')
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
})
