// Cross-platform notification helper using `notify-rust` directly.
//
// `tauri-plugin-notification` wraps `notify-rust` but fires `.show()` inside
// `tauri::async_runtime::spawn`.  On Windows the spawned Tokio task runs on a
// worker thread where `WinRT` COM is not initialised, so the toast is silently
// dropped.  Calling `notify-rust` synchronously from the command-handler
// thread avoids this entirely.
//
// On **Windows dev builds** we also need an explicit App User Model ID
// (AUMID) — the Tauri plugin intentionally skips setting one when the exe
// lives under `target/debug`.  We borrow PowerShell's registered AUMID so
// toasts display without a Start Menu shortcut.  In production the `NSIS` /
// `WiX` installer registers the app's own AUMID (`app.mogly`).

/// Send an OS notification with the given title and body.
pub fn send(title: &str, body: &str) -> Result<(), String> {
    let mut n = notify_rust::Notification::new();
    n.summary(title).body(body);

    #[cfg(windows)]
    {
        let app_id = if cfg!(debug_assertions) {
            // Borrow PowerShell's registered AUMID for dev builds
            "Microsoft.PowerShell_8wekyb3d8bbwe!App"
        } else {
            // Production builds use the AUMID registered by the installer
            "app.mogly"
        };
        n.app_id(app_id);
    }

    n.show()
        .map_err(|e| format!("Failed to send notification: {e}"))?;

    Ok(())
}
