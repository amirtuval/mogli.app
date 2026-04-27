import { useCallback, useRef, useEffect, useState } from 'react'
import styles from './AvailabilityPanel.module.css'

const HOUR_WIDTH = 60
const TOTAL_HOURS = 24
const TOTAL_WIDTH = TOTAL_HOURS * HOUR_WIDTH
const DEFAULT_START_HOUR = 8
const MIN_DURATION = 15

interface BusyPeriod {
  start: number
  end: number
}

interface BusyEntry {
  busy: BusyPeriod[]
  hasAccess: boolean
}

interface AvailabilityPanelProps {
  organizerEmail: string
  guests: Array<{ email: string; displayName?: string }>
  date: string
  startTime: string
  endTime: string
  busyData: Map<string, BusyEntry>
  loading: boolean
  onTimeSelect: (startTime: string, endTime: string) => void
  onDateChange: (date: string) => void
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(totalMinutes, 24 * 60))
  const h = Math.floor(clamped / 60) % 24
  const m = clamped % 60
  return `${pad2(h)}:${pad2(m)}`
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12am'
  if (hour < 12) return `${hour}am`
  if (hour === 12) return '12pm'
  return `${hour - 12}pm`
}

/** Convert a unix timestamp to minutes-of-day in local time. */
function tsToMinutesOfDay(ts: number): number {
  const d = new Date(ts * 1000)
  return d.getHours() * 60 + d.getMinutes()
}

/** Snap a minute value to the nearest 15-minute interval. */
function snapTo15(minutes: number): number {
  return Math.round(minutes / 15) * 15
}

/** Convert an x pixel position within the timeline to minutes-of-day. */
function xToMinutes(x: number): number {
  return (x / TOTAL_WIDTH) * 24 * 60
}

