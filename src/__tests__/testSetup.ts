/**
 * Vitest setup file for component tests.
 * Mocks Tauri APIs so components can be tested without the Tauri runtime.
 */
import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Mock @tauri-apps/api/core
// Default returns a resolved Promise so .catch() chains work (e.g. uiStore setTheme)
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}))

// Mock @tauri-apps/api/event
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}))

// Mock @tauri-apps/api/app
vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(() => Promise.resolve('0.2.1')),
}))

// Mock @tauri-apps/plugin-shell
vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(() => Promise.resolve()),
}))
