import { useMemo, useState, useEffect } from 'react'
import type { CalEvent, Account } from '../types/models'
import { useUIStore } from '../store/uiStore'
import styles from './CalendarView.module.css'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7) // 07:00–22:00
const ROW_HEIGHT = 56

interface CalendarViewProps {
  events: CalEvent[] | undefined
  accounts: Account[]
  isLoading: boolean
}

/** Get the account color for an event (from the event's color or the account). */
function eventColor(event: CalEvent, accounts: Account[]): string {
  if (event.color) return event.color
  const acct = accounts.find((a) => a.id === event.account_id)
  return acct?.color ?? '#4f9cf9'
}

export default function CalendarView({ events, accounts, isLoading }: CalendarViewProps) {
  const theme = useUIStore((s) => s.theme)
  const calendarWeekStart = useUIStore((s) => s.calendarWeekStart)
  const isLight = theme === 'light'

  // Week days (Mon–Sun) as Date objects
  const weekDays = useMemo(() => {
    const start = new Date(calendarWeekStart + 'T00:00:00')
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [calendarWeekStart])

  const today = useMemo(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth(), date: now.getDate() }
  }, [])

  const isToday = (d: Date) =>
    d.getFullYear() === today.year && d.getMonth() === today.month && d.getDate() === today.date

  // "Now" line position, updates every minute
  const [nowMinutes, setNowMinutes] = useState(() => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  })

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date()
      setNowMinutes(now.getHours() * 60 + now.getMinutes())
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  // Group events by day
  const eventsByDay = useMemo(() => {
    const map = new Map<number, { timed: CalEvent[]; allDay: CalEvent[] }>()
    for (let i = 0; i < 7; i++) {
      map.set(i, { timed: [], allDay: [] })
    }

    if (!events) return map

    for (const event of events) {
      // Find which day column(s) this event belongs to
      const startDate = new Date(event.start * 1000)
      for (let i = 0; i < 7; i++) {
        const day = weekDays[i]
        if (
          startDate.getFullYear() === day.getFullYear() &&
          startDate.getMonth() === day.getMonth() &&
          startDate.getDate() === day.getDate()
        ) {
          const bucket = map.get(i)!
          if (event.all_day) {
            bucket.allDay.push(event)
          } else {
            bucket.timed.push(event)
          }
        }
      }
    }

    return map
  }, [events, weekDays])

  if (isLoading) {
    return <div className={styles.loading}>Loading calendar…</div>
  }

  const formatHour = (h: number) => h.toString().padStart(2, '0') + ':00'
  const formatMinutes = (totalMinutes: number) => {
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    return `${h}:${m.toString().padStart(2, '0')}`
  }

  const nowTop = (nowMinutes / 60 - 7) * ROW_HEIGHT

  return (
    <div className={styles.container}>
      {/* Time column */}
      <div className={styles.timeColumn}>
        <div style={{ height: 38 }} /> {/* Align with day headers */}
        {HOURS.map((h) => (
          <div key={h} className={styles.timeSlot}>
            <span className={styles.timeLabel}>{formatHour(h)}</span>
          </div>
        ))}
      </div>

      {/* Day columns */}
      {weekDays.map((day, di) => {
        const dayData = eventsByDay.get(di)!
        const isTodayCol = isToday(day)

        return (
          <div key={di} className={styles.dayColumn}>
            {/* Day header */}
            <div className={styles.dayHeader}>
              <span className={styles.dayName}>{DAY_NAMES[di]}</span>
              <span className={`${styles.dayNumber} ${isTodayCol ? styles.dayNumberToday : ''}`}>
                {day.getDate()}
              </span>
            </div>

            {/* All-day events strip */}
            {dayData.allDay.length > 0 && (
              <div className={styles.allDayStrip}>
                {dayData.allDay.map((ev) => {
                  const color = eventColor(ev, accounts)
                  return (
                    <div
                      key={ev.id}
                      className={styles.allDayEvent}
                      style={{
                        background: color + (isLight ? '1a' : '26'),
                        borderLeft: `2.5px solid ${color}`,
                        color,
                      }}
                    >
                      {ev.title}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Hour grid + timed events */}
            <div className={styles.hourGrid}>
              {HOURS.map((h) => (
                <div key={h} className={styles.hourRow} />
              ))}

              {/* Timed events */}
              {dayData.timed.map((ev) => {
                const startDate = new Date(ev.start * 1000)
                const endDate = new Date(ev.end * 1000)
                const startMinutes = startDate.getHours() * 60 + startDate.getMinutes()
                const endMinutes = endDate.getHours() * 60 + endDate.getMinutes()
                const durationMinutes = endMinutes - startMinutes
                const top = (startMinutes / 60 - 7) * ROW_HEIGHT
                const height = (durationMinutes / 60) * ROW_HEIGHT - 2
                const color = eventColor(ev, accounts)

                const startStr = formatMinutes(startMinutes)
                const endStr = formatMinutes(endMinutes)

                return (
                  <div
                    key={ev.id}
                    className={styles.eventBlock}
                    style={{
                      top,
                      height: Math.max(height, 18),
                      background: color + (isLight ? '1a' : '26'),
                      borderLeft: `2.5px solid ${color}`,
                    }}
                  >
                    <div className={styles.eventTitle} style={{ color }}>
                      {ev.title}
                    </div>
                    {height > 28 && (
                      <div className={styles.eventTime} style={{ color: color + '99' }}>
                        {startStr} – {endStr}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Now line — only on today's column */}
              {isTodayCol && nowMinutes >= 7 * 60 && nowMinutes <= 22 * 60 && (
                <div className={styles.nowLine} style={{ top: nowTop }}>
                  <div className={styles.nowDot} />
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
