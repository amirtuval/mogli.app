import { useState, useCallback } from 'react'
import type { Account } from '../types/models'
import { useReauthAccount } from '../hooks/useAccounts'
import styles from './AuthExpiredBanner.module.css'

interface AuthExpiredBannerProps {
  accounts: Account[]
}

/**
 * In-app warning banner shown when one or more accounts have expired
 * or revoked OAuth tokens. Displays the affected account names and
 * offers a re-authenticate button. Dismissible per session.
 */
export default function AuthExpiredBanner({ accounts }: AuthExpiredBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const reauthAccount = useReauthAccount()

  const expiredAccounts = accounts.filter((a) => a.auth_expired)

  const handleReauth = useCallback(
    (accountId: string) => {
      reauthAccount.mutate(accountId)
    },
    [reauthAccount],
  )

  if (dismissed || expiredAccounts.length === 0) {
    return null
  }

  const names = expiredAccounts.map((a) => a.display_name || a.email)

  return (
    <div className={styles.banner} role="alert" data-testid="auth-expired-banner">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
      </svg>
      <span className={styles.message}>
        {expiredAccounts.length === 1 ? (
          <>
            <span className={styles.accountName}>{names[0]}</span> needs to be re-authenticated.
          </>
        ) : (
          <>
            {names.map((name, i) => (
              <span key={expiredAccounts[i].id}>
                {i > 0 && ', '}
                <span className={styles.accountName}>{name}</span>
              </span>
            ))}{' '}
            need to be re-authenticated.
          </>
        )}
      </span>
      {expiredAccounts.length === 1 && (
        <button
          className={styles.reauthButton}
          onClick={() => handleReauth(expiredAccounts[0].id)}
          disabled={reauthAccount.isPending}
        >
          {reauthAccount.isPending ? 'Signing in...' : 'Re-authenticate'}
        </button>
      )}
      <button
        className={styles.dismissButton}
        onClick={() => setDismissed(true)}
        aria-label="Dismiss auth expired banner"
      >
        ×
      </button>
    </div>
  )
}
