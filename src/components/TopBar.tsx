import { useState } from 'react'
import type { Account } from '../types/models'
import { useUIStore } from '../store/uiStore'
import styles from './TopBar.module.css'

interface TopBarProps {
  activeAccounts: Account[]
}

/**
 * Mode-aware TopBar.
 * - Mail mode: search bar + account avatars.
 * - Calendar mode: month/year + week number + ‹ Today › navigation + avatars.
 */
export default function TopBar({ activeAccounts }: TopBarProps) {
  const activeView = useUIStore((s) => s.activeView)
  const calendarWeekStart = useUIStore((s) => s.calendarWeekStart)
  const navigateWeek = useUIStore((s) => s.navigateWeek)
  const goToToday = useUIStore((s) => s.goToToday)
  const searchQuery = useUIStore((s) => s.searchQuery)
  const setSearchQuery = useUIStore((s) => s.setSearchQuery)

  const [searchInput, setSearchInput] = useState(searchQuery)

  const openEventModal = useUIStore((s) => s.openEventModal)

  if (activeView === 'calendar') {
    const weekStartDate = new Date(calendarWeekStart + 'T00:00:00')
    const monthName = weekStartDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    })
    // ISO week number
    const weekNum = getISOWeekNumber(weekStartDate)

    const handleNewEvent = () => {
      const now = new Date()
      const rounded = Math.ceil(now.getMinutes() / 15) * 15
      const startH = rounded >= 60 ? now.getHours() + 1 : now.getHours()
      const startM = rounded >= 60 ? 0 : rounded
      const endH = (startH + 1) % 24
      const pad = (n: number) => n.toString().padStart(2, '0')
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      openEventModal({
        date: dateStr,
        startTime: `${pad(startH % 24)}:${pad(startM)}`,
        endTime: `${pad(endH)}:${pad(startM)}`,
      })
    }

    return (
      <div className={styles.topBar}>
        <div className={styles.calendarNav}>
          <span className={styles.monthLabel}>{monthName}</span>
          <span className={styles.weekLabel}>Week {weekNum}</span>
        </div>
        <button
          className={`${styles.navBtn} ${styles.createBtn}`}
          onClick={handleNewEvent}
          title="Create event"
        >
          +
        </button>
        <div className={styles.navButtons}>
          <button className={styles.navBtn} onClick={() => navigateWeek(-1)}>
            ‹
          </button>
          <button className={`${styles.navBtn} ${styles.todayBtn}`} onClick={goToToday}>
            Today
          </button>
          <button className={styles.navBtn} onClick={() => navigateWeek(1)}>
            ›
          </button>
        </div>
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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchQuery(searchInput)
  }

  const clearSearch = () => {
    setSearchInput('')
    setSearchQuery('')
  }

  // Mail mode (default)
  return (
    <div className={styles.topBar}>
      <form className={styles.searchForm} onSubmit={handleSearchSubmit}>
        <span className={styles.searchIcon}>⌕</span>
        <input
          className={styles.searchInput}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search mail across all accounts..."
        />
        {searchQuery && (
          <button type="button" className={styles.clearBtn} onClick={clearSearch}>
            ✕
          </button>
        )}
        <span className={styles.kbdHint}>⌘K</span>
      </form>
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

/** Get ISO 8601 week number for a date. */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}
