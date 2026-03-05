import { useMemo } from 'react'
import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns'
import type { Account, MessageMeta } from '../types/models'
import { useUIStore } from '../store/uiStore'
import styles from './EmailList.module.css'

interface EmailListProps {
  messages: MessageMeta[] | undefined
  accounts: Account[]
  isLoading: boolean
  selectedLabel: string
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
}: EmailListProps) {
  const selectedThreadId = useUIStore((s) => s.selectedThreadId)
  const setSelectedThreadId = useUIStore((s) => s.setSelectedThreadId)

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

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

  const threadCount = messages?.length ?? 0

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.headerInfo}>
          {threadCount} threads · {labelName}
        </span>
      </div>

      {threadCount === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>◈</div>
          No messages
        </div>
      ) : (
        messages?.map((email) => {
          const acct = accountMap.get(email.account_id)
          const isSelected = selectedThreadId === email.thread_id
          const borderColor = acct?.color ?? '#666'

          return (
            <div
              key={email.id}
              className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
              style={{
                borderLeft: `2.5px solid ${isSelected ? borderColor : borderColor + '44'}`,
              }}
              onClick={() => setSelectedThreadId(email.thread_id)}
            >
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
