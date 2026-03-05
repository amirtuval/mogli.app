import { useMemo } from 'react'
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

  const selectedMessage = useMemo(
    () => messages?.find((m) => m.thread_id === selectedThreadId),
    [messages, selectedThreadId],
  )

  return (
    <div className={styles.mailView}>
      <EmailList
        messages={messages}
        accounts={accounts}
        isLoading={isLoading}
        selectedLabel={selectedLabel}
      />
      <EmailDetail accounts={accounts} selectedMessage={selectedMessage} />
    </div>
  )
}
