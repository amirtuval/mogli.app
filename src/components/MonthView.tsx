import { useMemo, useCallback } from 'react'
import type { CalEvent, Account, Calendar } from '../types/models'
import { useUIStore } from '../store/uiStore'
import type { WeekStartDay } from '../store/uiStore'
import styles from './MonthView.module.css'

interface MonthViewProps {
  events: CalEvent[] | undefined
  calendars?: Calendar[]
  accounts: Account[]
  isFetching?: boolean
}

const MAX_EVENTS_PER_CELL = 3

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

/** Get the color for an event (from event, calendar, or account). */
function eventColor(event: CalEvent, accounts: Account[]): string {
  if (event.color) return event.color
  const acct = accounts.find((a) => a.id === event.account_id)
  return acct?.color ?? '#4f9cf9'
}

/**
 * Generate the 6-week calendar grid for the month of `viewDate`.
 * Each cell is a Date. The grid starts on `weekStartDay` (0=Sun, 1=Mon).
 */
function buildMonthGrid(viewDate: string, weekStartDay: WeekStartDay): Date[][] {
  const [y, m] = viewDate.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const dayOfWeek = first.getDay()
  const startOffset = (dayOfWeek - weekStartDay + 7) % 7
  const gridStart = new Date(first)
  gridStart.setDate(gridStart.getDate() - startOffset)

  const weeks: Date[][] = []
  const cursor = new Date(gridStart)
  for (let w = 0; w < 6; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

export default function MonthView({
  events,
  calendars = [],
  accounts,
  isFetching,
}: MonthViewProps) {
  const calendarViewDate = useUIStore((s) => s.calendarViewDate)
  const weekStartDay = useUIStore((s) => s.weekStartDay)
  const openEventModal = useUIStore((s) => s.openEventModal)
  const setCalendarViewMode = useUIStore((s) => s.setCalendarViewMode)
  const setCalendarViewDate = useUIStore((s) => s.setCalendarViewDate)
  const theme = useUIStore((s) => s.theme)
  const isLight = theme === 'light'

  const [viewYear, viewMonth] = calendarViewDate.split('-').map(Number)

  const weeks = useMemo(
    () => buildMonthGrid(calendarViewDate, weekStartDay),
    [calendarViewDate, weekStartDay],
  )

  const today = useMemo(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth(), date: now.getDate() }
  }, [])

  const isToday = (d: Date) =>
    d.getFullYear() === today.year && d.getMonth() === today.month && d.getDate() === today.date

  const isCurrentMonth = (d: Date) => d.getFullYear() === viewYear && d.getMonth() === viewMonth - 1

  // Group events by date key "YYYY-MM-DD", spanning all days for multi-day events
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    if (!events) return map
    for (const ev of events) {
      const startD = new Date(ev.start * 1000)
      // Iterate each day the event spans
      const cursor = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate())
      while (cursor.getTime() / 1000 < ev.end) {
        const key = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}-${pad2(cursor.getDate())}`
        const list = map.get(key) ?? []
        list.push(ev)
        map.set(key, list)
        cursor.setDate(cursor.getDate() + 1)
      }
    }
    return map
  }, [events])

  /** Open the event modal in edit mode for an existing event. */
  const openEditModal = useCallback(
    (ev: CalEvent) => {
      const startDate = new Date(ev.start * 1000)
      const endDate = new Date(ev.end * 1000)
      const dateStr = `${startDate.getFullYear()}-${pad2(startDate.getMonth() + 1)}-${pad2(startDate.getDate())}`
      const startTimeStr = `${pad2(startDate.getHours())}:${pad2(startDate.getMinutes())}`
      const endTimeStr = `${pad2(endDate.getHours())}:${pad2(endDate.getMinutes())}`

      const isAllDay = ev.all_day || ev.end - ev.start >= 86400
      // For multi-day all-day events, compute inclusive end date (day before
      // Google's exclusive end timestamp).
      let endDateStr: string | undefined
      if (isAllDay) {
        const lastDay = new Date(ev.end * 1000)
        lastDay.setDate(lastDay.getDate() - 1)
        endDateStr = `${lastDay.getFullYear()}-${pad2(lastDay.getMonth() + 1)}-${pad2(lastDay.getDate())}`
      }

      openEventModal({
        mode: 'edit',
        date: dateStr,
        startTime: startTimeStr,
        endTime: endTimeStr,
        eventId: ev.id,
        accountId: ev.account_id,
        calendarId: ev.calendar_id,
        title: ev.title,
        allDay: isAllDay,
        endDate: endDateStr,
        location: ev.location ?? undefined,
        description: ev.description ?? undefined,
        conferenceUrl: ev.conference_url ?? undefined,
        recurrence: 'none',
        reminders: [],
      })
    },
    [openEventModal],
  )

  /** Double-click a date cell to create a new event on that day. */
  const handleCellDoubleClick = useCallback(
    (day: Date) => {
      const dateStr = `${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())}`
      openEventModal({
        mode: 'create',
        date: dateStr,
        startTime: '09:00',
        endTime: '10:00',
      })
    },
    [openEventModal],
  )

  /** Click a day number to switch to day view for that date. */
  const handleDayClick = useCallback(
    (day: Date) => {
      const dateStr = `${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())}`
      setCalendarViewDate(dateStr)
      setCalendarViewMode('day')
    },
    [setCalendarViewDate, setCalendarViewMode],
  )

  // Day-of-week header labels
  const dayLabels = useMemo(() => {
    const labels: string[] = []
    const d = new Date(2024, 0, weekStartDay === 0 ? 7 : 1) // a known Mon or Sun
    for (let i = 0; i < 7; i++) {
      labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }))
      d.setDate(d.getDate() + 1)
    }
    return labels
  }, [weekStartDay])

  return (
    <div
      className={styles.container}
      style={{ opacity: isFetching ? 0.5 : 1, transition: 'opacity 0.15s ease' }}
    >
      {/* Day-of-week header */}
      <div className={styles.header}>
        {dayLabels.map((label) => (
          <div key={label} className={styles.headerCell}>
            {label}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div className={styles.grid}>
        {weeks.map((week, wi) => (
          <div key={wi} className={styles.weekRow}>
            {week.map((day) => {
              const key = `${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())}`
              const dayEvents = eventsByDate.get(key) ?? []
              const inMonth = isCurrentMonth(day)
              const isTodayCell = isToday(day)

              return (
                <div
                  key={key}
                  className={`${styles.dayCell} ${inMonth ? '' : styles.outsideMonth}`}
                  onDoubleClick={() => handleCellDoubleClick(day)}
                >
                  <button
                    className={`${styles.dayNumber} ${isTodayCell ? styles.dayNumberToday : ''}`}
                    onClick={() => handleDayClick(day)}
                  >
                    {day.getDate()}
                  </button>
                  <div className={styles.eventList}>
                    {dayEvents.slice(0, MAX_EVENTS_PER_CELL).map((ev) => {
                      const color = eventColor(ev, accounts)
                      const cal = calendars.find((c) => c.id === ev.calendar_id)
                      const isAllDay = ev.all_day || ev.end - ev.start >= 86400
                      const startDate = new Date(ev.start * 1000)
                      const timeStr = isAllDay
                        ? ''
                        : `${pad2(startDate.getHours())}:${pad2(startDate.getMinutes())} `

                      return (
                        <div
                          key={ev.id}
                          className={styles.eventChip}
                          style={{
                            background: color + (isLight ? '1a' : '26'),
                            borderLeft: `2px solid ${color}`,
                            color,
                          }}
                          title={`${ev.title}${cal ? ` · ${cal.name}` : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            openEditModal(ev)
                          }}
                        >
                          {timeStr && <span className={styles.eventTime}>{timeStr}</span>}
                          <span className={styles.eventTitle}>{ev.title}</span>
                        </div>
                      )
                    })}
                    {dayEvents.length > MAX_EVENTS_PER_CELL && (
                      <div className={styles.moreLabel}>
                        +{dayEvents.length - MAX_EVENTS_PER_CELL} more
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
