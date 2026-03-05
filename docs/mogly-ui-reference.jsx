/**
 * MOGLY — UI Reference Component
 * ================================
 *
 * This file is a self-contained interactive mockup of the complete Mogly UI.
 * Use it as the visual and structural reference when implementing the
 * React/TSX components in src/components/.
 *
 * Screens covered:
 * - Mail view (3-pane: sidebar + email list + email detail)
 * - Calendar view (week grid with multi-account events)
 * - Theme system (light / dark / ultra-dark via CSS custom properties)
 * - Account toggling (per-account color coding throughout)
 * - Sidebar: mode-specific content (labels vs mini-cal + view picker)
 * - TopBar: mode-specific content (search vs week nav)
 *
 * NOT included here — to be built separately:
 * - Welcome / onboarding page (WelcomePage.tsx)
 * - Compose modal
 * - Real data — all data below is hardcoded mock data
 * - Tauri command calls — use commands from src/types/bindings.ts
 *
 * Component mapping (this file → real implementation):
 * - App export        → App.tsx (shell only, no mock data)
 * - Sidebar aside     → Sidebar.tsx
 * - MiniCal function  → MiniCal.tsx
 * - TopBar div        → TopBar.tsx
 * - Email list div    → EmailList.tsx
 * - Email detail div  → EmailDetail.tsx
 * - Calendar grid div → CalendarView.tsx
 *
 * Design tokens:
 * - All colors via CSS custom properties (see THEMES object below)
 * - Fonts: IBM Plex Sans (UI) + IBM Plex Mono (timestamps, kbd hints)
 * - Accent color: #4f9cf9 (blue) — used for active states, today, unread dots, buttons
 * - Account colors assigned in order: #4f9cf9, #f97316, #a78bfa (see ACCOUNTS)
 *
 * Key measurements:
 * - Sidebar width: 220px
 * - Email list width: 296px
 * - Calendar time column: 50px
 * - Calendar row height: 56px per hour
 * - TopBar height: 46px
 * - Border radius on buttons/tags: 4–6px
 * - Font sizes: 9px (labels), 10px (meta/time), 11px (snippets), 12px (body), 13px (detail), 15px (subject)
 */

import { useState } from "react";

// ─── Themes ───────────────────────────────────────────────────────────────────
const THEMES = {
  light: {
    name: "Light", icon: "☀",
    vars: {
      "--bg-app":         "#f0f0ed",
      "--bg-sidebar":     "#e8e8e4",
      "--bg-panel":       "#f5f5f2",
      "--bg-hover":       "#e0e0dc",
      "--bg-selected":    "#d8d8d4",
      "--bg-input":       "#e4e4e0",
      "--bg-btn":         "#dcdcd8",
      "--border":         "#ccccc7",
      "--border-light":   "#d8d8d4",
      "--text-primary":   "#1a1a18",
      "--text-secondary": "#5a5a56",
      "--text-muted":     "#8a8a85",
      "--text-faint":     "#b8b8b2",
      "--scrollbar":      "#c4c4be",
    },
  },
  dark: {
    name: "Dark", icon: "◑",
    vars: {
      "--bg-app":         "#2a2a2e",
      "--bg-sidebar":     "#222226",
      "--bg-panel":       "#2a2a2e",
      "--bg-hover":       "#2e2e33",
      "--bg-selected":    "#34343a",
      "--bg-input":       "#323237",
      "--bg-btn":         "#3a3a40",
      "--border":         "#323237",
      "--border-light":   "#2c2c31",
      "--text-primary":   "#e8e8ec",
      "--text-secondary": "#a8a8ae",
      "--text-muted":     "#66666c",
      "--text-faint":     "#3a3a40",
      "--scrollbar":      "#3a3a40",
    },
  },
  ultraDark: {
    name: "Ultra Dark", icon: "●",
    vars: {
      "--bg-app":         "#0c0c0e",
      "--bg-sidebar":     "#080809",
      "--bg-panel":       "#0c0c0e",
      "--bg-hover":       "#111114",
      "--bg-selected":    "#171719",
      "--bg-input":       "#131315",
      "--bg-btn":         "#1c1c1f",
      "--border":         "#191919",
      "--border-light":   "#111113",
      "--text-primary":   "#c4c4c8",
      "--text-secondary": "#606064",
      "--text-muted":     "#383839",
      "--text-faint":     "#202021",
      "--scrollbar":      "#1c1c1f",
    },
  },
};

