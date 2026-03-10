import { useEffect, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import styles from './UpdateBanner.module.css'

type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; update: Update }
  | { status: 'downloading'; progress: number }
  | { status: 'ready' }
  | { status: 'dismissed' }

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

export default function UpdateBanner() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })

  useEffect(() => {
    let cancelled = false

    const checkForUpdate = async () => {
      try {
        const update = await check()
        if (!cancelled && update) {
          setState({ status: 'available', update })
        }
      } catch {
        // Silently ignore — network errors, dev builds, etc.
      }
    }

    // Check on mount (after a short delay to not block startup)
    const initialTimer = setTimeout(checkForUpdate, 5_000)

    // Then periodically
    const interval = setInterval(checkForUpdate, CHECK_INTERVAL_MS)

    return () => {
      cancelled = true
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [])

  const handleInstall = async () => {
    if (state.status !== 'available') return
    const { update } = state

    try {
      let totalBytes = 0
      let downloadedBytes = 0

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          totalBytes = event.data.contentLength
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength
          const progress = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0
          setState({ status: 'downloading', progress })
        } else if (event.event === 'Finished') {
          setState({ status: 'ready' })
        }
      })

      setState({ status: 'ready' })
    } catch {
      // If download fails, revert to showing the available state
      setState({ status: 'available', update })
    }
  }

  const handleRelaunch = async () => {
    await relaunch()
  }

  if (state.status === 'idle' || state.status === 'dismissed') return null

  return (
    <div className={styles.banner}>
      <span className={styles.message}>
        {state.status === 'available' && `A new version (${state.update.version}) is available.`}
        {state.status === 'downloading' && `Downloading update… ${state.progress}%`}
        {state.status === 'ready' && 'Update installed. Restart to apply.'}
      </span>

      {state.status === 'available' && <button onClick={handleInstall}>Update now</button>}
      {state.status === 'downloading' && <button disabled>Downloading…</button>}
      {state.status === 'ready' && <button onClick={handleRelaunch}>Restart</button>}

      {state.status === 'available' && (
        <button className={styles.dismiss} onClick={() => setState({ status: 'dismissed' })}>
          ✕
        </button>
      )}
    </div>
  )
}
