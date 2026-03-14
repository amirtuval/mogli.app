import { useCallback, useMemo, useRef } from 'react'
import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns'
import type { Account, MessageMeta } from '../types/models'
import { useUIStore } from '../store/uiStore'
import styles from './EmailList.module.css'

interface EmailListProps {
  messages: MessageMeta[] | undefined
  accounts: Account[]
  isLoading: boolean
  selectedLabel: string
  searchQuery?: string
}

function formatMessageTime(dateUnix: number): string {
  const date = new Date(dateUnix * 1000)
  if (isToday(date)) return format(date, 'HH:mm')
  if (isYesterday(date)) return 'Yesterday'
  const dist = formatDistanceToNow(date, { addSuffix: false })
  // If within 7 days, show day name
  const daysDiff = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
  if (daysDiff < 7) return format(date, 'EEE')
  return dist
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className={styles.skeleton}>
          <div className={styles.skeletonContent}>
            <div className={`${styles.skeletonLine} ${styles.skeletonLineLong}`} />
            <div className={`${styles.skeletonLine} ${styles.skeletonLineMedium}`} />
            <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
          </div>
          <div className={styles.skeletonTime} />
        </div>
      ))}
    </>
  )
}

export default function EmailList({
  messages,
  accounts,
  isLoading,
  selectedLabel,
  searchQuery,
}: EmailListProps) {
  const selectedThreadId = useUIStore((s) => s.selectedThreadId)
  const setSelectedThreadId = useUIStore((s) => s.setSelectedThreadId)
  const mailFilter = useUIStore((s) => s.mailFilter)
  const toggleMailFilter = useUIStore((s) => s.toggleMailFilter)
  const selectedThreadIds = useUIStore((s) => s.selectedThreadIds)
  const toggleThreadSelection = useUIStore((s) => s.toggleThreadSelection)
  const selectAllThreads = useUIStore((s) => s.selectAllThreads)
  const clearSelection = useUIStore((s) => s.clearSelection)
  const lastSelectedThreadId = useUIStore((s) => s.lastSelectedThreadId)

  const hasSelection = selectedThreadIds.size > 0

  /** Ref to track the last shift-click anchor for range selection */
  const shiftAnchorRef = useRef<string | null>(null)

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  // Deduplicate messages by thread_id — show one row per thread.
  // Keep the latest message (by date) and aggregate unread/starred
  // across all messages in the thread. This matches Gmail's inbox
  // behavior and prevents multiple rows from highlighting on click.
  const threadMessages = useMemo(() => {
    if (!messages) return undefined
    const threadMap = new Map<string, MessageMeta>()
    for (const msg of messages) {
      const existing = threadMap.get(msg.thread_id)
      if (!existing) {
        // Clone so we can mutate flags without affecting query cache
        threadMap.set(msg.thread_id, { ...msg })
      } else {
        // Keep the latest message as the display row
        if (msg.date > existing.date) {
          const wasUnread = existing.unread
          const wasStarred = existing.starred
          threadMap.set(msg.thread_id, {
            ...msg,
            unread: msg.unread || wasUnread,
            starred: msg.starred || wasStarred,
          })
        } else {
          // Older message — just aggregate flags
          existing.unread = existing.unread || msg.unread
          existing.starred = existing.starred || msg.starred
        }
      }
    }
    const result = [...threadMap.values()]
    result.sort((a, b) => b.date - a.date)
    return result.length > 0 ? result : undefined
  }, [messages])

  const labelName = useMemo(() => {
    const labels: Record<string, string> = {
      INBOX: 'Inbox',
      STARRED: 'Starred',
      SENT: 'Sent',
      DRAFT: 'Drafts',
      ALL: 'All Mail',
      SPAM: 'Spam',
    }
    return labels[selectedLabel] ?? selectedLabel
  }, [selectedLabel])

  const isFiltered = mailFilter.unread || mailFilter.starred

  const handleCheckboxClick = useCallback(
    (threadId: string, e: React.MouseEvent) => {
      e.stopPropagation()

      if (e.shiftKey && lastSelectedThreadId && threadMessages) {
        // Range select: select all threads between last selected and current
        const ids = threadMessages.map((m) => m.thread_id)
        const lastIdx = ids.indexOf(lastSelectedThreadId)
        const currIdx = ids.indexOf(threadId)
        if (lastIdx !== -1 && currIdx !== -1) {
          const start = Math.min(lastIdx, currIdx)
          const end = Math.max(lastIdx, currIdx)
          const rangeIds = ids.slice(start, end + 1)
          const next = new Set(selectedThreadIds)
          for (const id of rangeIds) {
            next.add(id)
          }
          selectAllThreads([...next])
          return
        }
      }

      toggleThreadSelection(threadId)
      shiftAnchorRef.current = threadId
    },
    [
      lastSelectedThreadId,
      threadMessages,
      selectedThreadIds,
      selectAllThreads,
      toggleThreadSelection,
    ],
  )

  const handleRowClick = useCallback(
    (threadId: string) => {
      if (hasSelection) {
        // When in selection mode, clicking the row toggles selection
        toggleThreadSelection(threadId)
      } else {
        setSelectedThreadId(threadId)
      }
    },
    [hasSelection, toggleThreadSelection, setSelectedThreadId],
  )

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.headerInfo}>Loading · {labelName}</span>
        </div>
        <SkeletonRows />
      </div>
    )
  }

  const displayMessages = threadMessages ?? []
  const displayCount = displayMessages.length

  const allSelected =
    displayCount > 0 && displayMessages.every((m) => selectedThreadIds.has(m.thread_id))
  const someSelected = hasSelection && !allSelected

  const handleSelectAll = () => {
    if (allSelected) {
      clearSelection()
    } else {
      selectAllThreads(displayMessages.map((m) => m.thread_id))
    }
  }

  const headerText = hasSelection
    ? `${selectedThreadIds.size} selected`
    : searchQuery
      ? `${displayCount} results · "${searchQuery}"`
      : `${displayCount} threads · ${labelName}`

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        {displayCount > 0 && (
          <label className={styles.selectAllCheckbox} onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected
              }}
              onChange={handleSelectAll}
            />
          </label>
        )}
        <span className={styles.headerInfo}>{headerText}</span>
        {!hasSelection && (
          <div className={styles.filterChips}>
            <button
              className={`${styles.filterChip} ${mailFilter.unread ? styles.filterChipActive : ''}`}
              onClick={() => toggleMailFilter('unread')}
            >
              Unread
            </button>
            <button
              className={`${styles.filterChip} ${mailFilter.starred ? styles.filterChipActive : ''}`}
              onClick={() => toggleMailFilter('starred')}
            >
              Starred
            </button>
          </div>
        )}
      </div>

      {displayCount === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>◈</div>
          {searchQuery ? 'No results found' : isFiltered ? 'No matching messages' : 'No messages'}
        </div>
      ) : (
        displayMessages.map((email) => {
          const acct = accountMap.get(email.account_id)
          const isSelected = selectedThreadId === email.thread_id
          const isChecked = selectedThreadIds.has(email.thread_id)
          const borderColor = acct?.color ?? '#666'

          return (
            <div
              key={email.thread_id}
              className={`${styles.row} ${isSelected && !hasSelection ? styles.rowSelected : ''} ${isChecked ? styles.rowChecked : ''}`}
              style={{
                borderLeft: `2.5px solid ${isSelected && !hasSelection ? borderColor : borderColor + '44'}`,
              }}
              onClick={() => handleRowClick(email.thread_id)}
            >
              <label
                className={`${styles.checkbox} ${hasSelection ? styles.checkboxVisible : ''}`}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {}}
                  onClick={(e) => handleCheckboxClick(email.thread_id, e as React.MouseEvent)}
                />
              </label>
              <div className={styles.rowContent}>
                <div className={styles.senderLine}>
                  <span className={`${styles.sender} ${email.unread ? styles.senderUnread : ''}`}>
                    {email.from}
                  </span>
                  {email.starred && <span className={styles.starIcon}>★</span>}
                </div>
                <div className={styles.subject}>{email.subject}</div>
                <div className={styles.snippet}>{email.snippet}</div>
              </div>
              <div className={styles.meta}>
                <div className={`${styles.time} ${email.unread ? styles.timeUnread : ''}`}>
                  {formatMessageTime(email.date)}
                </div>
                {email.unread && <div className={styles.unreadDot} />}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
