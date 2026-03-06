import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useUIStore } from '../store/uiStore'
import styles from './NotificationBanner.module.css'

/**
 * In-app banner shown when OS notification permission is not granted.
 * Offers a button to request permission; dismisses permanently for the
 * session once the user clicks "×" or after a denial (no re-request).
 */
export default function NotificationBanner() {
  const notificationsEnabled = useUIStore((s) => s.notificationsEnabled)
  const setNotificationsEnabled = useUIStore((s) => s.setNotificationsEnabled)
  const [dismissed, setDismissed] = useState(false)

  const handleEnable = useCallback(async () => {
    try {
      const granted = await invoke<boolean>('request_notification_permission')
      setNotificationsEnabled(granted)
      if (!granted) {
        // User denied — don't show again this session
        setDismissed(true)
      }
    } catch {
      // Command failed — dismiss to avoid stuck banner
      setDismissed(true)
    }
  }, [setNotificationsEnabled])

  // Don't show if already granted or dismissed
  if (notificationsEnabled || dismissed) {
    return null
  }

  return (
    <div className={styles.banner} role="alert" data-testid="notification-banner">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
      </svg>
      <span className={styles.message}>
        Notifications are disabled. Enable them to get alerts for new emails and upcoming events.
      </span>
      <button className={styles.enableButton} onClick={handleEnable}>
        Enable
      </button>
      <button
        className={styles.dismissButton}
        onClick={() => setDismissed(true)}
        aria-label="Dismiss notification banner"
      >
        ×
      </button>
    </div>
  )
}
