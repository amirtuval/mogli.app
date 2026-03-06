use tauri::AppHandle;
use tauri::plugin::PermissionState;
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
