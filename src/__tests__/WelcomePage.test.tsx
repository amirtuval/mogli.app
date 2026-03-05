import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import WelcomePage from '../components/WelcomePage'

const mockedInvoke = vi.mocked(invoke)

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('WelcomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render logo, tagline, and connect button', () => {
    renderWithQuery(<WelcomePage onContinue={() => {}} />)

    expect(screen.getByText('⬡')).toBeInTheDocument()
    expect(screen.getByText('Mogly')).toBeInTheDocument()
    expect(screen.getByText('All your Google accounts, one place.')).toBeInTheDocument()
    expect(screen.getByText('Connect a Google Account')).toBeInTheDocument()
  })

  it('should not show Continue button when no accounts', () => {
    renderWithQuery(<WelcomePage onContinue={() => {}} />)

    expect(screen.queryByText('Continue to Mogly →')).not.toBeInTheDocument()
  })

  it('should call add_account on connect click', async () => {
    const user = userEvent.setup()
    const mockAccount = {
      id: 'test-1',
      email: 'test@example.com',
      display_name: 'Test User',
      color: '#4f9cf9',
      history_id: '',
    }
    mockedInvoke.mockResolvedValueOnce(mockAccount)

    renderWithQuery(<WelcomePage onContinue={() => {}} />)

    await user.click(screen.getByText('Connect a Google Account'))

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('add_account')
    })
  })

  it('should show account pill and Continue button after connecting', async () => {
    const user = userEvent.setup()
    const mockAccount = {
      id: 'test-1',
      email: 'test@example.com',
      display_name: 'Test User',
      color: '#4f9cf9',
      history_id: '',
    }
    mockedInvoke.mockResolvedValueOnce(mockAccount)

    renderWithQuery(<WelcomePage onContinue={() => {}} />)

    await user.click(screen.getByText('Connect a Google Account'))

    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument()
    })
    expect(screen.getByText('Test User')).toBeInTheDocument()
    expect(screen.getByText('Continue to Mogly →')).toBeInTheDocument()
  })

  it('should call onContinue when Continue is clicked', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn()
    const mockAccount = {
      id: 'test-1',
      email: 'test@example.com',
      display_name: 'Test User',
      color: '#4f9cf9',
      history_id: '',
    }
    mockedInvoke.mockResolvedValueOnce(mockAccount)

    renderWithQuery(<WelcomePage onContinue={onContinue} />)

    await user.click(screen.getByText('Connect a Google Account'))

    await waitFor(() => {
      expect(screen.getByText('Continue to Mogly →')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Continue to Mogly →'))
    expect(onContinue).toHaveBeenCalledWith([mockAccount])
  })
})
