import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import type { Account } from '../types/models'
import { useUIStore } from '../store/uiStore'
import ComposeModal from '../components/ComposeModal'

const mockedInvoke = vi.mocked(invoke)

const MOCK_ACCOUNTS: Account[] = [
  {
    id: 'a1',
    email: 'work@test.com',
    display_name: 'Work',
    color: '#4f9cf9',
    history_id: '',
  },
  {
    id: 'a2',
    email: 'personal@test.com',
    display_name: 'Personal',
    color: '#f97316',
    history_id: '',
  },
]

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('ComposeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUIStore.setState({
      showCompose: true,
      composeContext: null,
    })
  })

  it('should render with "New Message" title when mode is new', () => {
    useUIStore.setState({ composeContext: { mode: 'new' } })

    renderWithQuery(<ComposeModal accounts={MOCK_ACCOUNTS} />)

    expect(screen.getByText('New Message')).toBeInTheDocument()
  })

  it('should render with "Reply" title in reply mode', () => {
    useUIStore.setState({
      composeContext: {
        mode: 'reply',
        threadId: 't1',
        accountId: 'a1',
        to: 'alice@example.com',
        subject: 'Hello',
        body: 'Original text',
      },
    })

    renderWithQuery(<ComposeModal accounts={MOCK_ACCOUNTS} />)

    expect(screen.getByText('Reply')).toBeInTheDocument()
  })

  it('should pre-fill To and Subject with "Re: " prefix in reply mode', () => {
    useUIStore.setState({
      composeContext: {
        mode: 'reply',
        threadId: 't1',
        accountId: 'a1',
        to: 'alice@example.com',
        subject: 'Hello',
        body: '',
      },
    })

    renderWithQuery(<ComposeModal accounts={MOCK_ACCOUNTS} />)

    const toInput = screen.getByPlaceholderText('recipient@example.com') as HTMLInputElement
    expect(toInput.value).toBe('alice@example.com')

    const subjectInput = screen.getByPlaceholderText('Subject') as HTMLInputElement
    expect(subjectInput.value).toBe('Re: Hello')
  })

  it('should pre-fill Subject with "Fwd: " prefix in forward mode', () => {
    useUIStore.setState({
      composeContext: {
        mode: 'forward',
        threadId: 't1',
        accountId: 'a1',
        subject: 'Hello',
        body: 'Content',
      },
    })

    renderWithQuery(<ComposeModal accounts={MOCK_ACCOUNTS} />)

    expect(screen.getByText('Forward')).toBeInTheDocument()
    const subjectInput = screen.getByPlaceholderText('Subject') as HTMLInputElement
    expect(subjectInput.value).toBe('Fwd: Hello')
  })

  it('should call send_message with correct payload when Send is clicked', async () => {
    const user = userEvent.setup()
    mockedInvoke.mockResolvedValueOnce(undefined)

    useUIStore.setState({
      composeContext: {
        mode: 'reply',
        threadId: 't1',
        accountId: 'a1',
        to: 'alice@example.com',
        subject: 'Hello',
        body: '',
      },
    })

    renderWithQuery(<ComposeModal accounts={MOCK_ACCOUNTS} />)

    await user.click(screen.getByText('Send'))

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('send_message', {
        request: expect.objectContaining({
          account_id: 'a1',
          to: ['alice@example.com'],
          subject: 'Re: Hello',
        }),
      })
    })
  })

  it('should close compose when Discard is clicked', async () => {
    const user = userEvent.setup()
    useUIStore.setState({ composeContext: { mode: 'new' } })

    renderWithQuery(<ComposeModal accounts={MOCK_ACCOUNTS} />)

    await user.click(screen.getByText('Discard'))

    expect(useUIStore.getState().showCompose).toBe(false)
    expect(useUIStore.getState().composeContext).toBeNull()
  })

  it('should close compose when backdrop is clicked', async () => {
    const user = userEvent.setup()
    useUIStore.setState({ composeContext: { mode: 'new' } })

    renderWithQuery(<ComposeModal accounts={MOCK_ACCOUNTS} />)

    const backdrop = screen.getByTestId('compose-backdrop')
    await user.click(backdrop)

    expect(useUIStore.getState().showCompose).toBe(false)
  })

  it('should close compose when close button is clicked', async () => {
    const user = userEvent.setup()
    useUIStore.setState({ composeContext: { mode: 'new' } })

    renderWithQuery(<ComposeModal accounts={MOCK_ACCOUNTS} />)

    await user.click(screen.getByLabelText('Close'))

    expect(useUIStore.getState().showCompose).toBe(false)
  })

  it('should list all account emails in the From dropdown', () => {
    useUIStore.setState({ composeContext: { mode: 'new' } })

    renderWithQuery(<ComposeModal accounts={MOCK_ACCOUNTS} />)

    expect(screen.getByText('work@test.com')).toBeInTheDocument()
    expect(screen.getByText('personal@test.com')).toBeInTheDocument()
  })
})
