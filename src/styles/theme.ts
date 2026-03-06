export type Theme = 'light' | 'dark' | 'ultraDark'

export interface ThemeVars {
  '--bg-app': string
  '--bg-sidebar': string
  '--bg-panel': string
  '--bg-hover': string
  '--bg-selected': string
  '--bg-input': string
  '--bg-btn': string
  '--border': string
  '--border-light': string
  '--text-primary': string
  '--text-secondary': string
  '--text-muted': string
  '--text-faint': string
  '--scrollbar': string
  '--bg-warning': string
  '--text-on-warning': string
}

export const themes: Record<Theme, ThemeVars> = {
  light: {
    '--bg-app': '#f0f0ed',
    '--bg-sidebar': '#e8e8e4',
    '--bg-panel': '#f5f5f2',
    '--bg-hover': '#e0e0dc',
    '--bg-selected': '#d8d8d4',
    '--bg-input': '#e4e4e0',
    '--bg-btn': '#dcdcd8',
    '--border': '#ccccc7',
    '--border-light': '#d8d8d4',
    '--text-primary': '#1a1a18',
    '--text-secondary': '#5a5a56',
    '--text-muted': '#8a8a85',
    '--text-faint': '#b8b8b2',
    '--scrollbar': '#c4c4be',
    '--bg-warning': '#fff3cd',
    '--text-on-warning': '#664d03',
  },
  dark: {
    '--bg-app': '#2a2a2e',
    '--bg-sidebar': '#222226',
    '--bg-panel': '#2a2a2e',
    '--bg-hover': '#2e2e33',
    '--bg-selected': '#34343a',
    '--bg-input': '#323237',
    '--bg-btn': '#3a3a40',
    '--border': '#323237',
    '--border-light': '#2c2c31',
    '--text-primary': '#e8e8ec',
    '--text-secondary': '#a8a8ae',
    '--text-muted': '#66666c',
    '--text-faint': '#3a3a40',
    '--scrollbar': '#3a3a40',
    '--bg-warning': '#4a3800',
    '--text-on-warning': '#ffc107',
  },
  ultraDark: {
    '--bg-app': '#0c0c0e',
    '--bg-sidebar': '#080809',
    '--bg-panel': '#0c0c0e',
    '--bg-hover': '#111114',
    '--bg-selected': '#171719',
    '--bg-input': '#131315',
    '--bg-btn': '#1c1c1f',
    '--border': '#191919',
    '--border-light': '#111113',
    '--text-primary': '#c4c4c8',
    '--text-secondary': '#606064',
    '--text-muted': '#383839',
    '--text-faint': '#202021',
    '--scrollbar': '#1c1c1f',
    '--bg-warning': '#3a2d00',
    '--text-on-warning': '#e0a800',
  },
}

export const THEME_META: Record<Theme, { name: string; icon: string }> = {
  light: { name: 'Light', icon: '☀' },
  dark: { name: 'Dark', icon: '◑' },
  ultraDark: { name: 'Ultra Dark', icon: '●' },
}

/** Apply theme CSS custom properties to the document root. */
export function applyTheme(theme: Theme): void {
  const vars = themes[theme]
  const root = document.documentElement
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
}
