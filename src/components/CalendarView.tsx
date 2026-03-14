import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import { useQueryClient } from '@tanstack/react-query'
import type { CalEvent, Account, Calendar } from '../types/models'
import { useUIStore } from '../store/uiStore'
import styles from './CalendarView.module.css'

const HOURS = Array.from({ length: 24 }, (_, i) => i) // 00:00–23:00
const ROW_HEIGHT = 56
const SNAP_MINUTES = 15
const MIN_DURATION_MINUTES = 15
/** Minimum pixel distance before a mouseDown is treated as a drag vs a click. */
const DRAG_THRESHOLD = 4

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

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

/** Snap minutes to nearest SNAP_MINUTES increment (e.g. 15). */
function snapMinutes(m: number): number {
  return Math.round(m / SNAP_MINUTES) * SNAP_MINUTES
}

/** Check whether a string looks like a URL (http/https). */
function isUrl(s: string): boolean {
  try {
    const url = new URL(s)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Render text with URLs turned into clickable links. */
function Linkified({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  const regex = /https?:\/\/[^\s<]+/g
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const url = match[0]
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--accent)', cursor: 'pointer' }}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void shellOpen(url)
        }}
      >
        {url}
      </a>,
    )
    lastIndex = match.index + url.length
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return <span className={className}>{parts}</span>
}

