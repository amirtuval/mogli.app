use tauri::AppHandle;
use tauri::plugin::PermissionState;
use tauri::tray::TrayIconId;
use tauri_plugin_notification::NotificationExt;

/// Check whether OS notification permission is granted.
#[tauri::command]
#[specta::specta]
pub async fn is_notification_granted(app: AppHandle) -> Result<bool, String> {
    let state = app
        .notification()
        .permission_state()
        .map_err(|e| format!("Failed to check notification permission: {e}"))?;
    Ok(state == PermissionState::Granted)
}

/// Request notification permission from the OS.
/// Returns `true` if permission was granted.
#[tauri::command]
#[specta::specta]
pub async fn request_notification_permission(app: AppHandle) -> Result<bool, String> {
    let state = app
        .notification()
        .request_permission()
        .map_err(|e| format!("Failed to request notification permission: {e}"))?;
    Ok(state == PermissionState::Granted)
}

/// Update the system tray tooltip with the current unread email count.
#[tauri::command]
#[specta::specta]
pub async fn set_tray_badge(app: AppHandle, count: u32) -> Result<(), String> {
    let tray_id = TrayIconId::new("main-tray");
    let tray = app.tray_by_id(&tray_id).ok_or("Tray icon not found")?;
    let tooltip = if count == 0 {
        "Mogly".to_string()
    } else {
        format!("Mogly — {count} unread")
    };
    tray.set_tooltip(Some(&tooltip))
        .map_err(|e| format!("Failed to set tray tooltip: {e}"))
}
