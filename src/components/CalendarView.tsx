import { useMemo, useState, useEffect } from 'react'
import type { CalEvent, Account } from '../types/models'
import { useUIStore } from '../store/uiStore'
import styles from './CalendarView.module.css'

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7) // 07:00–22:00
const ROW_HEIGHT = 56

interface CalendarViewProps {
  events: CalEvent[] | undefined
  accounts: Account[]
  isLoading: boolean
  /** True while fetching new data (even if stale data is still displayed) */
  isFetching?: boolean
}

/** Get the account color for an event (from the event's color or the account). */
function eventColor(event: CalEvent, accounts: Account[]): string {
  if (event.color) return event.color
  const acct = accounts.find((a) => a.id === event.account_id)
  return acct?.color ?? '#4f9cf9'
}

/** Represents a timed event with its computed overlap layout. */
interface LayoutEvent {
  event: CalEvent
  /** 0-based column index within an overlap group */
  column: number
  /** How many columns this event spans (expands right into empty columns) */
  span: number
  /** Total number of columns in this overlap group */
  totalColumns: number
}

/**
 * Compute side-by-side layout for overlapping timed events.
 *
 * Algorithm:
 * 1. Sort by start ascending; break ties by longer duration first.
 * 2. Build transitive overlap clusters.
 * 3. Within each cluster, greedily assign columns (first-fit).
 * 4. Each event expands rightward into consecutive empty columns
 *    (no other event in that column overlaps its time range).
 */
function computeOverlapLayout(timedEvents: CalEvent[]): LayoutEvent[] {
  if (timedEvents.length === 0) return []

  const sorted = [...timedEvents].sort(
    (a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id),
  )

  // ── Step 1: build transitive overlap clusters ──
  const clusters: CalEvent[][] = []
  let clusterEnd = -Infinity
  let currentCluster: CalEvent[] = []

  for (const ev of sorted) {
    if (ev.start < clusterEnd) {
      currentCluster.push(ev)
      clusterEnd = Math.max(clusterEnd, ev.end)
    } else {
      if (currentCluster.length > 0) clusters.push(currentCluster)
      currentCluster = [ev]
      clusterEnd = ev.end
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster)

  // ── Step 2: assign columns within each cluster ──
  const result: LayoutEvent[] = []

  for (const cluster of clusters) {
    const columnEnds: number[] = []
    const assignments: { event: CalEvent; column: number }[] = []

    for (const ev of cluster) {
      let col = -1
      for (let c = 0; c < columnEnds.length; c++) {
        if (ev.start >= columnEnds[c]) {
          col = c
          break
        }
      }
      if (col === -1) {
        col = columnEnds.length
        columnEnds.push(ev.end)
      } else {
        columnEnds[col] = ev.end
      }
      assignments.push({ event: ev, column: col })
    }

    const totalColumns = columnEnds.length

    // ── Step 3: expand events into empty columns to the right ──
    for (const { event, column } of assignments) {
      let span = 1
      for (let c = column + 1; c < totalColumns; c++) {
        // Check if any other event in column c overlaps with this event
        const blocked = assignments.some(
          (other) =>
            other.column === c && other.event.start < event.end && other.event.end > event.start,
        )
        if (blocked) break
        span++
      }
      result.push({ event, column, span, totalColumns })
    }
  }

  return result
}

export default function CalendarView({
  events,
  accounts,
  isLoading,
  isFetching = false,
}: CalendarViewProps) {
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

  // Group events by day, computing overlap layout for timed events
  const eventsByDay = useMemo(() => {
    const map = new Map<number, { timed: LayoutEvent[]; allDay: CalEvent[] }>()
    const timedByDay = new Map<number, CalEvent[]>()
    for (let i = 0; i < 7; i++) {
      map.set(i, { timed: [], allDay: [] })
      timedByDay.set(i, [])
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
          if (event.all_day) {
            map.get(i)!.allDay.push(event)
          } else {
            timedByDay.get(i)!.push(event)
          }
        }
      }
    }

    // Compute overlap layout per day
    for (let i = 0; i < 7; i++) {
      map.get(i)!.timed = computeOverlapLayout(timedByDay.get(i)!)
    }

    return map
  }, [events, weekDays])

  if (isLoading && !events?.length) {
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
    <div
      className={styles.container}
      style={{ opacity: isFetching ? 0.5 : 1, transition: 'opacity 0.15s ease' }}
    >
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
              <span className={styles.dayName}>
                {day.toLocaleDateString(undefined, { weekday: 'short' })}
              </span>
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
              {dayData.timed.map(({ event: ev, column, span, totalColumns }) => {
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

                // Side-by-side: divide the column width evenly, expand by span
                const colWidth = 100 / totalColumns
                const leftPercent = column * colWidth
                const widthPercent = colWidth * span

                return (
                  <div
                    key={ev.id}
                    className={styles.eventBlock}
                    style={{
                      top,
                      height: Math.max(height, 18),
                      left: `calc(${leftPercent}% + 1px)`,
                      width: `calc(${widthPercent}% - 2px)`,
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
