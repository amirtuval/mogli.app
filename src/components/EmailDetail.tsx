import { useEffect, useMemo, useRef } from 'react'
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
  const autoMarkRead = useUIStore((s) => s.autoMarkRead)
  const setAutoMarkRead = useUIStore((s) => s.setAutoMarkRead)
  const queryClient = useQueryClient()

  const accountId = selectedMessage?.account_id ?? null
  const { data: thread, isLoading } = useThread(accountId, selectedThreadId)

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  // Auto-mark-read: mark thread as read after 2s if autoMarkRead is on
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (!autoMarkRead || !selectedMessage?.unread || !accountId || !selectedThreadId) return

    timerRef.current = setTimeout(() => {
      invoke('mark_read', { accountId, threadId: selectedThreadId }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['messages'] })
        queryClient.invalidateQueries({ queryKey: ['search'] })
      })
    }, 2000)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [autoMarkRead, selectedMessage?.unread, accountId, selectedThreadId, queryClient])

  const handleMarkReadUnread = async () => {
    if (!accountId || !selectedThreadId || !selectedMessage) return
    const command = selectedMessage.unread ? 'mark_read' : 'mark_unread'
    try {
      await invoke(command, { accountId, threadId: selectedThreadId })
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['search'] })
    } catch (e) {
      console.error(`${command} failed:`, e)
    }
  }

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

  const openCompose = useUIStore((s) => s.openCompose)

  const handleReply = () => {
    if (!thread || !accountId) return
    const lastMsg = thread.messages[thread.messages.length - 1]
    if (!lastMsg) return
    openCompose({
      mode: 'reply',
      threadId: thread.id,
      accountId,
      to: lastMsg.from,
      subject: lastMsg.subject,
      body: lastMsg.body_text ?? '',
    })
  }

  const handleForward = () => {
    if (!thread || !accountId) return
    const lastMsg = thread.messages[thread.messages.length - 1]
    if (!lastMsg) return
    openCompose({
      mode: 'forward',
      threadId: thread.id,
      accountId,
      subject: lastMsg.subject,
      body: lastMsg.body_text ?? '',
    })
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
        <div className={styles.subjectRow}>
          <div className={styles.subject}>{message.subject}</div>
          <label className={styles.autoMarkReadToggle}>
            <input
              type="checkbox"
              checked={autoMarkRead}
              onChange={(e) => setAutoMarkRead(e.target.checked)}
            />
            <span className={styles.autoMarkReadLabel}>Auto-read</span>
          </label>
        </div>
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
        <button className={styles.readToggleBtn} onClick={handleMarkReadUnread}>
          {selectedMessage?.unread ? '✓ Mark read' : '○ Mark unread'}
        </button>
        <button className={styles.archiveBtn} onClick={handleArchive}>
          Archive
        </button>
      </div>
    </div>
  )
}
