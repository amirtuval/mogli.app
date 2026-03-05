import type { Account } from '../types/models'
import styles from './TopBar.module.css'

interface TopBarProps {
  activeAccounts: Account[]
}

/**
 * Mail mode TopBar.
 * Phase 2: no search bar (search not yet implemented).
 * Shows active account avatar stack only.
 * Phase 5 adds search when it is wired to Gmail API.
 */
export default function TopBar({ activeAccounts }: TopBarProps) {
  return (
    <div className={styles.topBar}>
      <div className={styles.spacer} />
      <div className={styles.avatarStack}>
        {activeAccounts.map((a) => (
          <div key={a.id} className={styles.avatar} style={{ background: a.color }}>
            {a.display_name[0]?.toUpperCase() ?? '?'}
          </div>
        ))}
      </div>
    </div>
  )
}
