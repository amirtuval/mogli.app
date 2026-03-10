import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useUIStore } from '../store/uiStore'
import styles from './ReminderPopup.module.css'

const SNOOZE_OPTIONS = [
  { label: '5 min', minutes: 5 },
  { label: '10 min', minutes: 10 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
] as const

/**
 * Format the time until the event starts relative to now.
 * Returns "Starting now", "Starting in X min", or "Started X min ago".
 */
function formatTimeUntil(eventStart: number): string {
  const nowSec = Math.floor(Date.now() / 1000)
  const diffMin = Math.round((eventStart - nowSec) / 60)

  if (diffMin <= 0 && diffMin >= -1) return 'Starting now'
  if (diffMin < -1) return `Started ${Math.abs(diffMin)} min ago`
  return `Starting in ${diffMin} min`
}

export default function ReminderPopup() {
  const reminders = useUIStore((s) => s.activeReminders)
  const dismissReminder = useUIStore((s) => s.dismissReminder)
  const snoozeReminder = useUIStore((s) => s.snoozeReminder)

  // Force re-render every 30s to update "starting in X min" text
  const [, setTick] = useState(0)
  useEffect(() => {
    if (reminders.length === 0) return
    const interval = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(interval)
  }, [reminders.length])

  const [openSnoozeId, setOpenSnoozeId] = useState<string | null>(null)

  const handleDismiss = useCallback(
    (eventId: string) => {
      dismissReminder(eventId)
      invoke('dismiss_reminder', { eventId }).catch(() => {
        // Best-effort
      })
    },
    [dismissReminder],
  )

  const handleSnooze = useCallback(
    (eventId: string, minutes: number) => {
      snoozeReminder(eventId, minutes)
      setOpenSnoozeId(null)
    },
    [snoozeReminder],
  )

  if (reminders.length === 0) return null

  return (
    <div className={styles.container} data-testid="reminder-popup">
      {reminders.slice(0, 5).map((r) => (
        <div
          key={r.eventId}
          className={styles.card}
          style={{ borderLeft: `3px solid ${r.calendarColor}` }}
        >
          <div className={styles.cardHeader}>
            <span className={styles.colorDot} style={{ background: r.calendarColor }} />
            <span className={styles.title}>{r.title}</span>
            <button
              className={styles.dismiss}
              onClick={() => handleDismiss(r.eventId)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
          <div className={styles.timeText}>{formatTimeUntil(r.start)}</div>
          <div className={styles.calendarName}>{r.calendarName}</div>
          <div className={styles.actions}>
            <div style={{ position: 'relative' }}>
              <button
                className={styles.snoozeBtn}
                onClick={() => setOpenSnoozeId(openSnoozeId === r.eventId ? null : r.eventId)}
              >
                Snooze ▾
              </button>
              {openSnoozeId === r.eventId && (
                <div className={styles.snoozeDropdown}>
                  {SNOOZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.minutes}
                      className={styles.snoozeOption}
                      onClick={() => handleSnooze(r.eventId, opt.minutes)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
