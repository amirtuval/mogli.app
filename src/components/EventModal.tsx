import { useState, useMemo, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Account, Calendar } from '../types/models'
import { useUIStore } from '../store/uiStore'
import styles from './EventModal.module.css'

interface EventModalProps {
  accounts: Account[]
  calendars: Calendar[]
  onCreated: () => void
}

/** Round minutes up to the next 15-min slot. */
function roundUpTo15(h: number, m: number): { hours: number; minutes: number } {
  const rounded = Math.ceil(m / 15) * 15
  if (rounded >= 60) return { hours: h + 1, minutes: 0 }
  return { hours: h, minutes: rounded }
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function nowRounded15(): { startTime: string; endTime: string } {
  const now = new Date()
  const { hours, minutes } = roundUpTo15(now.getHours(), now.getMinutes())
  const startH = hours % 24
  const endH = (startH + 1) % 24
  return {
    startTime: `${pad2(startH)}:${pad2(minutes)}`,
    endTime: `${pad2(endH)}:${pad2(minutes)}`,
  }
}

export default function EventModal({ accounts, calendars, onCreated }: EventModalProps) {
  const defaults = useUIStore((s) => s.eventModalDefaults)
  const closeEventModal = useUIStore((s) => s.closeEventModal)
  const titleRef = useRef<HTMLInputElement>(null)

  // Compute initial values from defaults or current time
  const initial = useMemo(() => {
    if (defaults) return defaults
    const { startTime, endTime } = nowRounded15()
    return { date: todayISO(), startTime, endTime }
  }, [defaults])

  const [titleValue, setTitle] = useState('')
  const [date, setDate] = useState(initial.date)
  const [startTime, setStartTime] = useState(initial.startTime)
  const [endTime, setEndTime] = useState(initial.endTime)
  const [allDay, setAllDay] = useState(false)
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [showDesc, setShowDesc] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  // Calendar selector state
  const enabledCalendars = useMemo(() => calendars.filter((c) => c.enabled), [calendars])
  const defaultCalendar = useMemo(
    () => enabledCalendars.find((c) => c.primary) ?? enabledCalendars[0],
    [enabledCalendars],
  )
  const [selectedCalId, setSelectedCalId] = useState(defaultCalendar?.id ?? '')
  const [selectedAcctId, setSelectedAcctId] = useState(defaultCalendar?.account_id ?? '')
  const [calDropdownOpen, setCalDropdownOpen] = useState(false)

  const selectedCal = enabledCalendars.find((c) => c.id === selectedCalId)

  // Auto-focus title
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  // Group calendars by account for the dropdown
  const calendarsByAccount = useMemo(() => {
    const map = new Map<string, Calendar[]>()
    for (const cal of enabledCalendars) {
      const list = map.get(cal.account_id) ?? []
      list.push(cal)
      map.set(cal.account_id, list)
    }
    return map
  }, [enabledCalendars])

  const handleSave = async () => {
    const trimmedTitle = titleValue.trim()
    if (!trimmedTitle) {
      setError('Title is required')
      return
    }

    // Convert local date + time to unix timestamp
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    let startTs: number
    let endTs: number

    if (allDay) {
      // All-day: midnight local → UTC epoch; end = next day
      const startDate = new Date(`${date}T00:00:00`)
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 1)
      startTs = Math.floor(startDate.getTime() / 1000)
      endTs = Math.floor(endDate.getTime() / 1000)
    } else {
      const startDate = new Date(`${date}T${startTime}:00`)
      const endDate = new Date(`${date}T${endTime}:00`)
      if (endDate <= startDate) {
        setError('End time must be after start time')
        return
      }
      startTs = Math.floor(startDate.getTime() / 1000)
      endTs = Math.floor(endDate.getTime() / 1000)
    }

    setError('')
    setSending(true)

    try {
      await invoke('create_event', {
        accountId: selectedAcctId,
        calendarId: selectedCalId,
        title: trimmedTitle,
        start: startTs,
        end: endTs,
        allDay,
        timezone,
        location: location.trim() || null,
        description: description.trim() || null,
      })
      onCreated()
      closeEventModal()
    } catch (e) {
      setError(String(e))
    } finally {
      setSending(false)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeEventModal()
  }

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>New Event</h2>
          <button className={styles.closeBtn} onClick={closeEventModal}>
            ✕
          </button>
        </div>

        {/* Form */}
        <div className={styles.form}>
          {/* Title */}
          <div className={styles.field}>
            <span className={styles.label}>Title</span>
            <input
              ref={titleRef}
              className={styles.input}
              value={titleValue}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
            />
          </div>

          {/* Date */}
          <div className={styles.field}>
            <span className={styles.label}>Date</span>
            <input
              type="date"
              className={styles.input}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* All-day toggle */}
          <div className={styles.checkboxRow}>
            <input
              type="checkbox"
              id="allDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            <label htmlFor="allDay">All day</label>
          </div>

          {/* Time pickers — hidden when all-day */}
          {!allDay && (
            <div className={styles.row}>
              <div className={styles.field}>
                <span className={styles.label}>Start</span>
                <input
                  type="time"
                  className={styles.input}
                  value={startTime}
                  step={900}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <span className={styles.label}>End</span>
                <input
                  type="time"
                  className={styles.input}
                  value={endTime}
                  step={900}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Calendar selector */}
          <div className={styles.field}>
            <span className={styles.label}>Calendar</span>
            <div className={styles.calendarSelect}>
              <button
                type="button"
                className={styles.calendarSelectBtn}
                onClick={() => setCalDropdownOpen(!calDropdownOpen)}
              >
                <span
                  className={styles.calendarDot}
                  style={{ background: selectedCal?.color ?? '#4f9cf9' }}
                />
                {selectedCal?.name ?? 'Select calendar'}
              </button>
              {calDropdownOpen && (
                <div className={styles.calendarDropdown}>
                  {[...calendarsByAccount.entries()].map(([acctId, cals]) => {
                    const acct = accounts.find((a) => a.id === acctId)
                    return (
                      <div key={acctId}>
                        <div className={styles.calendarGroupLabel}>{acct?.email ?? acctId}</div>
                        {cals.map((cal) => (
                          <button
                            key={cal.id}
                            className={styles.calendarOption}
                            onClick={() => {
                              setSelectedCalId(cal.id)
                              setSelectedAcctId(cal.account_id)
                              setCalDropdownOpen(false)
                            }}
                          >
                            <span
                              className={styles.calendarDot}
                              style={{ background: cal.color }}
                            />
                            {cal.name}
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Location */}
          <div className={styles.field}>
            <span className={styles.label}>Location</span>
            <input
              className={styles.input}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location (optional)"
            />
          </div>

          {/* Description (collapsible) */}
          {!showDesc ? (
            <button type="button" className={styles.descToggle} onClick={() => setShowDesc(true)}>
              + Add description
            </button>
          ) : (
            <div className={styles.field}>
              <span className={styles.label}>Description</span>
              <textarea
                className={styles.input}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add description (optional)"
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.discardBtn} onClick={closeEventModal}>
            Discard
          </button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={sending}>
            {sending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
