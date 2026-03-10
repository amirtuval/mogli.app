import { useState } from 'react'
import type { Account } from '../types/models'
import { useUIStore } from '../store/uiStore'
import type { CalendarViewMode } from '../store/uiStore'
import styles from './TopBar.module.css'

interface TopBarProps {
  activeAccounts: Account[]
}

const VIEW_MODES: { id: CalendarViewMode; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

/**
 * Mode-aware TopBar.
 * - Mail mode: search bar + account avatars.
 * - Calendar mode: view-mode toggle + date label + ‹ Today › navigation + avatars.
 */
export default function TopBar({ activeAccounts }: TopBarProps) {
  const activeView = useUIStore((s) => s.activeView)
  const calendarWeekStart = useUIStore((s) => s.calendarWeekStart)
  const calendarViewDate = useUIStore((s) => s.calendarViewDate)
  const calendarViewMode = useUIStore((s) => s.calendarViewMode)
  const navigateWeek = useUIStore((s) => s.navigateWeek)
  const navigateDay = useUIStore((s) => s.navigateDay)
  const navigateMonth = useUIStore((s) => s.navigateMonth)
  const goToToday = useUIStore((s) => s.goToToday)
  const setCalendarViewMode = useUIStore((s) => s.setCalendarViewMode)
  const searchQuery = useUIStore((s) => s.searchQuery)
  const setSearchQuery = useUIStore((s) => s.setSearchQuery)

  const [searchInput, setSearchInput] = useState(searchQuery)

  const openEventModal = useUIStore((s) => s.openEventModal)

  if (activeView === 'calendar') {
    const handlePrev = () => {
      if (calendarViewMode === 'day') navigateDay(-1)
      else if (calendarViewMode === 'week') navigateWeek(-1)
      else navigateMonth(-1)
    }
    const handleNext = () => {
      if (calendarViewMode === 'day') navigateDay(1)
      else if (calendarViewMode === 'week') navigateWeek(1)
      else navigateMonth(1)
    }

    // Build the header label based on mode
    let headerLabel = ''
    let subLabel = ''
    if (calendarViewMode === 'day') {
      const d = new Date(calendarViewDate + 'T00:00:00')
      headerLabel = d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    } else if (calendarViewMode === 'week') {
      const weekStartDate = new Date(calendarWeekStart + 'T00:00:00')
      headerLabel = weekStartDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })
      subLabel = `Week ${getISOWeekNumber(weekStartDate)}`
    } else {
      const d = new Date(calendarViewDate + 'T00:00:00')
      headerLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }

    const handleNewEvent = () => {
      const now = new Date()
      const rounded = Math.ceil(now.getMinutes() / 15) * 15
      const startH = rounded >= 60 ? now.getHours() + 1 : now.getHours()
      const startM = rounded >= 60 ? 0 : rounded
      const endH = (startH + 1) % 24
      const pad = (n: number) => n.toString().padStart(2, '0')
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      openEventModal({
        mode: 'create',
        date: dateStr,
        startTime: `${pad(startH % 24)}:${pad(startM)}`,
        endTime: `${pad(endH)}:${pad(startM)}`,
      })
    }

    return (
      <div className={styles.topBar}>
        <div className={styles.calendarNav}>
          <span className={styles.monthLabel}>{headerLabel}</span>
          {subLabel && <span className={styles.weekLabel}>{subLabel}</span>}
        </div>
        <div className={styles.viewModeToggle}>
          {VIEW_MODES.map((m) => (
            <button
              key={m.id}
              className={`${styles.viewModeBtn} ${calendarViewMode === m.id ? styles.viewModeBtnActive : ''}`}
              onClick={() => setCalendarViewMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          className={`${styles.navBtn} ${styles.createBtn}`}
          onClick={handleNewEvent}
          title="Create event"
        >
          +
        </button>
        <div className={styles.navButtons}>
          <button className={styles.navBtn} onClick={handlePrev}>
            ‹
          </button>
          <button className={`${styles.navBtn} ${styles.todayBtn}`} onClick={goToToday}>
            Today
          </button>
          <button className={styles.navBtn} onClick={handleNext}>
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
