import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import { useQueryClient } from '@tanstack/react-query'
import type { Account, Calendar, CalEvent } from '../types/models'
import { useUIStore } from '../store/uiStore'
import styles from './EventModal.module.css'

interface EventModalProps {
  accounts: Account[]
  calendars: Calendar[]
  onSaved: () => void
}

interface ReminderEntry {
  id: number
  type: 'preset' | 'custom'
  /** Total minutes before event. */
  minutes: number
  /** Only used when type === 'custom' */
  customValue?: number
  customUnit?: 'minutes' | 'hours' | 'days' | 'weeks'
}

const PRESET_OPTIONS = [
  { value: '0', label: 'At time of event' },
  { value: '5', label: '5 minutes before' },
  { value: '10', label: '10 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '180', label: '3 hours before' },
  { value: '840', label: '14 hours before' },
  { value: '1440', label: '1 day before' },
  { value: '2880', label: '2 days before' },
  { value: '10080', label: '1 week before' },
  { value: 'custom', label: 'Custom…' },
]

const UNIT_MULTIPLIERS: Record<string, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
  weeks: 10080,
}

let nextReminderId = 1

function makeDefaultReminder(): ReminderEntry {
  return { id: nextReminderId++, type: 'preset', minutes: 10 }
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

/** Parse "HH:MM" to total minutes since midnight. */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Convert total minutes since midnight to "HH:MM". */
function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  return `${pad2(h)}:${pad2(m)}`
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
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
function Linkified({ text }: { text: string }) {
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
        className={styles.linkInline}
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
  return <>{parts}</>
}

function nowRounded15(): { startTime: string; endTime: string } {
  const now = new Date()
  const { hours, minutes } = roundUpTo15(now.getHours(), now.getMinutes())
  const startMin = (hours % 24) * 60 + minutes
  const endMin = startMin + 30
  return {
    startTime: `${pad2(Math.floor(startMin / 60))}:${pad2(startMin % 60)}`,
    endTime: `${pad2(Math.floor(endMin / 60) % 24)}:${pad2(endMin % 60)}`,
  }
}

export default function EventModal({ accounts, calendars, onSaved }: EventModalProps) {
  const defaults = useUIStore((s) => s.eventModalDefaults)
  const closeEventModal = useUIStore((s) => s.closeEventModal)
  const queryClient = useQueryClient()
  const titleRef = useRef<HTMLInputElement>(null)

  const isEdit = defaults?.mode === 'edit'

  // Compute initial values from defaults or current time
  const initial = useMemo(() => {
    if (defaults) return defaults
    const { startTime, endTime } = nowRounded15()
    return { mode: 'create' as const, date: todayISO(), startTime, endTime }
  }, [defaults])

  const [titleValue, setTitle] = useState(initial.title ?? '')
  const [date, setDate] = useState(initial.date)
  const [endDate, setEndDate] = useState(initial.endDate ?? initial.date)
  const [startTime, setStartTime] = useState(initial.startTime)
  const [endTime, setEndTime] = useState(initial.endTime)
  const [allDay, setAllDay] = useState(initial.allDay ?? false)
  const [location, setLocation] = useState(initial.location ?? '')
  const [description, setDescription] = useState(initial.description ?? '')
  const [showDesc, setShowDesc] = useState(!!initial.description)
  const [recurrence, setRecurrence] = useState(initial.recurrence ?? 'none')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  // Read-only ↔ edit toggle for location and description
  const [editingLocation, setEditingLocation] = useState(!isEdit || !initial.location)
  const [editingDesc, setEditingDesc] = useState(!isEdit || !initial.description)
  const locationInputRef = useRef<HTMLInputElement>(null)
  const descTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Multiple reminders
  const [reminders, setReminders] = useState<ReminderEntry[]>(() => {
    const initReminders = initial.reminders
    if (initReminders && initReminders.length > 0) {
      return initReminders.map((m) => ({
        id: nextReminderId++,
        type: 'preset' as const,
        minutes: m,
      }))
    }
    return [makeDefaultReminder()]
  })

  // Calendar selector state
  const enabledCalendars = useMemo(() => calendars.filter((c) => c.enabled), [calendars])
  const defaultCalendar = useMemo(() => {
    if (isEdit && initial.calendarId) {
      return enabledCalendars.find((c) => c.id === initial.calendarId) ?? enabledCalendars[0]
    }
    return enabledCalendars.find((c) => c.primary) ?? enabledCalendars[0]
  }, [enabledCalendars, isEdit, initial.calendarId])
  const [selectedCalId, setSelectedCalId] = useState(defaultCalendar?.id ?? '')
  const [selectedAcctId, setSelectedAcctId] = useState(
    initial.accountId ?? defaultCalendar?.account_id ?? '',
  )
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

  // ── Reminder management ──

  const updateReminder = useCallback((id: number, updates: Partial<ReminderEntry>) => {
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)))
  }, [])

  const handlePresetChange = useCallback(
    (entry: ReminderEntry, value: string) => {
      if (value === 'custom') {
        updateReminder(entry.id, {
          type: 'custom',
          minutes: 60,
          customValue: 1,
          customUnit: 'hours',
        })
      } else {
        updateReminder(entry.id, { type: 'preset', minutes: Number(value) })
      }
    },
    [updateReminder],
  )

  const handleCustomValueChange = useCallback(
    (entry: ReminderEntry, val: number) => {
      const unit = entry.customUnit ?? 'minutes'
      const totalMinutes = val * UNIT_MULTIPLIERS[unit]
      updateReminder(entry.id, { customValue: val, minutes: totalMinutes })
    },
    [updateReminder],
  )

  const handleCustomUnitChange = useCallback(
    (entry: ReminderEntry, unit: string) => {
      const val = entry.customValue ?? 1
      const totalMinutes = val * UNIT_MULTIPLIERS[unit]
      updateReminder(entry.id, {
        customUnit: unit as ReminderEntry['customUnit'],
        minutes: totalMinutes,
      })
    },
    [updateReminder],
  )

  const addReminder = useCallback(() => {
    if (reminders.length >= 5) return
    setReminders((prev) => [...prev, makeDefaultReminder()])
  }, [reminders.length])

  const removeReminder = useCallback(
    (id: number) => {
      if (reminders.length <= 1) return
      setReminders((prev) => prev.filter((r) => r.id !== id))
    },
    [reminders.length],
  )

  // ── Build timestamp helpers ──

  const buildTimestamps = (): { startTs: number; endTs: number } | null => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    void timezone // used later in the invoke call

    if (allDay) {
      if (endDate < date) {
        setError('End date must be on or after start date')
        return null
      }
      const startD = new Date(`${date}T00:00:00`)
      // Google Calendar uses exclusive end dates for all-day events,
      // so add one day to the inclusive end date.
      const endD = new Date(`${endDate}T00:00:00`)
      endD.setDate(endD.getDate() + 1)
      return {
        startTs: Math.floor(startD.getTime() / 1000),
        endTs: Math.floor(endD.getTime() / 1000),
      }
    }

    const startD = new Date(`${date}T${startTime}:00`)
    const endD = new Date(`${endDate}T${endTime}:00`)
    if (endD <= startD) {
      setError('End must be after start')
      return null
    }
    return {
      startTs: Math.floor(startD.getTime() / 1000),
      endTs: Math.floor(endD.getTime() / 1000),
    }
  }

  const buildReminderMinutes = (): number[] => {
    return reminders.map((r) => r.minutes)
  }

  const buildRecurrence = (): string[] | null => {
    if (recurrence === 'none') return null
    const freqMap: Record<string, string> = {
      daily: 'RRULE:FREQ=DAILY',
      weekly: 'RRULE:FREQ=WEEKLY',
      monthly: 'RRULE:FREQ=MONTHLY',
      yearly: 'RRULE:FREQ=YEARLY',
    }
    return freqMap[recurrence] ? [freqMap[recurrence]] : null
  }

  // ── Save (create or update) ──

  const handleSave = async () => {
    const trimmedTitle = titleValue.trim()
    if (!trimmedTitle) {
      setError('Title is required')
      return
    }

    const ts = buildTimestamps()
    if (!ts) return

    setError('')
    setSending(true)

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const recurrenceRules = buildRecurrence()
    const reminderMins = buildReminderMinutes()

    try {
      if (isEdit && initial.eventId) {
        await invoke('update_event', {
          accountId: selectedAcctId,
          calendarId: selectedCalId,
          eventId: initial.eventId,
          title: trimmedTitle,
          start: ts.startTs,
          end: ts.endTs,
          allDay,
          timezone,
          rest: {
            location: location.trim() || null,
            description: description.trim() || null,
            recurrence: recurrenceRules,
            reminder_minutes: reminderMins,
          },
        })
      } else {
        await invoke('create_event', {
          accountId: selectedAcctId,
          calendarId: selectedCalId,
          title: trimmedTitle,
          start: ts.startTs,
          end: ts.endTs,
          allDay,
          timezone,
          rest: {
            location: location.trim() || null,
            description: description.trim() || null,
            recurrence: recurrenceRules,
            reminder_minutes: reminderMins,
          },
        })
      }
      onSaved()
      closeEventModal()
    } catch (e) {
      setError(String(e))
    } finally {
      setSending(false)
    }
  }

  // ── Delete (edit mode only) ──

  const handleDelete = async () => {
    if (!isEdit || !initial.eventId) return

    setSending(true)

    // Optimistic remove from cache
    const previousCaches: { key: readonly unknown[]; data: unknown }[] = []
    queryClient.getQueriesData<CalEvent[]>({ queryKey: ['events'] }).forEach(([key, data]) => {
      if (!data) return
      previousCaches.push({ key, data })
      queryClient.setQueryData<CalEvent[]>(key, (old) =>
        old?.filter((x) => x.id !== initial.eventId),
      )
    })

    try {
      await invoke('delete_event', {
        accountId: selectedAcctId,
        calendarId: selectedCalId,
        eventId: initial.eventId,
      })
      onSaved()
      closeEventModal()
    } catch (e) {
      // Revert optimistic update
      for (const { key, data } of previousCaches) {
        queryClient.setQueryData(key, data)
      }
      setError(String(e))
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
          <h2 className={styles.title}>{isEdit ? 'Edit Event' : 'New Event'}</h2>
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

          {/* All-day toggle */}
          <div className={styles.checkboxRow}>
            <input
              type="checkbox"
              id="allDay"
              checked={allDay}
              onChange={(e) => {
                const checked = e.target.checked
                setAllDay(checked)
                if (checked && endDate < date) {
                  setEndDate(date)
                }
              }}
            />
            <label htmlFor="allDay">All day</label>
          </div>

          {/* Date fields — always show start + end date */}
          <div className={styles.row}>
            <div className={styles.field}>
              <span className={styles.label}>Start date</span>
              <input
                type="date"
                className={styles.input}
                value={date}
                onChange={(e) => {
                  const newDate = e.target.value
                  setDate(newDate)
                  if (endDate < newDate) {
                    setEndDate(newDate)
                  }
                }}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>End date</span>
              <input
                type="date"
                className={styles.input}
                value={endDate}
                min={date}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
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
                  onChange={(e) => {
                    const newStart = e.target.value
                    // Preserve duration: compute old duration, apply to new start
                    const oldStartMin = timeToMinutes(startTime)
                    const oldEndMin = timeToMinutes(endTime)
                    const duration = oldEndMin - oldStartMin
                    const newStartMin = timeToMinutes(newStart)
                    const newEndMin = Math.min(newStartMin + Math.max(duration, 15), 24 * 60)
                    setStartTime(newStart)
                    setEndTime(minutesToTime(newEndMin))
                  }}
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
            {!editingLocation && location ? (
              <div
                className={styles.readonlyValue}
                onClick={() => {
                  setEditingLocation(true)
                  requestAnimationFrame(() => locationInputRef.current?.focus())
                }}
              >
                {isUrl(location) ? (
                  <a
                    href={location}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.linkInline}
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      void shellOpen(location)
                    }}
                  >
                    {location}
                  </a>
                ) : (
                  <Linkified text={location} />
                )}
              </div>
            ) : (
              <input
                ref={locationInputRef}
                className={styles.input}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onBlur={() => {
                  if (location) setEditingLocation(false)
                }}
                placeholder="Add location (optional)"
              />
            )}
          </div>

          {/* Conference link (read-only, edit mode only) */}
          {isEdit && initial.conferenceUrl && (
            <div className={styles.field}>
              <span className={styles.label}>Video call</span>
              <div className={styles.readonlyValue}>
                <a
                  href={initial.conferenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.linkInline}
                  onClick={(e) => {
                    e.preventDefault()
                    void shellOpen(initial.conferenceUrl!)
                  }}
                >
                  ▶ Join video call
                </a>
              </div>
            </div>
          )}

          {/* Description (collapsible) */}
          {!showDesc ? (
            <button type="button" className={styles.descToggle} onClick={() => setShowDesc(true)}>
              + Add description
            </button>
          ) : (
            <div className={styles.field}>
              <span className={styles.label}>Description</span>
              {!editingDesc && description ? (
                <div
                  className={styles.readonlyValue}
                  onClick={() => {
                    setEditingDesc(true)
                    requestAnimationFrame(() => descTextareaRef.current?.focus())
                  }}
                >
                  <Linkified text={description} />
                </div>
              ) : (
                <textarea
                  ref={descTextareaRef}
                  className={styles.input}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => {
                    if (description) setEditingDesc(false)
                  }}
                  placeholder="Add description (optional)"
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              )}
            </div>
          )}

          {/* Recurrence */}
          <div className={styles.field}>
            <span className={styles.label}>Repeat</span>
            <select
              className={styles.input}
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value)}
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          {/* Reminders — multiple */}
          <div className={styles.field}>
            <span className={styles.label}>Reminders</span>
            <div className={styles.reminderList}>
              {reminders.map((entry) => (
                <div key={entry.id} className={styles.reminderRow}>
                  {entry.type === 'preset' ? (
                    <select
                      value={String(entry.minutes)}
                      onChange={(e) => handlePresetChange(entry, e.target.value)}
                    >
                      {PRESET_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <select
                        value="custom"
                        onChange={(e) => handlePresetChange(entry, e.target.value)}
                      >
                        {PRESET_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={entry.customValue ?? 1}
                        onChange={(e) =>
                          handleCustomValueChange(entry, Math.max(1, Number(e.target.value)))
                        }
                      />
                      <select
                        value={entry.customUnit ?? 'minutes'}
                        onChange={(e) => handleCustomUnitChange(entry, e.target.value)}
                      >
                        <option value="minutes">minutes</option>
                        <option value="hours">hours</option>
                        <option value="days">days</option>
                        <option value="weeks">weeks</option>
                      </select>
                    </>
                  )}
                  {reminders.length > 1 && (
                    <button
                      type="button"
                      className={styles.removeReminderBtn}
                      onClick={() => removeReminder(entry.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {reminders.length < 5 && (
                <button type="button" className={styles.addReminderBtn} onClick={addReminder}>
                  + Add reminder
                </button>
              )}
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {isEdit && (
            <button className={styles.deleteBtn} onClick={handleDelete} disabled={sending}>
              Delete
            </button>
          )}
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
