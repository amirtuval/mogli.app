import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import type { CalEvent, Account, Calendar } from '../types/models'
import { useUIStore } from '../store/uiStore'
import styles from './CalendarView.module.css'

const HOURS = Array.from({ length: 24 }, (_, i) => i) // 00:00–23:00
const ROW_HEIGHT = 56

interface CalendarViewProps {
  events: CalEvent[] | undefined
  calendars?: Calendar[]
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
 * Uses the standard cluster + column algorithm (as in react-big-calendar):
 * 1. Sort by start ascending, then by duration descending.
 * 2. Build transitive overlap clusters — events connected by any chain of
 *    overlaps share the same cluster and column grid.
 * 3. Within each cluster, greedily assign the first available column.
 * 4. totalColumns is uniform per cluster so all events align to the same grid.
 * 5. Each event expands rightward into consecutive empty columns.
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
    if (currentCluster.length > 0 && ev.start < clusterEnd) {
      currentCluster.push(ev)
      clusterEnd = Math.max(clusterEnd, ev.end)
    } else {
      if (currentCluster.length > 0) clusters.push(currentCluster)
      currentCluster = [ev]
      clusterEnd = ev.end
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster)

  // ── Step 2: assign columns + expand within each cluster ──
  const result: LayoutEvent[] = []

  for (const cluster of clusters) {
    // Greedy first-fit column assignment
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

    // Expand each event rightward into consecutive empty columns
    for (const { event, column } of assignments) {
      let span = 1
      for (let c = column + 1; c < totalColumns; c++) {
        const blocked = assignments.some(
          (other) =>
            other.column === c &&
            other.event.start < event.end &&
            other.event.end > event.start,
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
  calendars = [],
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
      // Treat events spanning 24h+ as all-day (some holiday calendars
      // return full-day events as timed events spanning midnight-to-midnight)
      const isAllDay = event.all_day || event.end - event.start >= 86400

      // Find which day column(s) this event belongs to
      const startDate = new Date(event.start * 1000)
      for (let i = 0; i < 7; i++) {
        const day = weekDays[i]
        if (
          startDate.getFullYear() === day.getFullYear() &&
          startDate.getMonth() === day.getMonth() &&
          startDate.getDate() === day.getDate()
        ) {
          if (isAllDay) {
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

  // Auto-scroll to 7 AM on mount
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = ROW_HEIGHT * 7
    }
  }, [])

  // ── Resizable all-day header ──
  const [headerHeight, setHeaderHeight] = useState<number | null>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = headerRef.current?.offsetHeight ?? 60

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY
      setHeaderHeight(Math.max(38, startHeight + delta))
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  // ── Early return AFTER all hooks ──
  if (isLoading && !events?.length) {
    return <div className={styles.loading}>Loading calendar…</div>
  }

  const formatHour = (h: number) => h.toString().padStart(2, '0') + ':00'
  const formatMinutes = (totalMinutes: number) => {
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    return `${h}:${m.toString().padStart(2, '0')}`
  }

  const nowTop = (nowMinutes / 60) * ROW_HEIGHT

  return (
    <div
      className={styles.container}
      style={{ opacity: isFetching ? 0.5 : 1, transition: 'opacity 0.15s ease' }}
    >
      {/* ── Sticky header: day names + all-day events ── */}
      <div
        className={styles.header}
        ref={headerRef}
        style={headerHeight != null ? { maxHeight: headerHeight, overflowY: 'auto' } : undefined}
      >
        <div className={styles.headerGutter} />
        {weekDays.map((day, di) => {
          const dayData = eventsByDay.get(di)!
          const isTodayCol = isToday(day)

          return (
            <div key={di} className={styles.headerCell}>
              <div className={styles.dayHeader}>
                <span className={styles.dayName}>
                  {day.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span
                  className={`${styles.dayNumber} ${isTodayCol ? styles.dayNumberToday : ''}`}
                >
                  {day.getDate()}
                </span>
              </div>

              {dayData.allDay.length > 0 && (
                <div className={styles.allDayStrip}>
                  {dayData.allDay.map((ev) => {
                    const color = eventColor(ev, accounts)
                    const cal = calendars.find((c) => c.id === ev.calendar_id)
                    const acct = accounts.find((a) => a.id === ev.account_id)
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

                        {/* Hover popover */}
                        <div className={styles.eventPopover}>
                          <div className={styles.popoverTitle}>{ev.title}</div>
                          <div className={styles.popoverRow}>
                            <span className={styles.popoverIcon}>◷</span>
                            All day
                          </div>
                          {cal && (
                            <div className={styles.popoverRow}>
                              <span
                                className={styles.popoverDot}
                                style={{ background: cal.color || color }}
                              />
                              {cal.name}
                              {acct && (
                                <span className={styles.popoverMuted}> · {acct.email}</span>
                              )}
                            </div>
                          )}
                          {ev.location && (
                            <div className={styles.popoverRow}>
                              <span className={styles.popoverIcon}>⌖</span>
                              {ev.location}
                            </div>
                          )}
                          {ev.description && (
                            <div className={styles.popoverDesc}>{ev.description}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Resize handle for all-day section */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div className={styles.resizeHandle} onMouseDown={onResizeStart} />

      {/* ── Scrollable body: time labels + hour grids ── */}
      <div className={styles.scrollBody} ref={scrollRef}>
        {/* Time column */}
        <div className={styles.timeColumn}>
          {HOURS.map((h) => (
            <div key={h} className={styles.timeSlot}>
              <span className={styles.timeLabel}>{formatHour(h)}</span>
            </div>
          ))}
        </div>

        {/* Day grids */}
        {weekDays.map((day, di) => {
          const dayData = eventsByDay.get(di)!
          const isTodayCol = isToday(day)

          return (
            <div key={di} className={styles.dayColumn}>
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
                  const top = (startMinutes / 60) * ROW_HEIGHT
                  const height = (durationMinutes / 60) * ROW_HEIGHT - 2
                  const color = eventColor(ev, accounts)

                  const startStr = formatMinutes(startMinutes)
                  const endStr = formatMinutes(endMinutes)

                  // Side-by-side: divide the column width evenly, expand by span
                  const colWidth = 100 / totalColumns
                  const leftPercent = column * colWidth
                  const widthPercent = colWidth * span

                  const cal = calendars.find((c) => c.id === ev.calendar_id)
                  const acct = accounts.find((a) => a.id === ev.account_id)
                  // Position popover above if event is in the lower half of the grid
                  const popoverAbove = startMinutes > 14 * 60

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

                      {/* Hover popover */}
                      <div
                        className={`${styles.eventPopover} ${popoverAbove ? styles.eventPopoverAbove : ''}`}
                      >
                        <div className={styles.popoverTitle}>{ev.title}</div>
                        <div className={styles.popoverRow}>
                          <span className={styles.popoverIcon}>◷</span>
                          {startStr} – {endStr}
                        </div>
                        {cal && (
                          <div className={styles.popoverRow}>
                            <span
                              className={styles.popoverDot}
                              style={{ background: cal.color || color }}
                            />
                            {cal.name}
                            {acct && (
                              <span className={styles.popoverMuted}> · {acct.email}</span>
                            )}
                          </div>
                        )}
                        {ev.location && (
                          <div className={styles.popoverRow}>
                            <span className={styles.popoverIcon}>⌖</span>
                            {ev.location}
                          </div>
                        )}
                        {ev.description && (
                          <div className={styles.popoverDesc}>{ev.description}</div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Now line — only on today's column */}
                {isTodayCol && (
                  <div className={styles.nowLine} style={{ top: nowTop }}>
                    <div className={styles.nowDot} />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
