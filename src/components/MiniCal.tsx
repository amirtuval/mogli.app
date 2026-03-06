import { useState, useMemo, useCallback } from 'react'
import { useUIStore, getMonday } from '../store/uiStore'
import styles from './MiniCal.module.css'

const DAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export default function MiniCal() {
  const calendarWeekStart = useUIStore((s) => s.calendarWeekStart)
  const setCalendarWeekStart = useUIStore((s) => s.setCalendarWeekStart)

  // Track the displayed month independently from the calendar week
  const [displayYear, setDisplayYear] = useState(() => new Date().getFullYear())
  const [displayMonth, setDisplayMonth] = useState(() => new Date().getMonth())

  const today = useMemo(() => new Date(), [])
  const todayDate = today.getDate()
  const todayMonth = today.getMonth()
  const todayYear = today.getFullYear()

  // Compute the viewed week range (Mon 00:00 – Sun 23:59)
  const viewedWeek = useMemo(() => {
    const start = new Date(calendarWeekStart + 'T00:00:00')
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return { start, end }
  }, [calendarWeekStart])

  const cells = useMemo(() => {
    // First day of the month: getDay() → 0=Sun,1=Mon,...6=Sat
    const firstDay = new Date(displayYear, displayMonth, 1).getDay()
    // Shift so Monday=0: Sun(0)→6, Mon(1)→0, Tue(2)→1, ...
    const offset = firstDay === 0 ? 6 : firstDay - 1
    const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate()

    return Array.from({ length: 42 }, (_, i) => {
      const d = i - offset + 1
      return d >= 1 && d <= daysInMonth ? d : null
    })
  }, [displayYear, displayMonth])

  const navigateMonth = useCallback(
    (delta: number) => {
      let newMonth = displayMonth + delta
      let newYear = displayYear
      if (newMonth < 0) {
        newMonth = 11
        newYear -= 1
      } else if (newMonth > 11) {
        newMonth = 0
        newYear += 1
      }
      setDisplayMonth(newMonth)
      setDisplayYear(newYear)
    },
    [displayMonth, displayYear],
  )

  const handleDayClick = useCallback(
    (day: number) => {
      const clicked = new Date(displayYear, displayMonth, day)
      setCalendarWeekStart(getMonday(clicked))
    },
    [displayYear, displayMonth, setCalendarWeekStart],
  )

  const isToday = (day: number) =>
    day === todayDate && displayMonth === todayMonth && displayYear === todayYear

  const isInViewedWeek = (day: number) => {
    const d = new Date(displayYear, displayMonth, day)
    return d >= viewedWeek.start && d <= viewedWeek.end
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.monthLabel}>
          {MONTH_NAMES[displayMonth]} {displayYear}
        </span>
        <div className={styles.navButtons}>
          <button className={styles.navBtn} onClick={() => navigateMonth(-1)}>
            ‹
          </button>
          <button className={styles.navBtn} onClick={() => navigateMonth(1)}>
            ›
          </button>
        </div>
      </div>
      <div className={styles.grid}>
        {DAY_HEADERS.map((d, i) => (
          <div key={`h-${i}`} className={styles.dayHeader}>
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) {
            return (
              <div key={`e-${i}`} className={`${styles.dayCell} ${styles.dayCellEmpty}`}>
                {''}
              </div>
            )
          }
          const todayClass = isToday(d) ? styles.dayCellToday : ''
          const weekClass = isInViewedWeek(d) ? styles.dayCellViewed : ''
          return (
            <div
              key={`d-${d}`}
              className={`${styles.dayCell} ${weekClass} ${todayClass}`}
              onClick={() => handleDayClick(d)}
            >
              {d}
            </div>
          )
        })}
      </div>
    </div>
  )
}
