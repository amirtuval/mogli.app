import { useEffect, useMemo, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import type { Account, MessageMeta } from '../types/models'
import { useThread } from '../hooks/useThread'
import { useUIStore } from '../store/uiStore'
import styles from './EmailDetail.module.css'

/**
 * Strip dangerous content from email HTML:
 * - Remove <script> blocks
 * - Remove on* event-handler attributes (onerror, onload, etc.)
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on\w+\s*=\s*'[^']*'/gi, '')
}

/**
 * Renders email HTML inside a Shadow DOM to isolate it from the app's
 * global CSS reset (which strips margins/padding from all elements and
 * collapses email layouts). The shadow root provides a clean rendering
 * context where the email's own styles work correctly.
 */
function ShadowHtml({ html, theme }: { html: string; theme: string }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // Attach shadow root only once
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })

    // Theme-aware email background so the content blends with the app
    const colors =
      theme === 'light'
        ? { bg: '#ffffff', fg: '#1a1a1a', link: '#1a73e8' }
        : theme === 'dark'
          ? { bg: '#2a2a2e', fg: '#e0e0e0', link: '#6cb6ff' }
          : { bg: '#0c0c0e', fg: '#d0d0d0', link: '#6cb6ff' } // ultraDark
    const { bg, fg, link: linkColor } = colors
    shadow.innerHTML = `<style>
:host { display: block; }
div { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px; line-height: 1.75; color: ${fg}; background: ${bg};
  word-wrap: break-word; overflow-wrap: break-word; }
img { max-width: 100%; height: auto; }
a { color: ${linkColor}; cursor: pointer; }
</style><div>${sanitizeHtml(html)}</div>`

    // Intercept link clicks inside the shadow DOM and open them in the
    // system browser instead of navigating the Tauri webview.
    const handleClick = (e: Event) => {
      const anchor = (e.target as HTMLElement).closest?.('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        e.preventDefault()
        void shellOpen(href)
      }
    }
    shadow.addEventListener('click', handleClick)
    return () => shadow.removeEventListener('click', handleClick)
  }, [html, theme])

  return <div ref={hostRef} className={styles.bodyHtml} />
}

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
          <ShadowHtml html={message.body_html} theme={theme} />
        ) : message.body_text ? (
          <div className={styles.bodyText}>{message.body_text}</div>
        ) : (
          <div className={styles.bodyText}>
            {selectedMessage?.snippet || '(No content available)'}
          </div>
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
