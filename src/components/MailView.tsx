import { useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useQueryClient } from '@tanstack/react-query'
import type { Account, MessageMeta } from '../types/models'
import { useUIStore } from '../store/uiStore'
import EmailList from './EmailList'
import EmailDetail from './EmailDetail'
import styles from './MailView.module.css'

interface MailViewProps {
  accounts: Account[]
  messages: MessageMeta[] | undefined
  isLoading: boolean
}

export default function MailView({ accounts, messages, isLoading }: MailViewProps) {
  const selectedLabel = useUIStore((s) => s.selectedLabel)
  const selectedThreadId = useUIStore((s) => s.selectedThreadId)
  const searchQuery = useUIStore((s) => s.searchQuery)
  const selectedThreadIds = useUIStore((s) => s.selectedThreadIds)
  const clearSelection = useUIStore((s) => s.clearSelection)
  const queryClient = useQueryClient()
  const [bulkLoading, setBulkLoading] = useState(false)

  const hasSelection = selectedThreadIds.size > 0

  const selectedMessage = useMemo(
    () => messages?.find((m) => m.thread_id === selectedThreadId),
    [messages, selectedThreadId],
  )

  /** Build batch items from the current selection, resolving account IDs from messages. */
  const buildBatchItems = () => {
    if (!messages) return []
    const accountByThread = new Map<string, string>()
    for (const m of messages) {
      if (!accountByThread.has(m.thread_id)) {
        accountByThread.set(m.thread_id, m.account_id)
      }
    }
    return [...selectedThreadIds]
      .filter((tid) => accountByThread.has(tid))
      .map((tid) => ({ account_id: accountByThread.get(tid)!, thread_id: tid }))
  }

  const handleBulkAction = async (addLabels: string[], removeLabels: string[]) => {
    const items = buildBatchItems()
    if (items.length === 0) return
    setBulkLoading(true)
    try {
      await invoke('batch_modify_threads', {
        items,
        addLabels,
        removeLabels,
      })
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['search'] })
      queryClient.invalidateQueries({ queryKey: ['unreadCount'] })
      clearSelection()
    } catch (e) {
      console.error('Batch modify failed:', e)
    } finally {
      setBulkLoading(false)
    }
  }

  return (
    <div className={styles.mailView}>
      <EmailList
        messages={messages}
        accounts={accounts}
        isLoading={isLoading}
        selectedLabel={selectedLabel}
        searchQuery={searchQuery}
      />
      <div className={styles.detailPane}>
        {hasSelection && (
          <div className={styles.bulkBar}>
            <button
              className={styles.bulkBtn}
              disabled={bulkLoading}
              onClick={() => handleBulkAction([], ['UNREAD'])}
            >
              ✓ Mark read
            </button>
            <button
              className={styles.bulkBtn}
              disabled={bulkLoading}
              onClick={() => handleBulkAction(['UNREAD'], [])}
            >
              ○ Mark unread
            </button>
            <button
              className={styles.bulkBtn}
              disabled={bulkLoading}
              onClick={() => handleBulkAction([], ['INBOX'])}
            >
              Archive
            </button>
            <button
              className={styles.bulkBtnCancel}
              disabled={bulkLoading}
              onClick={clearSelection}
            >
              Cancel
            </button>
          </div>
        )}
        <EmailDetail accounts={accounts} selectedMessage={selectedMessage} />
      </div>
    </div>
  )
}
