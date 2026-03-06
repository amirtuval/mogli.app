import type { Account, Calendar } from '../types/models'
import { MAIL_LABELS } from '../types/models'
import type { Theme, AppView, WeekStartDay } from '../store/uiStore'
import { useUIStore } from '../store/uiStore'
import { THEME_META } from '../styles/theme'
import { useAddAccount } from '../hooks/useAccounts'
import MiniCal from './MiniCal'
import CalendarList from './CalendarList'
import styles from './Sidebar.module.css'

const THEME_KEYS: Theme[] = ['light', 'dark', 'ultraDark']

interface SidebarProps {
  accounts: Account[]
  unreadCount: number
  calendars: Calendar[]
}

export default function Sidebar({ accounts, unreadCount, calendars }: SidebarProps) {
  const theme = useUIStore((s) => s.theme)
  const activeView = useUIStore((s) => s.activeView)
  const activeAccounts = useUIStore((s) => s.activeAccounts)
  const selectedLabel = useUIStore((s) => s.selectedLabel)
  const setTheme = useUIStore((s) => s.setTheme)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const toggleAccount = useUIStore((s) => s.toggleAccount)
  const setSelectedLabel = useUIStore((s) => s.setSelectedLabel)
  const weekStartDay = useUIStore((s) => s.weekStartDay)
  const setWeekStartDay = useUIStore((s) => s.setWeekStartDay)
  const addAccount = useAddAccount()

  const navItems: { id: AppView; icon: string; label: string; badge: number }[] = [
    { id: 'mail', icon: '◉', label: 'Mail', badge: unreadCount },
    { id: 'calendar', icon: '▦', label: 'Calendar', badge: 0 },
  ]

  return (
    <aside className={styles.sidebar}>
      {/* App header: logo + themes */}
      <div className={styles.header}>
        <div className={styles.logoIcon}>⬡</div>
        <span className={styles.logoText}>Mogly</span>
        <div className={styles.themeButtons}>
          {THEME_KEYS.map((key) => (
            <button
              key={key}
              className={`${styles.themeBtn} ${theme === key ? styles.themeBtnActive : ''}`}
              onClick={() => setTheme(key)}
              title={THEME_META[key].name}
            >
              {THEME_META[key].icon}
            </button>
          ))}
        </div>
      </div>

      {/* Mail / Calendar toggle */}
      <div className={styles.navToggle}>
        {navItems.map(({ id, icon, label, badge }) => (
          <button
            key={id}
            className={`${styles.navBtn} ${activeView === id ? styles.navBtnActive : ''}`}
            onClick={() => setActiveView(id)}
          >
            <span className={styles.navBtnIcon}>{icon}</span>
            {label}
            {badge > 0 && (
              <span
                className={`${styles.navBadge} ${
                  activeView === id ? styles.navBadgeActive : styles.navBadgeInactive
                }`}
              >
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Accounts */}
      <div className={styles.accountsSection}>
        <div className={styles.sectionLabel}>Accounts</div>
        {accounts.map((a) => {
          const isActive = activeAccounts.includes(a.id)
          return (
            <div
              key={a.id}
              className={`${styles.accountRow} ${!isActive ? styles.accountRowInactive : ''}`}
              onClick={() => toggleAccount(a.id)}
            >
              <div className={styles.accountDot} style={{ background: a.color }} />
              <div className={styles.accountInfo}>
                <div className={styles.accountName}>{a.display_name}</div>
                <div className={styles.accountEmail}>{a.email}</div>
              </div>
              {isActive && (
                <span className={styles.accountCheck} style={{ color: a.color }}>
                  ✓
                </span>
              )}
            </div>
          )
        })}
        <button
          className={styles.addAccountBtn}
          onClick={() => addAccount.mutate()}
          disabled={addAccount.isPending}
        >
          {addAccount.isPending ? 'Adding...' : '+ Add account'}
        </button>
      </div>

      {/* Mode-specific content */}
      <div className={styles.modeContent}>
        {activeView === 'mail' && (
          <div className={styles.labelsSection}>
            <div className={styles.sectionLabel}>Labels</div>
            {MAIL_LABELS.map(({ id, label, icon }) => (
              <div
                key={id}
                className={`${styles.labelItem} ${
                  selectedLabel === id ? styles.labelItemActive : ''
                }`}
                onClick={() => setSelectedLabel(id)}
              >
                <span className={styles.labelIcon}>{icon}</span>
                {label}
                {id === 'INBOX' && unreadCount > 0 && (
                  <span className={styles.labelBadge}>{unreadCount}</span>
                )}
              </div>
            ))}
          </div>
        )}
        {activeView === 'calendar' && (
          <>
            <div className={styles.miniCalSection}>
              <MiniCal />
            </div>
            <div className={styles.weekStartSection}>
              <span className={styles.weekStartLabel}>Week starts on</span>
              <div className={styles.weekStartToggle}>
                {([0, 1] as WeekStartDay[]).map((day) => (
                  <button
                    key={day}
                    className={`${styles.weekStartBtn} ${weekStartDay === day ? styles.weekStartBtnActive : ''}`}
                    onClick={() => setWeekStartDay(day)}
                  >
                    {day === 0 ? 'Sun' : 'Mon'}
                  </button>
                ))}
              </div>
            </div>
            <CalendarList accounts={accounts} calendars={calendars} />
          </>
        )}
      </div>
    </aside>
  )
}
