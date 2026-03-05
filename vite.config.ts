import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Prevent Vite from obscuring Rust errors
  clearScreen: false,

  // Tauri expects a fixed port
  server: {
    port: 5173,
    strictPort: true,
  },

  // Env variables starting with TAURI_ are exposed to the frontend
  envPrefix: ['VITE_', 'TAURI_'],

  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS/Linux
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // Don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
  },

  // Vitest config
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/__tests__/testSetup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: true,
  },
})
