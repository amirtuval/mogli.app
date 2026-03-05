import { useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import type { Account, MessageMeta } from '../types/models'
import { useThread } from '../hooks/useThread'
import { useUIStore } from '../store/uiStore'
import styles from './EmailDetail.module.css'

interface EmailDetailProps {
  accounts: Account[]
  /** The selected message from the list, used to find the thread's account. */
  selectedMessage: MessageMeta | undefined
}

export default function EmailDetail({ accounts, selectedMessage }: EmailDetailProps) {
  const selectedThreadId = useUIStore((s) => s.selectedThreadId)
  const theme = useUIStore((s) => s.theme)
  const queryClient = useQueryClient()

  const accountId = selectedMessage?.account_id ?? null
  const { data: thread, isLoading } = useThread(accountId, selectedThreadId)

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const handleArchive = async () => {
    if (!accountId || !selectedThreadId) return
    try {
      await invoke('archive_thread', { accountId, threadId: selectedThreadId })
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      useUIStore.getState().setSelectedThreadId(null)
    } catch (e) {
      console.error('Archive failed:', e)
    }
  }

  const handleReply = () => {
    console.warn('Reply not yet implemented — Phase 2 stub')
  }

  const handleForward = () => {
    console.warn('Forward not yet implemented — Phase 2 stub')
  }

  if (!selectedThreadId) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>◈</div>
          <div className={styles.emptyText}>Select a message</div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading thread…</div>
      </div>
    )
  }

  // Show the last message in the thread
  const message = thread?.messages[thread.messages.length - 1]
  if (!message) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>◈</div>
          <div className={styles.emptyText}>Thread not found</div>
        </div>
      </div>
    )
  }

  const acct = accountMap.get(thread.account_id)
  const acctColor = acct?.color ?? '#666'
  const isLight = theme === 'light'
  const tagBg = acctColor + (isLight ? '11' : '1a')

  return (
    <div className={styles.container}>
      <div className={styles.headerSection}>
        <div className={styles.subject}>{message.subject}</div>
        <div className={styles.senderRow}>
          <div className={styles.senderAvatar} style={{ background: acctColor }}>
            {message.from[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <div className={styles.senderName}>{message.from}</div>
            <div className={styles.senderMeta}>to me · via {acct?.email ?? 'unknown'}</div>
          </div>
          <div className={styles.senderTime}>
            {format(new Date(message.date * 1000), 'MMM d, HH:mm')}
          </div>
        </div>
        <div
          className={styles.accountTag}
          style={{
            border: `1px solid ${acctColor}55`,
            color: acctColor,
            background: tagBg,
          }}
        >
          {acct?.display_name ?? 'unknown'}
        </div>
      </div>

      <div className={styles.body}>
        {message.body_html ? (
          <div
            className={styles.bodyHtml}
            dangerouslySetInnerHTML={{ __html: message.body_html }}
          />
        ) : (
          <div className={styles.bodyText}>{message.body_text ?? ''}</div>
        )}
      </div>

      <div className={styles.actions}>
        <button className={styles.replyBtn} style={{ background: acctColor }} onClick={handleReply}>
          ↩ Reply
        </button>
        <button className={styles.forwardBtn} onClick={handleForward}>
          ↪ Forward
        </button>
        <button className={styles.archiveBtn} onClick={handleArchive}>
          Archive
        </button>
      </div>
    </div>
  )
}
