/**
 * Vitest setup file for component tests.
 * Mocks Tauri APIs so components can be tested without the Tauri runtime.
 */
import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// Mock @tauri-apps/api/event
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}))