// ─── Data ─────────────────────────────────────────────────────────────────────
const ACCOUNTS = [
  { id: "work",     label: "work",     email: "amir@tabnine.com",   color: "#4f9cf9" },
  { id: "personal", label: "personal", email: "amir@gmail.com",     color: "#f97316" },
  { id: "side",     label: "side",     email: "amir@sidproject.io", color: "#a78bfa" },
];

const EMAILS = [
  { id: 1, account: "work",     from: "Dror Cohen",     subject: "Re: Q2 roadmap sync",                  snippet: "Sounds good, let's move the meeting to Thursday afternoon instead.",                time: "10:41",     unread: true,  starred: false },
  { id: 2, account: "personal", from: "Netflix",        subject: "New on Netflix this week",             snippet: "Your weekly digest of what's new and trending on Netflix.",                       time: "09:12",     unread: true,  starred: false },
  { id: 3, account: "work",     from: "GitHub",         subject: "[tabnine/core] PR #2847 approved",     snippet: "refactor: replace neo4j with pg-cypher layer — approved by 2 reviewers.",        time: "08:55",     unread: false, starred: true  },
  { id: 4, account: "side",     from: "Stripe",         subject: "Your payout of $148.00 is on the way", snippet: "A payment of $148.00 has been initiated to your bank account ending in 4821.",   time: "Yesterday", unread: false, starred: false },
  { id: 5, account: "work",     from: "Yael Mizrahi",   subject: "Acquisition update — NDA attached",    snippet: "Hi Amir, please review the updated NDA before our call on Friday.",               time: "Yesterday", unread: false, starred: true  },
  { id: 6, account: "personal", from: "Wolt",           subject: "Your order is on the way 🛵",          snippet: "Your order from Hakosem is being prepared and will arrive in ~25 min.",           time: "Tue",       unread: false, starred: false },
  { id: 7, account: "work",     from: "Oren Ben-David", subject: "CLI signing pipeline — SHA-256 cert",  snippet: "The DigiCert cert expires in 14 days. Should we renew or migrate the pipeline?",  time: "Tue",       unread: false, starred: false },
  { id: 8, account: "side",     from: "Cloudflare",     subject: "Domain renewal reminder",              snippet: "Your domain sidproject.io will expire in 30 days. Renew now to avoid disruption.", time: "Mon",      unread: false, starred: false },
];

const EVENTS = [
  { id: 1, account: "work",     title: "Q2 Roadmap Sync",             start: 9,  duration: 1,   day: 5, color: "#4f9cf9" },
  { id: 2, account: "work",     title: "1:1 with Oren",               start: 11, duration: 0.5, day: 5, color: "#4f9cf9" },
  { id: 3, account: "personal", title: "Ofek — School pickup",        start: 15, duration: 0.5, day: 5, color: "#f97316" },
  { id: 4, account: "work",     title: "Acquisition call — NDA review", start: 14, duration: 1.5, day: 6, color: "#4f9cf9" },
  { id: 5, account: "personal", title: "Andorra trip planning 🎿",    start: 20, duration: 1,   day: 6, color: "#f97316" },
  { id: 6, account: "work",     title: "PR review session",           start: 10, duration: 1,   day: 7, color: "#4f9cf9" },
  { id: 7, account: "side",     title: "Side project deploy",         start: 21, duration: 0.5, day: 7, color: "#a78bfa" },
  { id: 8, account: "work",     title: "All-hands",                   start: 9,  duration: 2,   day: 8, color: "#4f9cf9" },
  { id: 9, account: "personal", title: "Gym",                         start: 7,  duration: 1,   day: 9, color: "#f97316" },
];

const DAYS  = ["Thu", "Fri", "Sat", "Sun", "Mon"];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7);
const MAIL_LABELS = [
  ["Inbox","◉"], ["Starred","◆"], ["Sent","◀"], ["Drafts","◧"], ["All Mail","◈"], ["Spam","⊘"],
];
// Per-account calendars (multiple per account)
const CALENDARS = [
  { id: "primary",                              accountId: "work",     name: "Amir (work)",     color: "#4f9cf9", enabled: true,  primary: true  },
  { id: "team@tabnine.com",                     accountId: "work",     name: "Team Calendar",   color: "#34d399", enabled: true,  primary: false },
  { id: "holidays@group.v.calendar.google.com", accountId: "work",     name: "Holidays in IL",  color: "#f43f5e", enabled: false, primary: false },
  { id: "primary",                              accountId: "personal", name: "Amir (personal)", color: "#f97316", enabled: true,  primary: true  },
  { id: "family@group.v.calendar.google.com",   accountId: "personal", name: "Family",          color: "#fbbf24", enabled: true,  primary: false },
  { id: "primary",                              accountId: "side",     name: "Amir (side)",     color: "#a78bfa", enabled: true,  primary: true  },
];

