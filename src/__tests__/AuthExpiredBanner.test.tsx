import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Account } from '../types/models'
import AuthExpiredBanner from '../components/AuthExpiredBanner'

const HEALTHY_ACCOUNT: Account = {
  id: 'a1',
  email: 'work@test.com',
  display_name: 'Work',
  color: '#4f9cf9',
  history_id: '',
  auth_expired: false,
}

const EXPIRED_ACCOUNT: Account = {
  id: 'a2',
  email: 'expired@test.com',
  display_name: 'Expired User',
  color: '#f97316',
  history_id: '',
  auth_expired: true,
}

const EXPIRED_ACCOUNT_2: Account = {
  id: 'a3',
  email: 'also-expired@test.com',
  display_name: 'Also Expired',
  color: '#a78bfa',
  history_id: '',
  auth_expired: true,
}

function renderBanner(accounts: Account[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthExpiredBanner accounts={accounts} />
    </QueryClientProvider>,
  )
}

describe('AuthExpiredBanner', () => {
  it('should not render when no accounts have expired auth', () => {
    renderBanner([HEALTHY_ACCOUNT])
    expect(screen.queryByTestId('auth-expired-banner')).not.toBeInTheDocument()
  })

  it('should not render when account list is empty', () => {
    renderBanner([])
    expect(screen.queryByTestId('auth-expired-banner')).not.toBeInTheDocument()
  })

  it('should render when one account has expired auth', () => {
    renderBanner([HEALTHY_ACCOUNT, EXPIRED_ACCOUNT])
    expect(screen.getByTestId('auth-expired-banner')).toBeInTheDocument()
    expect(screen.getByText('Expired User')).toBeInTheDocument()
    expect(screen.getByText(/needs to be re-authenticated/)).toBeInTheDocument()
  })

  it('should show re-authenticate button for a single expired account', () => {
    renderBanner([EXPIRED_ACCOUNT])
    expect(screen.getByText('Re-authenticate')).toBeInTheDocument()
  })

  it('should render multiple expired account names', () => {
    renderBanner([HEALTHY_ACCOUNT, EXPIRED_ACCOUNT, EXPIRED_ACCOUNT_2])
    expect(screen.getByText('Expired User')).toBeInTheDocument()
    expect(screen.getByText('Also Expired')).toBeInTheDocument()
    expect(screen.getByText(/need to be re-authenticated/)).toBeInTheDocument()
  })

  it('should not show re-authenticate button for multiple expired accounts', () => {
    renderBanner([EXPIRED_ACCOUNT, EXPIRED_ACCOUNT_2])
    expect(screen.queryByText('Re-authenticate')).not.toBeInTheDocument()
  })

  it('should dismiss when the dismiss button is clicked', async () => {
    const user = userEvent.setup()
    renderBanner([EXPIRED_ACCOUNT])

    expect(screen.getByTestId('auth-expired-banner')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Dismiss auth expired banner'))
    expect(screen.queryByTestId('auth-expired-banner')).not.toBeInTheDocument()
  })

  it('should fall back to email when display_name is empty', () => {
    const noName: Account = { ...EXPIRED_ACCOUNT, display_name: '' }
    renderBanner([noName])
    expect(screen.getByText('expired@test.com')).toBeInTheDocument()
  })
})
