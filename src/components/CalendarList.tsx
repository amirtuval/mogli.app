import { useMemo } from 'react'
import type { Account, Calendar } from '../types/models'
import { useSetCalendarEnabled } from '../hooks/useCalendars'
import styles from './CalendarList.module.css'

interface CalendarListProps {
  accounts: Account[]
  calendars: Calendar[]
}

export default function CalendarList({ accounts, calendars }: CalendarListProps) {
  const setEnabled = useSetCalendarEnabled()

  // Group calendars by account
  const grouped = useMemo(() => {
    const map = new Map<string, Calendar[]>()
    for (const cal of calendars) {
      const existing = map.get(cal.account_id) ?? []
      existing.push(cal)
      map.set(cal.account_id, existing)
    }
    return map
  }, [calendars])

  const handleToggle = (cal: Calendar) => {
    setEnabled.mutate({
      accountId: cal.account_id,
      calendarId: cal.id,
      enabled: !cal.enabled,
    })
  }

  return (
    <>
      <div className={styles.container}>
        <div className={styles.sectionLabel}>Calendars</div>
        {accounts.map((account) => {
          const accountCals = grouped.get(account.id) ?? []
          if (accountCals.length === 0) return null

          return (
            <div key={account.id} className={styles.accountGroup}>
              <div className={styles.accountHeader}>
                <div className={styles.accountDot} style={{ background: account.color }} />
                {account.display_name}
              </div>
              {accountCals.map((cal) => (
                <div
                  key={`${cal.account_id}::${cal.id}`}
                  className={styles.calendarItem}
                  onClick={() => handleToggle(cal)}
                >
                  <div
                    className={`${styles.checkbox} ${cal.enabled ? styles.checkboxChecked : ''}`}
                    style={{
                      background: cal.enabled ? cal.color : 'transparent',
                      borderColor: cal.enabled ? cal.color : undefined,
                    }}
                  >
                    {cal.enabled ? '✓' : ''}
                  </div>
                  <span className={styles.calendarName}>{cal.name}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* View picker: Week only (Day/Month not yet implemented) */}
      <div className={styles.viewSection}>
        <div className={styles.sectionLabel}>View</div>
        <div className={styles.viewItem}>
          <span className={styles.viewIcon}>▦</span>
          Week
        </div>
      </div>
    </>
  )
}
