import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import NotificationBanner from '../components/NotificationBanner'
import { useUIStore } from '../store/uiStore'

const mockedInvoke = vi.mocked(invoke)

describe('NotificationBanner', () => {
  beforeEach(() => {
    useUIStore.setState({
      notificationsEnabled: false,
    })
    vi.clearAllMocks()
  })

  it('renders banner when notifications are not enabled', () => {
    render(<NotificationBanner />)
    expect(screen.getByTestId('notification-banner')).toBeInTheDocument()
    expect(screen.getByText(/notifications are disabled/i)).toBeInTheDocument()
  })

  it('does not render when notifications are enabled', () => {
    useUIStore.setState({ notificationsEnabled: true })
    render(<NotificationBanner />)
    expect(screen.queryByTestId('notification-banner')).not.toBeInTheDocument()
  })

  it('hides banner when dismiss button is clicked', () => {
    render(<NotificationBanner />)
    expect(screen.getByTestId('notification-banner')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Dismiss notification banner'))
    expect(screen.queryByTestId('notification-banner')).not.toBeInTheDocument()
  })

  it('calls request_notification_permission when Enable is clicked', async () => {
    mockedInvoke.mockResolvedValueOnce(true)
    render(<NotificationBanner />)

    fireEvent.click(screen.getByText('Enable'))

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('request_notification_permission')
    })
  })

  it('updates store and hides banner when permission is granted', async () => {
    mockedInvoke.mockResolvedValueOnce(true)
    render(<NotificationBanner />)

    fireEvent.click(screen.getByText('Enable'))

    await waitFor(() => {
      expect(useUIStore.getState().notificationsEnabled).toBe(true)
    })
    expect(screen.queryByTestId('notification-banner')).not.toBeInTheDocument()
  })

  it('dismisses banner when permission is denied (no re-request)', async () => {
    mockedInvoke.mockResolvedValueOnce(false)
    render(<NotificationBanner />)

    fireEvent.click(screen.getByText('Enable'))

    await waitFor(() => {
      expect(screen.queryByTestId('notification-banner')).not.toBeInTheDocument()
    })
    // Should not have enabled notifications
    expect(useUIStore.getState().notificationsEnabled).toBe(false)
  })

  it('dismisses banner when invoke fails', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('plugin error'))
    render(<NotificationBanner />)

    fireEvent.click(screen.getByText('Enable'))

    await waitFor(() => {
      expect(screen.queryByTestId('notification-banner')).not.toBeInTheDocument()
    })
  })

  it('has Enable button and dismiss button', () => {
    render(<NotificationBanner />)
    expect(screen.getByText('Enable')).toBeInTheDocument()
    expect(screen.getByLabelText('Dismiss notification banner')).toBeInTheDocument()
  })
})