// ─── Welcome Page ─────────────────────────────────────────────────────────────
// Shown when no accounts are connected. Supports adding multiple accounts
// before proceeding. In the real app this is the initial screen before the
// main shell renders.
// Component: WelcomePage.tsx
// Real impl calls: commands.addAccount() and navigates on "Continue"
function WelcomePage({ onContinue, theme }) {
  const [connectedAccounts, setConnectedAccounts] = useState([]);
  const [connecting, setConnecting] = useState(false);

  const MOCK_ACCOUNTS = [
    { id: "work",     email: "amir@tabnine.com",   color: "#4f9cf9", label: "work"     },
    { id: "personal", email: "amir@gmail.com",      color: "#f97316", label: "personal" },
    { id: "side",     email: "amir@sidproject.io",  color: "#a78bfa", label: "side"     },
  ];

  const handleConnect = async () => {
    setConnecting(true);
    await new Promise(r => setTimeout(r, 800));
    const next = MOCK_ACCOUNTS[connectedAccounts.length];
    if (next) setConnectedAccounts(prev => [...prev, next]);
    setConnecting(false);
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: "100%", height: "100%",
      background: "var(--bg-app)", color: "var(--text-primary)",
      fontFamily: "'IBM Plex Sans', sans-serif",
      ...theme.vars,
    }}>
      <div style={{ textAlign: "center", width: 380, padding: "0 24px" }}>
        <div style={{ fontSize: 52, color: "#4f9cf9", marginBottom: 14, lineHeight: 1 }}>⬡</div>
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "0.02em", marginBottom: 8, color: "var(--text-primary)" }}>Mogly</div>
        <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 6, lineHeight: 1.5 }}>
          All your Google accounts, one place.
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 32, lineHeight: 1.7 }}>
          Mogly unifies your Gmail inboxes and Google Calendars<br/>without downloading your email.
        </div>

        {connectedAccounts.length > 0 && (
          <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {connectedAccounts.map(a => (
              <div key={a.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "var(--bg-sidebar)", border: "1px solid var(--border)",
                borderRadius: 8, padding: "10px 14px", textAlign: "left",
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: a.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{a.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.email}</div>
                </div>
                <span style={{ color: a.color, fontSize: 11 }}>✓</span>
              </div>
            ))}
          </div>
        )}

        {connectedAccounts.length < 3 && (
          <button onClick={handleConnect} disabled={connecting} style={{
            width: "100%", padding: "11px 20px", marginBottom: 10,
            background: connectedAccounts.length === 0 ? "#4f9cf9" : "var(--bg-btn)",
            color: connectedAccounts.length === 0 ? "#fff" : "var(--text-secondary)",
            border: "1px solid var(--border)",
            borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: connecting ? "wait" : "pointer",
            fontFamily: "inherit", opacity: connecting ? 0.7 : 1,
            transition: "opacity 0.15s",
          }}>
            {connecting ? "Opening browser..." :
             connectedAccounts.length === 0 ? "Connect a Google Account" : "+ Add another account"}
          </button>
        )}

        {connectedAccounts.length > 0 && (
          <button onClick={onContinue} style={{
            width: "100%", padding: "11px 20px",
            background: "#4f9cf9", color: "#fff",
            border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            Continue to Mogly →
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Mini calendar for sidebar ────────────────────────────────────────────────
function MiniCal({ isLight }) {
  const days = ["M","T","W","T","F","S","S"];
  // March 2026: starts on Sunday (index 6), 31 days
  const offset = 6; // Sunday = index 6 in Mon-first grid
  const cells = Array.from({ length: 35 }, (_, i) => {
    const d = i - offset + 1;
    return d >= 1 && d <= 31 ? d : null;
  });
  return (
    <div style={{ padding:"12px 14px 8px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
        <span style={{ fontSize:11, fontWeight:500, color:"var(--text-secondary)" }}>March 2026</span>
        <div style={{ display:"flex", gap:4 }}>
          {["‹","›"].map(a => (
            <button key={a} style={{
              background:"none", border:"none", color:"var(--text-muted)",
              fontSize:12, cursor:"pointer", padding:"0 2px", fontFamily:"inherit",
            }}>{a}</button>
          ))}
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:"2px 0" }}>
        {days.map((d,i) => (
          <div key={i} style={{ fontSize:9, color:"var(--text-muted)", textAlign:"center", padding:"2px 0", letterSpacing:"0.05em" }}>{d}</div>
        ))}
        {cells.map((d, i) => (
          <div key={i} style={{
            fontSize:11, textAlign:"center", padding:"3px 0", borderRadius:3,
            cursor: d ? "pointer" : "default",
            fontWeight: d === 5 ? 600 : 400,
            background: d === 5 ? "#4f9cf9" : "transparent",
            color: d === 5 ? "#fff"
                 : d ? "var(--text-secondary)"
                 : "transparent",
          }}>{d || ""}</div>
        ))}
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [themeName,       setThemeName]       = useState("dark");
  const [showWelcome,     setShowWelcome]     = useState(true);   // set false to preview main app
  const [activeView,      setActiveView]      = useState("mail");
  const [activeAccounts,  setActiveAccounts]  = useState(new Set(["work", "personal", "side"]));
  const [selectedEmail,   setSelectedEmail]   = useState(null);
  const [selectedLabel,   setSelectedLabel]   = useState("Inbox");
  const [calendarState,   setCalendarState]   = useState(
    Object.fromEntries(CALENDARS.map(c => [`${c.accountId}::${c.id}`, c.enabled]))
  );

  const theme   = THEMES[themeName];
  const isLight = themeName === "light";

  const toggleAccount = (id) => {
    setActiveAccounts(prev => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); }
      else next.add(id);
      return next;
    });
  };

  const filteredEmails = EMAILS.filter(e => activeAccounts.has(e.account));
  const filteredEvents = EVENTS.filter(e => activeAccounts.has(e.account));
  const unreadCount    = filteredEmails.filter(e => e.unread).length;
  const acct           = (id) => ACCOUNTS.find(a => a.id === id);

  return (
    <div style={{ display:"flex", height:"100vh", width:"100%", fontFamily:"'IBM Plex Sans',sans-serif", overflow:"hidden", ...theme.vars }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:var(--scrollbar); border-radius:2px; }
        .hover-row:hover   { background:var(--bg-hover) !important; cursor:pointer; }
        .nav-item:hover    { background:var(--bg-hover) !important; cursor:pointer; }
        .acct-pill:hover   { opacity:0.75 !important; cursor:pointer; }
        .icon-btn:hover    { background:var(--bg-hover) !important; }
        .theme-btn         { transition:all 0.12s; cursor:pointer; }
        .theme-btn:hover   { opacity:0.75; }
        .mini-cal-day:hover { background:var(--bg-hover) !important; }
      `}</style>

      {/* ══════════════════════════════════════════
          SIDEBAR
      ══════════════════════════════════════════ */}
      <aside style={{
        width: 220,
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        flexShrink: 0, overflow: "hidden",
        color: "var(--text-primary)",
      }}>

        {/* ── App header: logo + themes ── */}
        <div style={{
          display:"flex", alignItems:"center", gap:8,
          padding:"13px 14px 11px",
          borderBottom:"1px solid var(--border)",
          flexShrink:0,
        }}>
          <div style={{ fontSize:17, color:"#4f9cf9", lineHeight:1, flexShrink:0 }}>⬡</div>
          <span style={{ fontSize:13, fontWeight:600, letterSpacing:"0.03em", flex:1, color:"var(--text-primary)" }}>Unify</span>
          <div style={{ display:"flex", gap:3 }}>
            {Object.entries(THEMES).map(([key, t]) => (
              <button key={key} className="theme-btn"
                onClick={() => setThemeName(key)}
                title={t.name}
                style={{
                  border:"none", borderRadius:4, width:21, height:21,
                  fontSize:10, display:"flex", alignItems:"center", justifyContent:"center",
                  background: themeName === key ? "#4f9cf9" : "var(--bg-btn)",
                  color:      themeName === key ? "#fff"    : "var(--text-muted)",
                  fontFamily:"inherit",
                }}
              >{t.icon}</button>
            ))}
          </div>
        </div>

        {/* ── PRIMARY NAV: Mail / Calendar ── */}
        <div style={{
          display:"flex", padding:"10px 10px 8px",
          borderBottom:"1px solid var(--border)",
          gap:4, flexShrink:0,
        }}>
          {[
            { id:"mail",     icon:"◉", label:"Mail",     badge: unreadCount },
            { id:"calendar", icon:"▦", label:"Calendar",  badge: 0 },
          ].map(({ id, icon, label, badge }) => (
            <button key={id}
              onClick={() => setActiveView(id)}
              style={{
                flex:1, border:"none", borderRadius:6,
                padding:"7px 6px", fontSize:12, fontWeight:500,
                cursor:"pointer", fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                background: activeView === id ? "#4f9cf9"           : "var(--bg-btn)",
                color:      activeView === id ? "#fff"              : "var(--text-secondary)",
                transition:"all 0.12s",
                position:"relative",
              }}
            >
              <span style={{ fontSize:11 }}>{icon}</span>
              {label}
              {badge > 0 && (
                <span style={{
                  background: activeView === id ? "rgba(255,255,255,0.25)" : "#4f9cf9",
                  color: "#fff", fontSize:9, fontWeight:700,
                  padding:"1px 4px", borderRadius:6, lineHeight:1.4,
                }}>{badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Accounts (shared by both modes) ── */}
        <div style={{ padding:"10px 0 6px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
          <div style={{ fontSize:9, color:"var(--text-muted)", letterSpacing:"0.12em", textTransform:"uppercase", padding:"0 14px 6px" }}>
            Accounts
          </div>
          {ACCOUNTS.map(a => (
            <div key={a.id} className="acct-pill"
              onClick={() => toggleAccount(a.id)}
              style={{
                display:"flex", alignItems:"center", gap:8, padding:"5px 14px",
                opacity: activeAccounts.has(a.id) ? 1 : 0.28,
                transition:"opacity 0.15s",
              }}
            >
              <div style={{ width:7, height:7, borderRadius:"50%", background:a.color, flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, color:"var(--text-primary)", fontWeight:500 }}>{a.label}</div>
                <div style={{ fontSize:10, color:"var(--text-muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.email}</div>
              </div>
              {activeAccounts.has(a.id) && <span style={{ color:a.color, fontSize:10 }}>✓</span>}
            </div>
          ))}
          <button style={{
            background:"none", border:"none", color:"var(--text-muted)",
            fontSize:11, padding:"4px 14px", cursor:"pointer",
            width:"100%", textAlign:"left", fontFamily:"inherit",
          }}>+ Add account</button>
        </div>

        {/* ── Mode-specific sidebar content ── */}
        <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column" }}>
          {activeView === "mail" ? (
            // MAIL: label list + compose
            <>
              <div style={{ padding:"10px 0" }}>
                <div style={{ fontSize:9, color:"var(--text-muted)", letterSpacing:"0.12em", textTransform:"uppercase", padding:"0 14px 6px" }}>Labels</div>
                {MAIL_LABELS.map(([label, icon]) => (
                  <div key={label} className="nav-item"
                    onClick={() => setSelectedLabel(label)}
                    style={{
                      display:"flex", alignItems:"center", gap:8,
                      padding:"5px 14px", fontSize:12, borderRadius:5,
                      margin:"1px 6px", cursor:"pointer",
                      background: selectedLabel === label ? "var(--bg-selected)" : "transparent",
                      color:      selectedLabel === label ? "var(--text-primary)" : "var(--text-secondary)",
                    }}
                  >
                    <span style={{ fontSize:10, width:14, textAlign:"center", flexShrink:0 }}>{icon}</span>
                    {label}
                    {label === "Inbox" && unreadCount > 0 && (
                      <span style={{
                        marginLeft:"auto", background:"#4f9cf9", color:"#fff",
                        fontSize:9, fontWeight:600, padding:"1px 5px", borderRadius:8,
                      }}>{unreadCount}</span>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ marginTop:"auto", padding:"12px 14px" }}>
                <button style={{
                  width:"100%", padding:"8px", background:"#4f9cf9", color:"#fff",
                  border:"none", borderRadius:6, fontSize:12, fontWeight:600,
                  cursor:"pointer", display:"flex", alignItems:"center",
                  justifyContent:"center", gap:6, fontFamily:"inherit",
                }}>✏ Compose</button>
              </div>
            </>
          ) : (
            // CALENDAR: mini-cal + view options + new event
            <>
              <div style={{ borderBottom:"1px solid var(--border)" }}>
                <MiniCal isLight={isLight} />
              </div>
              <div style={{ padding:"10px 0" }}>
                <div style={{ fontSize:9, color:"var(--text-muted)", letterSpacing:"0.12em", textTransform:"uppercase", padding:"0 14px 6px" }}>View</div>
                {CAL_VIEWS.map(v => (
                  <div key={v} className="nav-item"
                    onClick={() => setCalView(v)}
                    style={{
                      display:"flex", alignItems:"center", gap:8,
                      padding:"5px 14px", fontSize:12, borderRadius:5,
                      margin:"1px 6px", cursor:"pointer",
                      background: calView === v ? "var(--bg-selected)" : "transparent",
                      color:      calView === v ? "var(--text-primary)" : "var(--text-secondary)",
                    }}
                  >
                    <span style={{ fontSize:10, width:14, textAlign:"center" }}>
                      {v === "Day" ? "▣" : v === "Week" ? "▦" : "⊞"}
                    </span>
                    {v}
                  </div>
                ))}
              </div>
              <div style={{ marginTop:"auto", padding:"12px 14px" }}>
                <button style={{
                  width:"100%", padding:"8px", background:"#4f9cf9", color:"#fff",
                  border:"none", borderRadius:6, fontSize:12, fontWeight:600,
                  cursor:"pointer", display:"flex", alignItems:"center",
                  justifyContent:"center", gap:6, fontFamily:"inherit",
                }}>+ New Event</button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* ══════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════ */}
      <main style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0, background:"var(--bg-app)", color:"var(--text-primary)" }}>

        {/* ── Topbar — mode-specific ── */}
        {activeView === "mail" ? (
          // MAIL topbar: search
          <div style={{
            height:46, borderBottom:"1px solid var(--border)",
            display:"flex", alignItems:"center", padding:"0 14px", gap:10, flexShrink:0,
          }}>
            <div style={{
              flex:1, background:"var(--bg-input)", border:"1px solid var(--border)",
              borderRadius:6, padding:"5px 11px", display:"flex", alignItems:"center", gap:8,
            }}>
              <span style={{ color:"var(--text-muted)", fontSize:13 }}>⌕</span>
              <span style={{ color:"var(--text-faint)", fontSize:12 }}>Search mail across all accounts...</span>
              <span style={{
                marginLeft:"auto", background:"var(--bg-btn)",
                color:"var(--text-muted)", fontSize:9, padding:"2px 5px",
                borderRadius:3, fontFamily:"'IBM Plex Mono',monospace",
              }}>⌘K</span>
            </div>
            <div style={{ display:"flex", gap:3 }}>
              {[...activeAccounts].map(id => (
                <div key={id} style={{
                  width:24, height:24, borderRadius:"50%", background:acct(id).color,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:10, fontWeight:600, color:"#fff",
                  border:"2px solid var(--bg-app)",
                }}>{acct(id).label[0].toUpperCase()}</div>
              ))}
            </div>
          </div>
        ) : (
          // CALENDAR topbar: month + week nav
          <div style={{
            height:46, borderBottom:"1px solid var(--border)",
            display:"flex", alignItems:"center", padding:"0 16px", gap:12, flexShrink:0,
          }}>
            <div style={{ display:"flex", alignItems:"baseline", gap:8, flex:1 }}>
              <span style={{ color:"var(--text-primary)", fontSize:15, fontWeight:500 }}>March 2026</span>
              <span style={{ color:"var(--text-muted)", fontSize:12 }}>Week 10</span>
            </div>
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              {["‹","Today","›"].map(b => (
                <button key={b} className="icon-btn" style={{
                  background:"var(--bg-btn)", border:"1px solid var(--border)",
                  color: b === "Today" ? "#4f9cf9" : "var(--text-secondary)",
                  fontSize:12, padding:"4px 10px", borderRadius:4,
                  cursor:"pointer", fontFamily:"inherit",
                }}>{b}</button>
              ))}
            </div>
            <div style={{ display:"flex", gap:3 }}>
              {[...activeAccounts].map(id => (
                <div key={id} style={{
                  width:24, height:24, borderRadius:"50%", background:acct(id).color,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:10, fontWeight:600, color:"#fff",
                  border:"2px solid var(--bg-app)",
                }}>{acct(id).label[0].toUpperCase()}</div>
              ))}
            </div>
          </div>
        )}

        {/* ── MAIL view ────────────────────────── */}
        {activeView === "mail" && (
          <div style={{ display:"flex", flex:1, overflow:"hidden", minHeight:0 }}>

            {/* Email list */}
            <div style={{ width:296, borderRight:"1px solid var(--border)", overflowY:"auto", flexShrink:0 }}>
              <div style={{
                padding:"8px 12px", borderBottom:"1px solid var(--border)",
                display:"flex", alignItems:"center", justifyContent:"space-between",
              }}>
                <span style={{ color:"var(--text-muted)", fontSize:11 }}>{filteredEmails.length} threads · {selectedLabel}</span>
                <div style={{ display:"flex", gap:10 }}>
                  {["Filter ▾","Sort ▾"].map(s => (
                    <span key={s} style={{ color:"var(--text-muted)", fontSize:11, cursor:"pointer" }}>{s}</span>
                  ))}
                </div>
              </div>
              {filteredEmails.map(email => (
                <div key={email.id} className="hover-row"
                  onClick={() => setSelectedEmail(email)}
                  style={{
                    display:"flex", alignItems:"stretch",
                    padding:"9px 12px 9px 0",
                    borderBottom:"1px solid var(--border-light)",
                    background: selectedEmail?.id === email.id ? "var(--bg-selected)" : "transparent",
                    borderLeft: selectedEmail?.id === email.id
                      ? `2.5px solid ${acct(email.account).color}`
                      : `2.5px solid ${acct(email.account).color}44`,
                    transition:"background 0.1s",
                  }}
                >
                  <div style={{ flex:1, minWidth:0, paddingLeft:9 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
                      <span style={{
                        fontSize:12,
                        color: email.unread ? "var(--text-primary)" : "var(--text-secondary)",
                        fontWeight: email.unread ? 500 : 400,
                      }}>{email.from}</span>
                      {email.starred && <span style={{ color:"#f97316", fontSize:9 }}>★</span>}
                    </div>
                    <div style={{ fontSize:11, color:"var(--text-secondary)", marginBottom:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{email.subject}</div>
                    <div style={{ fontSize:10, color:"var(--text-muted)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{email.snippet}</div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:5, flexShrink:0, paddingTop:1 }}>
                    <div style={{ color: email.unread ? "var(--text-primary)" : "var(--text-muted)", fontSize:10 }}>{email.time}</div>
                    {email.unread && <div style={{ width:5, height:5, borderRadius:"50%", background:"#4f9cf9" }} />}
                  </div>
                </div>
              ))}
            </div>

            {/* Detail pane */}
            <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0, background:"var(--bg-panel)" }}>
              {selectedEmail ? (
                <>
                  <div style={{ padding:"18px 22px 14px", borderBottom:"1px solid var(--border)" }}>
                    <div style={{ fontSize:15, color:"var(--text-primary)", fontWeight:500, marginBottom:12, lineHeight:1.4 }}>
                      {selectedEmail.subject}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{
                        width:30, height:30, borderRadius:"50%",
                        background:acct(selectedEmail.account).color,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:12, fontWeight:600, color:"#fff", flexShrink:0,
                      }}>{selectedEmail.from[0]}</div>
                      <div>
                        <div style={{ color:"var(--text-primary)", fontSize:13 }}>{selectedEmail.from}</div>
                        <div style={{ color:"var(--text-muted)", fontSize:11 }}>to me · via {acct(selectedEmail.account).email}</div>
                      </div>
                      <div style={{ marginLeft:"auto", color:"var(--text-muted)", fontSize:11 }}>{selectedEmail.time}</div>
                    </div>
                    <div style={{
                      display:"inline-block", marginTop:10,
                      border:`1px solid ${acct(selectedEmail.account).color}55`,
                      color:acct(selectedEmail.account).color,
                      borderRadius:3, padding:"2px 7px", fontSize:10,
                      letterSpacing:"0.05em", textTransform:"uppercase",
                      background: acct(selectedEmail.account).color + (isLight ? "11" : "1a"),
                    }}>{acct(selectedEmail.account).label}</div>
                  </div>
                  <div style={{ padding:"18px 22px", flex:1, overflowY:"auto" }}>
                    <p style={{ color:"var(--text-primary)", lineHeight:1.75, fontSize:13 }}>{selectedEmail.snippet}</p>
                    <p style={{ color:"var(--text-secondary)", marginTop:14, fontSize:13, lineHeight:1.75 }}>
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
                    </p>
                    <p style={{ color:"var(--text-secondary)", marginTop:12, fontSize:13, lineHeight:1.75 }}>
                      Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
                    </p>
                  </div>
                  <div style={{ padding:"10px 22px", borderTop:"1px solid var(--border)", display:"flex", gap:8 }}>
                    <button style={{
                      border:"none", borderRadius:5, padding:"7px 16px", fontSize:12, fontWeight:600,
                      cursor:"pointer", background:acct(selectedEmail.account).color, color:"#fff", fontFamily:"inherit",
                    }}>↩ Reply</button>
                    <button style={{
                      border:"1px solid var(--border)", borderRadius:5, padding:"7px 16px", fontSize:12,
                      cursor:"pointer", background:"transparent", color:"var(--text-secondary)", fontFamily:"inherit",
                    }}>↪ Forward</button>
                    <button style={{
                      border:"1px solid var(--border)", borderRadius:5, padding:"7px 16px", fontSize:12,
                      cursor:"pointer", background:"transparent", color:"var(--text-secondary)",
                      fontFamily:"inherit", marginLeft:"auto",
                    }}>Archive</button>
                  </div>
                </>
              ) : (
                <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                  <div style={{ fontSize:26, marginBottom:10, color:"var(--text-faint)" }}>◈</div>
                  <div style={{ color:"var(--text-muted)", fontSize:13 }}>Select a message</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CALENDAR view ────────────────────── */}
        {activeView === "calendar" && (
          <div style={{ display:"flex", flex:1, overflow:"auto", minHeight:0 }}>
            {/* Time col */}
            <div style={{ width:50, flexShrink:0, borderRight:"1px solid var(--border)" }}>
              <div style={{ height:0 }} />
              {HOURS.map(h => (
                <div key={h} style={{
                  height:56, display:"flex", alignItems:"flex-start",
                  justifyContent:"flex-end", padding:"4px 7px 0 0",
                  borderBottom:"1px solid var(--border-light)",
                }}>
                  <span style={{ color:"var(--text-muted)", fontSize:10, fontFamily:"'IBM Plex Mono',monospace" }}>
                    {h.toString().padStart(2,"0")}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {DAYS.map((day, di) => {
              const dayNum    = 5 + di;
              const isToday   = dayNum === 5;
              const dayEvents = filteredEvents.filter(e => e.day === dayNum);
              return (
                <div key={day} style={{
                  flex:1, borderRight:"1px solid var(--border)",
                  display:"flex", flexDirection:"column", minWidth:100,
                }}>
                  {/* Day header */}
                  <div style={{
                    height:38, display:"flex", flexDirection:"column",
                    alignItems:"center", justifyContent:"center",
                    borderBottom:"1px solid var(--border)", gap:1, flexShrink:0,
                  }}>
                    <span style={{ color:"var(--text-muted)", fontSize:9, textTransform:"uppercase", letterSpacing:"0.08em" }}>{day}</span>
                    <span style={{
                      width:22, height:22, borderRadius:"50%",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:12, fontWeight:500,
                      background: isToday ? "#4f9cf9" : "transparent",
                      color:      isToday ? "#fff"    : "var(--text-secondary)",
                    }}>{dayNum}</span>
                  </div>

                  {/* Hours + events */}
                  <div style={{ flex:1, position:"relative" }}>
                    {HOURS.map(h => (
                      <div key={h} style={{ height:56, borderBottom:"1px solid var(--border-light)" }} />
                    ))}
                    {dayEvents.map(ev => {
                      const top    = (ev.start - 7) * 56;
                      const height = ev.duration * 56 - 2;
                      const endH   = ev.start + ev.duration;
                      const endStr = endH % 1 === 0 ? `${endH}:00` : `${Math.floor(endH)}:30`;
                      return (
                        <div key={ev.id} style={{
                          position:"absolute", left:3, right:3, top, height,
                          borderRadius:4, padding:"4px 7px", overflow:"hidden", cursor:"pointer",
                          background: ev.color + (isLight ? "1a" : "26"),
                          borderLeft:`2.5px solid ${ev.color}`,
                        }}>
                          <div style={{ color:ev.color, fontSize:11, fontWeight:500, lineHeight:1.3 }}>{ev.title}</div>
                          <div style={{ color:ev.color+"99", fontSize:10, marginTop:2 }}>
                            {ev.start}:00 – {endStr}
                          </div>
                        </div>
                      );
                    })}
                    {isToday && (
                      <div style={{
                        position:"absolute", left:0, right:0,
                        top:(10.7 - 7) * 56, height:1,
                        background:"#4f9cf9", display:"flex", alignItems:"center", pointerEvents:"none",
                      }}>
                        <div style={{ width:7, height:7, borderRadius:"50%", background:"#4f9cf9", marginLeft:-3.5 }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
