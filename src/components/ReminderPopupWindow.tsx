import { useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useUIStore } from '../store/uiStore'
import { applyTheme } from '../styles/theme'
import ReminderPopup from './ReminderPopup'
import styles from './ReminderPopupWindow.module.css'
import type { ReminderPayload } from '../types/models'

/**
 * Standalone root component for the reminder popup window.
 * Applies the theme, listens for `calendar:reminder` events from the backend,
 * and auto-hides the window when all reminders are dismissed/snoozed.
 */
export default function ReminderPopupWindow() {
  const theme = useUIStore((s) => s.theme)
  const reminders = useUIStore((s) => s.activeReminders)
  const hadRemindersRef = useRef(false)

  // Apply theme CSS vars
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Listen for reminder events from the backend
  useEffect(() => {
    const unlisten = listen<ReminderPayload>('calendar:reminder', (event) => {
      useUIStore.getState().addReminder(event.payload)
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  // On mount, fetch any reminders emitted before the JS listener was ready
  useEffect(() => {
    invoke<ReminderPayload[]>('get_active_reminders')
      .then((payloads) => {
        const store = useUIStore.getState()
        for (const p of payloads) {
          store.addReminder(p)
        }
      })
      .catch(() => {
        // Best-effort; the listener will catch future events
      })
  }, [])

  // Auto-hide the window when reminders go from non-zero to zero.
  // Skip the initial mount where the store starts empty.
  useEffect(() => {
    if (reminders.length > 0) {
      hadRemindersRef.current = true
    } else if (hadRemindersRef.current) {
      getCurrentWindow()
        .hide()
        .catch(() => {
          // Window may already be closed
        })
    }
  }, [reminders.length])

  const handleDismissAll = useCallback(() => {
    const state = useUIStore.getState()
    for (const r of state.activeReminders) {
      state.dismissReminder(r.eventId)
      invoke('dismiss_reminder', { eventId: r.eventId }).catch(() => {})
    }
  }, [])

  return (
    <div className={styles.window}>
      <div className={styles.titleBar} data-tauri-drag-region>
        <span className={styles.titleText}>Reminders</span>
        {reminders.length > 1 && (
          <button className={styles.dismissAllBtn} onClick={handleDismissAll}>
            Dismiss all
          </button>
        )}
      </div>
      <div className={styles.body}>
        <ReminderPopup />
      </div>
    </div>
  )
}
