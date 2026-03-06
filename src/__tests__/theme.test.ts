import { describe, it, expect, beforeEach } from 'vitest'
import { themes, applyTheme } from '../styles/theme'
import type { Theme } from '../styles/theme'

describe('theme', () => {
  beforeEach(() => {
    // Reset inline styles on root
    document.documentElement.removeAttribute('style')
  })

  it('should define three themes', () => {
    expect(Object.keys(themes)).toEqual(['light', 'dark', 'ultraDark'])
  })

  it('should have all required CSS variables in each theme', () => {
    const requiredVars = [
      '--bg-app',
      '--bg-sidebar',
      '--bg-panel',
      '--bg-hover',
      '--bg-selected',
      '--bg-input',
      '--bg-btn',
      '--border',
      '--border-light',
      '--text-primary',
      '--text-secondary',
      '--text-muted',
      '--text-faint',
      '--scrollbar',
      '--bg-warning',
      '--text-on-warning',
    ]

    for (const themeName of Object.keys(themes) as Theme[]) {
      for (const varName of requiredVars) {
        expect(themes[themeName]).toHaveProperty(varName)
      }
    }
  })

  it('should apply CSS variables to document root', () => {
    applyTheme('dark')
    const root = document.documentElement
    expect(root.style.getPropertyValue('--bg-app')).toBe('#2a2a2e')
    expect(root.style.getPropertyValue('--text-primary')).toBe('#e8e8ec')
  })

  it('should switch themes correctly', () => {
    applyTheme('light')
    expect(document.documentElement.style.getPropertyValue('--bg-app')).toBe('#f0f0ed')

    applyTheme('ultraDark')
    expect(document.documentElement.style.getPropertyValue('--bg-app')).toBe('#0c0c0e')
  })
})
