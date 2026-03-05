import { useState } from 'react'
import type { Account } from '../types/models'
import { useAddAccount } from '../hooks/useAccounts'
import styles from './WelcomePage.module.css'

interface WelcomePageProps {
  onContinue: (accounts: Account[]) => void
}

export default function WelcomePage({ onContinue }: WelcomePageProps) {
  const [connectedAccounts, setConnectedAccounts] = useState<Account[]>([])
  const addAccount = useAddAccount()

  const handleConnect = () => {
    addAccount.mutate(undefined, {
      onSuccess: (account) => {
        setConnectedAccounts((prev) => [...prev, account])
      },
    })
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.logo}>⬡</div>
        <div className={styles.wordmark}>Mogly</div>
        <div className={styles.tagline}>All your Google accounts, one place.</div>
        <div className={styles.description}>
          Mogly unifies your Gmail inboxes and Google Calendars
          <br />
          without downloading your email.
        </div>

        {connectedAccounts.length > 0 && (
          <div className={styles.accountsList}>
            {connectedAccounts.map((a) => (
              <div key={a.id} className={styles.accountPill}>
                <div className={styles.accountDot} style={{ background: a.color }} />
                <div className={styles.accountInfo}>
                  <div className={styles.accountLabel}>{a.display_name}</div>
                  <div className={styles.accountEmail}>{a.email}</div>
                </div>
                <span className={styles.accountCheck} style={{ color: a.color }}>
                  ✓
                </span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleConnect}
          disabled={addAccount.isPending}
          className={`${styles.connectBtn} ${
            connectedAccounts.length === 0 ? styles.connectBtnPrimary : styles.connectBtnSecondary
          }`}
        >
          {addAccount.isPending
            ? 'Opening browser...'
            : connectedAccounts.length === 0
              ? 'Connect a Google Account'
              : '+ Add another account'}
        </button>

        {connectedAccounts.length > 0 && (
          <button onClick={() => onContinue(connectedAccounts)} className={styles.continueBtn}>
            Continue to Mogly →
          </button>
        )}
      </div>
    </div>
  )
}
