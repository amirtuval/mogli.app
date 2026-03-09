import { useState, useMemo, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useQueryClient } from '@tanstack/react-query'
import type { Account, SendMessageRequest } from '../types/models'
import { useUIStore } from '../store/uiStore'
import styles from './ComposeModal.module.css'

interface ComposeModalProps {
  accounts: Account[]
}

export default function ComposeModal({ accounts }: ComposeModalProps) {
  const composeContext = useUIStore((s) => s.composeContext)
  const closeCompose = useUIStore((s) => s.closeCompose)
  const queryClient = useQueryClient()

  const defaultAccountId = useMemo(() => {
    if (composeContext?.mode === 'reply') return composeContext.accountId
    if (composeContext?.mode === 'forward') return composeContext.accountId
    return accounts[0]?.id ?? ''
  }, [composeContext, accounts])

  const defaultTo = composeContext?.mode === 'reply' ? composeContext.to : ''
  const defaultSubject = useMemo(() => {
    if (!composeContext) return ''
    if (composeContext.mode === 'reply') {
      const s = composeContext.subject
      return s.startsWith('Re: ') ? s : `Re: ${s}`
    }
    if (composeContext.mode === 'forward') {
      const s = composeContext.subject
      return s.startsWith('Fwd: ') ? s : `Fwd: ${s}`
    }
    return ''
  }, [composeContext])

  const defaultBody = useMemo(() => {
    if (!composeContext) return ''
    if (composeContext.mode === 'reply' && composeContext.body) {
      const quoted = composeContext.body
        .split('\n')
        .map((line: string) => `> ${line}`)
        .join('\n')
      return '\n\n' + quoted
    }
    if (composeContext.mode === 'forward' && composeContext.body) {
      return '\n\n---------- Forwarded message ----------\n' + composeContext.body
    }
    return ''
  }, [composeContext])

  const [fromAccountId, setFromAccountId] = useState(defaultAccountId)
  const [fromOpen, setFromOpen] = useState(false)
  const fromRef = useRef<HTMLDivElement>(null)
  const [to, setTo] = useState(defaultTo)
  const [cc, setCc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState(defaultBody)
  const [sending, setSending] = useState(false)

  const title =
    composeContext?.mode === 'reply'
      ? 'Reply'
      : composeContext?.mode === 'forward'
        ? 'Forward'
        : 'New Message'

  const selectedAccount = accounts.find((a) => a.id === fromAccountId) ?? accounts[0]
  const acctColor = selectedAccount?.color ?? '#4f9cf9'

  // Close the From dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (fromRef.current && !fromRef.current.contains(e.target as Node)) {
        setFromOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSend = async () => {
    if (!to.trim() || !fromAccountId) return
    setSending(true)
    try {
      const request: SendMessageRequest = {
        account_id: fromAccountId,
        to: to
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        cc: showCc
          ? cc
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        subject,
        body,
      }
      await invoke('send_message', { request })
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      closeCompose()
    } catch (e) {
      console.error('Send failed:', e)
      setSending(false)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeCompose()
  }

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick} data-testid="compose-backdrop">
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.closeBtn} onClick={closeCompose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>From</label>
            <div className={styles.customSelect} ref={fromRef}>
              <button
                type="button"
                className={styles.selectTrigger}
                onClick={() => setFromOpen((o) => !o)}
              >
                <span className={styles.selectDot} style={{ background: selectedAccount?.color }} />
                {selectedAccount?.email ?? 'Select account'}
                <span className={styles.selectArrow}>{fromOpen ? '▴' : '▾'}</span>
              </button>
              {fromOpen && (
                <div className={styles.selectDropdown}>
                  {accounts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={`${styles.selectOption} ${a.id === fromAccountId ? styles.selectOptionActive : ''}`}
                      onClick={() => {
                        setFromAccountId(a.id)
                        setFromOpen(false)
                      }}
                    >
                      <span className={styles.selectDot} style={{ background: a.color }} />
                      {a.email}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>To</label>
            <input
              className={styles.input}
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
            />
          </div>

          <div className={styles.ccToggleRow}>
            <button className={styles.ccToggle} onClick={() => setShowCc(!showCc)}>
              {showCc ? '− CC' : '+ CC'}
            </button>
          </div>

          {showCc && (
            <div className={styles.field}>
              <label className={styles.label}>CC</label>
              <input
                className={styles.input}
                type="text"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="cc@example.com"
              />
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>Subject</label>
            <input
              className={styles.input}
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
            />
          </div>

          <div className={styles.field}>
            <textarea
              className={styles.textarea}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message..."
              rows={10}
            />
          </div>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.sendBtn}
            style={{ background: acctColor }}
            onClick={handleSend}
            disabled={sending || !to.trim()}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
          <button className={styles.discardBtn} onClick={closeCompose}>
            Discard
          </button>
        </div>
      </div>
    </div>
  )
}