/** Convert minutes-since-midnight to "H:MM" display string. */
function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}:${m.toString().padStart(2, '0')}`
}

interface DragState {
  type: 'move' | 'resize'
  eventId: string
  event: CalEvent
  /** Original start in minutes-since-midnight */
  originalStartMin: number
  /** Original end in minutes-since-midnight */
  originalEndMin: number
  /** Current (snapped) start during drag */
  currentStartMin: number
  /** Current (snapped) end during drag */
  currentEndMin: number
  /** Day index the event is currently over */
  dayIndex: number
  /** Original day index */
  originalDayIndex: number
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
  const calendarViewMode = useUIStore((s) => s.calendarViewMode)
  const calendarViewDate = useUIStore((s) => s.calendarViewDate)
  const openEventModal = useUIStore((s) => s.openEventModal)
  const isLight = theme === 'light'
  const queryClient = useQueryClient()

  const isDayMode = calendarViewMode === 'day'
  const dayCount = isDayMode ? 1 : 7

  // Day(s) to display as Date objects
  const weekDays = useMemo(() => {
    if (isDayMode) {
      return [new Date(calendarViewDate + 'T00:00:00')]
    }
    const start = new Date(calendarWeekStart + 'T00:00:00')
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [calendarWeekStart, calendarViewDate, isDayMode])

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

  // ── Drag state ──
  const [dragState, setDragState] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const dayColumnRefs = useRef<(HTMLDivElement | null)[]>([])
  const hourGridRefs = useRef<(HTMLDivElement | null)[]>([])
  // Track whether a drag actually moved (to suppress click-to-create)
  const didDragRef = useRef(false)

  // ── Selected half-hour slot highlight ──
  const [selectedSlot, setSelectedSlot] = useState<{
    dayIndex: number
    /** Start minute of the selected 30-min block */
    startMin: number
  } | null>(null)

  /** Convert clientY relative to an hour grid into snapped minutes-since-midnight. */
  const clientYToMinutes = useCallback((clientY: number, dayIdx: number): number => {
    const grid = hourGridRefs.current[dayIdx]
    if (!grid) return 0
    const rect = grid.getBoundingClientRect()
    const offsetY = clientY - rect.top
    const rawMinutes = (offsetY / ROW_HEIGHT) * 60
    return Math.max(0, Math.min(24 * 60, snapMinutes(rawMinutes)))
  }, [])

  /** Determine which day column the cursor is over. */
  const clientXToDayIndex = useCallback(
    (clientX: number): number => {
      for (let i = 0; i < dayColumnRefs.current.length; i++) {
        const col = dayColumnRefs.current[i]
        if (!col) continue
        const rect = col.getBoundingClientRect()
        if (clientX >= rect.left && clientX <= rect.right) return i
      }
      // Fallback: clamp to edges
      const first = dayColumnRefs.current[0]
      if (first && clientX < first.getBoundingClientRect().left) return 0
      return dayCount - 1
    },
    [dayCount],
  )

  /** Open the event modal in edit mode for an existing event. */
  const openEditModal = useCallback(
    (ev: CalEvent) => {
      const startDate = new Date(ev.start * 1000)
      const endDate = new Date(ev.end * 1000)
      const dateStr = `${startDate.getFullYear()}-${pad2(startDate.getMonth() + 1)}-${pad2(startDate.getDate())}`
      const startTimeStr = `${pad2(startDate.getHours())}:${pad2(startDate.getMinutes())}`
      const endTimeStr = `${pad2(endDate.getHours())}:${pad2(endDate.getMinutes())}`

      openEventModal({
        mode: 'edit',
        date: dateStr,
        startTime: startTimeStr,
        endTime: endTimeStr,
        eventId: ev.id,
        accountId: ev.account_id,
        calendarId: ev.calendar_id,
        title: ev.title,
        allDay: ev.all_day || ev.end - ev.start >= 86400,
        location: ev.location ?? undefined,
        description: ev.description ?? undefined,
        conferenceUrl: ev.conference_url ?? undefined,
        recurrence: 'none',
        reminders: [],
      })
    },
    [openEventModal],
  )

  /**
   * Start a potential drag. The actual drag mode is deferred until the mouse
   * moves more than DRAG_THRESHOLD pixels, so a simple click (mouseDown →
   * mouseUp without significant movement) opens the edit modal instead.
   */
  const startDrag = useCallback(
    (type: 'move' | 'resize', ev: CalEvent, dayIndex: number, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setSelectedSlot(null)

      const originX = e.clientX
      const originY = e.clientY
      let dragActivated = false

      const startDate = new Date(ev.start * 1000)
      const endDate = new Date(ev.end * 1000)
      const startMin = startDate.getHours() * 60 + startDate.getMinutes()
      const endMin = endDate.getHours() * 60 + endDate.getMinutes()

      const initial: DragState = {
        type,
        eventId: ev.id,
        event: ev,
        originalStartMin: startMin,
        originalEndMin: endMin,
        currentStartMin: startMin,
        currentEndMin: endMin,
        dayIndex,
        originalDayIndex: dayIndex,
      }

      const activateDrag = () => {
        dragActivated = true
        didDragRef.current = true
        dragRef.current = initial
        setDragState(initial)
      }

      const onMouseMove = (moveEvt: MouseEvent) => {
        // Check threshold before entering drag mode
        if (!dragActivated) {
          const dx = moveEvt.clientX - originX
          const dy = moveEvt.clientY - originY
          if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return
          activateDrag()
        }

        const prev = dragRef.current
        if (!prev) return

        if (type === 'resize') {
          const newEnd = clientYToMinutes(moveEvt.clientY, prev.dayIndex)
          const clampedEnd = Math.max(prev.currentStartMin + MIN_DURATION_MINUTES, newEnd)
          if (clampedEnd !== prev.currentEndMin) {
            const next = { ...prev, currentEndMin: clampedEnd }
            dragRef.current = next
            setDragState(next)
          }
        } else {
          // Move
          const newDayIndex = clientXToDayIndex(moveEvt.clientX)
          const cursorMin = clientYToMinutes(moveEvt.clientY, newDayIndex)
          const duration = prev.originalEndMin - prev.originalStartMin
          const newStart = Math.max(
            0,
            Math.min(24 * 60 - duration, snapMinutes(cursorMin - duration / 2)),
          )
          const newEnd = newStart + duration
          if (newStart !== prev.currentStartMin || newDayIndex !== prev.dayIndex) {
            const next = {
              ...prev,
              currentStartMin: newStart,
              currentEndMin: newEnd,
              dayIndex: newDayIndex,
            }
            dragRef.current = next
            setDragState(next)
          }
        }
      }

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.removeEventListener('keydown', onKeyDown)

        if (!dragActivated) {
          // Mouse released without exceeding threshold → treat as click
          didDragRef.current = false
          // Resize handle clicks should not open the modal
          if (type === 'move') openEditModal(ev)
          return
        }

        const final = dragRef.current
        dragRef.current = null
        setDragState(null)
        didDragRef.current = false

        if (!final) return

        // Check if position actually changed
        const changed =
          final.currentStartMin !== final.originalStartMin ||
          final.currentEndMin !== final.originalEndMin ||
          final.dayIndex !== final.originalDayIndex

        if (!changed) return

        // Compute new unix timestamps
        const targetDay = weekDays[final.dayIndex]
        const newStartDate = new Date(targetDay)
        newStartDate.setHours(
          Math.floor(final.currentStartMin / 60),
          final.currentStartMin % 60,
          0,
          0,
        )
        const newEndDate = new Date(targetDay)
        newEndDate.setHours(Math.floor(final.currentEndMin / 60), final.currentEndMin % 60, 0, 0)

        const newStart = Math.floor(newStartDate.getTime() / 1000)
        const newEnd = Math.floor(newEndDate.getTime() / 1000)

        // Optimistic update: update all events query caches
        const previousCaches: { key: readonly unknown[]; data: unknown }[] = []
        queryClient.getQueriesData<CalEvent[]>({ queryKey: ['events'] }).forEach(([key, data]) => {
          if (!data) return
          previousCaches.push({ key, data })
          queryClient.setQueryData<CalEvent[]>(key, (old) =>
            old?.map((x) => (x.id === final.event.id ? { ...x, start: newStart, end: newEnd } : x)),
          )
        })

        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

        invoke<CalEvent>('update_event', {
          accountId: final.event.account_id,
          calendarId: final.event.calendar_id,
          eventId: final.event.id,
          title: final.event.title,
          start: newStart,
          end: newEnd,
          allDay: false,
          timezone,
          rest: {
            location: final.event.location,
            description: final.event.description,
          },
        }).catch(() => {
          // Revert optimistic update on error
          for (const { key, data } of previousCaches) {
            queryClient.setQueryData(key, data)
          }
        })
      }

      const onKeyDown = (keyEvt: KeyboardEvent) => {
        if (keyEvt.key === 'Escape') {
          document.removeEventListener('mousemove', onMouseMove)
          document.removeEventListener('mouseup', onMouseUp)
          document.removeEventListener('keydown', onKeyDown)
          dragRef.current = null
          setDragState(null)
          didDragRef.current = false
        }
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      document.addEventListener('keydown', onKeyDown)
    },
    [clientXToDayIndex, clientYToMinutes, openEditModal, queryClient, weekDays],
  )

  // Group events by day, computing overlap layout for timed events
  const eventsByDay = useMemo(() => {
    const map = new Map<number, { timed: LayoutEvent[]; allDay: CalEvent[] }>()
    const timedByDay = new Map<number, CalEvent[]>()
    for (let i = 0; i < dayCount; i++) {
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
      for (let i = 0; i < dayCount; i++) {
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
    for (let i = 0; i < dayCount; i++) {
      map.get(i)!.timed = computeOverlapLayout(timedByDay.get(i)!)
    }

    return map
  }, [events, weekDays, dayCount])

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

  const nowTop = (nowMinutes / 60) * ROW_HEIGHT
  const isDragging = dragState !== null

  /** Render a timed event block (used for both normal and dragged state). */
  const renderEventBlock = (
    ev: CalEvent,
    column: number,
    span: number,
    totalColumns: number,
    dayIndex: number,
    isDraggedEvent: boolean,
    overrideStartMin?: number,
    overrideEndMin?: number,
  ) => {
    const startDate = new Date(ev.start * 1000)
    const endDate = new Date(ev.end * 1000)
    const startMinutes = overrideStartMin ?? startDate.getHours() * 60 + startDate.getMinutes()
    const endMinutes = overrideEndMin ?? endDate.getHours() * 60 + endDate.getMinutes()
    const durationMinutes = endMinutes - startMinutes
    const top = (startMinutes / 60) * ROW_HEIGHT
    const height = (durationMinutes / 60) * ROW_HEIGHT - 2
    const color = eventColor(ev, accounts)

    const startStr = formatMinutes(startMinutes)
    const endStr = formatMinutes(endMinutes)

    // Side-by-side: divide the column width evenly, expand by span.
    // Leave a right margin on the last visible column so the hour grid
    // underneath remains clickable for creating new events (à la Google Cal).
    const colWidth = 100 / totalColumns
    const leftPercent = column * colWidth
    const isLastColumn = column + span >= totalColumns
    const rightInsetPct = isLastColumn ? 15 : 0
    const widthPercent = colWidth * span - rightInsetPct

    const cal = calendars.find((c) => c.id === ev.calendar_id)
    const acct = accounts.find((a) => a.id === ev.account_id)
    // Position popover above if event is in the lower half of the grid
    const popoverAbove = startMinutes > 14 * 60

    const blockClass = isDraggedEvent
      ? `${styles.eventBlock} ${styles.eventBlockDragging}`
      : styles.eventBlock

    return (
      <div
        key={isDraggedEvent ? `${ev.id}-drag` : ev.id}
        className={blockClass}
        data-testid={isDraggedEvent ? undefined : `event-block-${ev.id}`}
        style={{
          top,
          height: Math.max(height, 18),
          left: `calc(${leftPercent}% + 1px)`,
          width: `calc(${widthPercent}% - 2px)`,
          background: color + (isLight ? '1a' : '26'),
          borderLeft: `2.5px solid ${color}`,
        }}
        onMouseDown={(e) => {
          if (!isDraggedEvent) startDrag('move', ev, dayIndex, e)
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

        {/* Resize handle at bottom edge */}
        {!isDraggedEvent && (
          <div
            className={styles.resizeHandleEvent}
            data-testid={`resize-handle-${ev.id}`}
            onMouseDown={(e) => {
              e.stopPropagation()
              startDrag('resize', ev, dayIndex, e)
            }}
          />
        )}

        {/* Hover popover (suppressed during drag via CSS) */}
        {!isDraggedEvent && (
          <div className={`${styles.eventPopover} ${popoverAbove ? styles.eventPopoverAbove : ''}`}>
            <div className={styles.popoverTitle}>{ev.title}</div>
            <div className={styles.popoverRow}>
              <span className={styles.popoverIcon}>◷</span>
              {startStr} – {endStr}
            </div>
            {cal && (
              <div className={styles.popoverRow}>
                <span className={styles.popoverDot} style={{ background: cal.color || color }} />
                {cal.name}
                {acct && <span className={styles.popoverMuted}> · {acct.email}</span>}
              </div>
            )}
            {ev.location && (
              <div
                className={styles.popoverRow}
                style={
                  isUrl(ev.location) ? { cursor: 'pointer', color: 'var(--accent)' } : undefined
                }
                onClick={isUrl(ev.location) ? () => void shellOpen(ev.location!) : undefined}
              >
                <span className={styles.popoverIcon}>⌖</span>
                {ev.location}
              </div>
            )}
            {ev.conference_url && (
              <div
                className={styles.popoverRow}
                style={{ cursor: 'pointer', color: 'var(--accent)' }}
                onClick={() => void shellOpen(ev.conference_url!)}
              >
                <span className={styles.popoverIcon}>▶</span>
                Join video call
              </div>
            )}
            {ev.description && (
              <div className={styles.popoverDesc}>
                <Linkified text={ev.description} />
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={`${styles.container} ${isDragging ? styles.containerDragging : ''}`}
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
                <span className={`${styles.dayNumber} ${isTodayCol ? styles.dayNumberToday : ''}`}>
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
                        onClick={() => openEditModal(ev)}
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
                              {acct && <span className={styles.popoverMuted}> · {acct.email}</span>}
                            </div>
                          )}
                          {ev.location && (
                            <div
                              className={styles.popoverRow}
                              style={
                                isUrl(ev.location)
                                  ? { cursor: 'pointer', color: 'var(--accent)' }
                                  : undefined
                              }
                              onClick={
                                isUrl(ev.location)
                                  ? (e) => {
                                      e.stopPropagation()
                                      void shellOpen(ev.location!)
                                    }
                                  : undefined
                              }
                            >
                              <span className={styles.popoverIcon}>⌖</span>
                              {ev.location}
                            </div>
                          )}
                          {ev.conference_url && (
                            <div
                              className={styles.popoverRow}
                              style={{ cursor: 'pointer', color: 'var(--accent)' }}
                              onClick={(e) => {
                                e.stopPropagation()
                                void shellOpen(ev.conference_url!)
                              }}
                            >
                              <span className={styles.popoverIcon}>▶</span>
                              Join video call
                            </div>
                          )}
                          {ev.description && (
                            <div className={styles.popoverDesc}>
                              <Linkified text={ev.description} />
                            </div>
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
            <div
              key={di}
              className={styles.dayColumn}
              ref={(el) => {
                dayColumnRefs.current[di] = el
              }}
            >
              <div
                className={styles.hourGrid}
                ref={(el) => {
                  hourGridRefs.current[di] = el
                }}
              >
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className={styles.hourRow}
                    style={{ cursor: isDragging ? 'default' : 'crosshair' }}
                    onClick={(e) => {
                      if (isDragging || didDragRef.current) {
                        didDragRef.current = false
                        return
                      }
                      const rect = e.currentTarget.getBoundingClientRect()
                      const offsetY = e.clientY - rect.top
                      // Snap to 30-min boundary
                      const halfSlot = Math.floor((offsetY / ROW_HEIGHT) * 2)
                      const slotMin = h * 60 + halfSlot * 30
                      setSelectedSlot({ dayIndex: di, startMin: slotMin })
                    }}
                    onDoubleClick={(e) => {
                      // Suppress during/after drag
                      if (isDragging || didDragRef.current) {
                        didDragRef.current = false
                        return
                      }
                      setSelectedSlot(null)
                      const rect = e.currentTarget.getBoundingClientRect()
                      const offsetY = e.clientY - rect.top
                      const halfSlot = Math.floor((offsetY / ROW_HEIGHT) * 2)
                      const startMin = h * 60 + halfSlot * 30
                      const endMin = startMin + 30
                      const startH = Math.floor(startMin / 60)
                      const startM = startMin % 60
                      const endH = Math.floor(endMin / 60) % 24
                      const endM = endMin % 60
                      const dateStr = `${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())}`
                      openEventModal({
                        mode: 'create',
                        date: dateStr,
                        startTime: `${pad2(startH)}:${pad2(startM)}`,
                        endTime: `${pad2(endH)}:${pad2(endM)}`,
                      })
                    }}
                  />
                ))}

                {/* Timed events */}
                {dayData.timed.map(({ event: ev, column, span, totalColumns }) => {
                  // If this event is being dragged, render at the drag position
                  const isBeingDragged = dragState?.eventId === ev.id

                  if (isBeingDragged && dragState.dayIndex !== di) {
                    // Event moved to a different day — don't render in original column
                    return null
                  }

                  if (isBeingDragged) {
                    return renderEventBlock(
                      ev,
                      column,
                      span,
                      totalColumns,
                      di,
                      true,
                      dragState.currentStartMin,
                      dragState.currentEndMin,
                    )
                  }

                  return renderEventBlock(ev, column, span, totalColumns, di, false)
                })}

                {/* Render dragged event in its new day column (if moved across days) */}
                {dragState &&
                  dragState.dayIndex === di &&
                  dragState.originalDayIndex !== di &&
                  renderEventBlock(
                    dragState.event,
                    0,
                    1,
                    1,
                    di,
                    true,
                    dragState.currentStartMin,
                    dragState.currentEndMin,
                  )}

                {/* Selected half-hour slot highlight */}
                {selectedSlot && selectedSlot.dayIndex === di && (
                  <div
                    className={styles.selectedSlot}
                    style={{
                      top: (selectedSlot.startMin / 60) * ROW_HEIGHT,
                      height: (30 / 60) * ROW_HEIGHT,
                    }}
                  />
                )}

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