export default function AvailabilityPanel({
  organizerEmail,
  guests,
  date,
  startTime,
  endTime,
  busyData,
  loading,
  onTimeSelect,
  onDateChange,
}: AvailabilityPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const didScrollRef = useRef(false)
  const rowsRef = useRef<HTMLDivElement>(null)

  // Drag state for resizing the event overlay
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)
  const dragRef = useRef<{
    edge: 'start' | 'end'
    anchorMin: number // the fixed edge in minutes
  } | null>(null)
  // Suppress the next click after a drag completes
  const suppressClickRef = useRef(false)

  // Scroll to the default start hour on mount
  useEffect(() => {
    if (scrollRef.current && !didScrollRef.current) {
      scrollRef.current.scrollLeft = DEFAULT_START_HOUR * HOUR_WIDTH
      didScrollRef.current = true
    }
  }, [])

  const participants = [
    { email: organizerEmail, label: 'You' },
    ...guests.map((g) => ({
      email: g.email,
      label: g.displayName ?? g.email,
    })),
  ]

  const startMin = timeToMinutes(startTime)
  const endMin = timeToMinutes(endTime)
  const duration = Math.max(endMin - startMin, MIN_DURATION)

  // --- Click to reposition ---
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const clickedMinute = xToMinutes(x)
      const snapped = snapTo15(clickedMinute)
      const newStart = Math.max(0, Math.min(snapped, 24 * 60 - duration))
      const newEnd = newStart + duration
      onTimeSelect(minutesToTime(newStart), minutesToTime(newEnd))
    },
    [duration, onTimeSelect],
  )

  // --- Drag handles to resize ---
  const handleEdgeDown = useCallback(
    (edge: 'start' | 'end', e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      const anchor = edge === 'start' ? endMin : startMin
      dragRef.current = { edge, anchorMin: anchor }
      setDragging(edge)
    },
    [startMin, endMin],
  )

  useEffect(() => {
    if (!dragging) return

    const handleMove = (e: MouseEvent) => {
      const rows = rowsRef.current
      if (!rows || !dragRef.current) return
      const rect = rows.getBoundingClientRect()
      const x = e.clientX - rect.left
      const minute = snapTo15(Math.max(0, Math.min(xToMinutes(x), 24 * 60)))
      const { edge, anchorMin } = dragRef.current

      if (edge === 'start') {
        const newStart = Math.min(minute, anchorMin - MIN_DURATION)
        onTimeSelect(minutesToTime(Math.max(0, newStart)), minutesToTime(anchorMin))
      } else {
        const newEnd = Math.max(minute, anchorMin + MIN_DURATION)
        onTimeSelect(minutesToTime(anchorMin), minutesToTime(Math.min(24 * 60, newEnd)))
      }
    }

    const handleUp = () => {
      dragRef.current = null
      setDragging(null)
      // Suppress the click that follows mouseup on the rowsArea
      suppressClickRef.current = true
      requestAnimationFrame(() => {
        // Reset after the click event has had a chance to fire
        setTimeout(() => {
          suppressClickRef.current = false
        }, 0)
      })
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [dragging, onTimeSelect])

  const eventOverlayLeft = (startMin / (24 * 60)) * TOTAL_WIDTH
  const eventOverlayWidth = (duration / (24 * 60)) * TOTAL_WIDTH

  return (
    <div className={styles.panel} data-testid="availability-panel">
      {/* Day navigation */}
      <div className={styles.dayNav}>
        <div className={styles.dayNavLeft}>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => onDateChange(shiftDate(date, -1))}
            aria-label="Previous day"
          >
            ◀
          </button>
          <span className={styles.dayLabel}>{formatDayLabel(date)}</span>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => onDateChange(shiftDate(date, 1))}
            aria-label="Next day"
          >
            ▶
          </button>
        </div>
        <span className={styles.sectionLabel}>Availability{loading ? ' (loading…)' : ''}</span>
      </div>

      {/* Grid: labels + timeline */}
      <div className={styles.gridWrapper}>
        {/* Fixed labels column */}
        <div className={styles.labels}>
          <div className={styles.labelSpacer} />
          {participants.map((p) => {
            const entry = busyData.get(p.email)
            const noAccess = entry !== undefined && !entry.hasAccess
            return (
              <div
                key={p.email}
                className={styles.labelRow}
                title={noAccess ? `${p.email} (no access)` : p.email}
              >
                {p.label}
                {noAccess && <span className={styles.noAccessIcon}> 🔒</span>}
              </div>
            )
          })}
        </div>

        {/* Scrollable timeline */}
        <div className={styles.timelineScroll} ref={scrollRef}>
          <div className={styles.timelineInner} style={{ width: TOTAL_WIDTH }}>
            {/* Hour labels */}
            <div className={styles.hourHeader} style={{ width: TOTAL_WIDTH }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  className={styles.hourTick}
                  style={{ left: h * HOUR_WIDTH, width: HOUR_WIDTH }}
                >
                  {formatHourLabel(h)}
                </div>
              ))}
            </div>

            {/* Rows area with click handler */}
            <div className={styles.rowsArea} ref={rowsRef} onClick={handleTimelineClick}>
              {/* Vertical gridlines */}
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className={styles.gridline} style={{ left: h * HOUR_WIDTH }} />
              ))}

              {/* Event overlay spanning all rows */}
              <div
                className={styles.eventOverlay}
                style={{
                  left: eventOverlayLeft,
                  width: eventOverlayWidth,
                }}
              >
                {/* Left (start) drag handle */}
                <div
                  className={styles.dragHandleLeft}
                  onMouseDown={(e) => handleEdgeDown('start', e)}
                />
                {/* Right (end) drag handle */}
                <div
                  className={styles.dragHandleRight}
                  onMouseDown={(e) => handleEdgeDown('end', e)}
                />
              </div>

              {/* Participant rows */}
              {participants.map((p) => {
                const entry = busyData.get(p.email)
                const periods = entry?.busy ?? []
                const noAccess = entry !== undefined && !entry.hasAccess
                return (
                  <div key={p.email} className={styles.trackRow}>
                    {noAccess && <div className={styles.noAccessOverlay} />}
                    {periods.map((period, i) => {
                      const bStart = tsToMinutesOfDay(period.start)
                      const bEnd = tsToMinutesOfDay(period.end)
                      const left = (bStart / (24 * 60)) * TOTAL_WIDTH
                      const width = (Math.max(bEnd - bStart, 15) / (24 * 60)) * TOTAL_WIDTH
                      return <div key={i} className={styles.busyBlock} style={{ left, width }} />
                    })}
                  </div>
                )
              })}
            </div>

            {/* Loading overlay */}
            {loading && <div className={styles.loadingOverlay}>Loading…</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
