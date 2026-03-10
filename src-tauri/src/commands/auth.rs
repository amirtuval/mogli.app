use tauri::{AppHandle, Manager};

use crate::google::oauth::{self, OAuthCredentials};
use crate::keychain;
use crate::models::{Account, color_for_index};
use crate::store::{self, AccountStore};

/// Trigger the OAuth flow and add a new Google account.
#[tauri::command]
#[specta::specta]
pub async fn add_account(app: AppHandle) -> Result<Account, String> {
    let creds = OAuthCredentials::load()?;
    let result = oauth::run_oauth_flow(&creds).await?;

    let count = store::account_count(&app)?;
    let account = Account {
        id: uuid::Uuid::new_v4().to_string(),
        email: result.email,
        display_name: result.display_name,
        color: color_for_index(count),
        history_id: String::new(),
    };

    store::add_account(&app, account.clone())?;
    Ok(account)
}

/// Remove a Google account and its stored tokens.
#[tauri::command]
#[specta::specta]
pub async fn remove_account(app: AppHandle, account_id: String) -> Result<(), String> {
    // Find the account email before removing
    let state = app.state::<AccountStore>();
    let email = {
        let guard = state
            .accounts
            .lock()
            .map_err(|e| format!("Lock error: {e}"))?;
        guard
            .iter()
            .find(|a| a.id == account_id)
            .map(|a| a.email.clone())
    };

    if let Some(email) = email {
        let _ = keychain::delete_tokens(&email); // best-effort
    }

    store::remove_account(&app, &account_id)?;
    Ok(())
}

/// List all configured accounts.
#[tauri::command]
#[specta::specta]
pub async fn list_accounts(app: AppHandle) -> Result<Vec<Account>, String> {
    store::load_accounts(&app)
}

/// Load the persisted theme preference. Returns `"dark"` if not set.
#[tauri::command]
#[specta::specta]
pub async fn load_theme(app: AppHandle) -> Result<String, String> {
    Ok(store::load_theme(&app)?.unwrap_or_else(|| "dark".to_string()))
}

/// Persist the theme preference to disk.
#[tauri::command]
#[specta::specta]
pub async fn save_theme(app: AppHandle, theme: String) -> Result<(), String> {
    store::save_theme(&app, &theme)
}

/// Load the persisted week start day. Returns `1` (Monday) if not set.
#[tauri::command]
#[specta::specta]
pub async fn load_week_start_day(app: AppHandle) -> Result<u8, String> {
    Ok(store::load_week_start_day(&app)?.unwrap_or(1))
}

/// Persist the week start day to disk. 0 = Sunday, 1 = Monday.
#[tauri::command]
#[specta::specta]
pub async fn save_week_start_day(app: AppHandle, day: u8) -> Result<(), String> {
    store::save_week_start_day(&app, day)
}

/// Load the persisted auto-mark-read preference. Returns `false` if not set.
#[tauri::command]
#[specta::specta]
pub async fn load_auto_mark_read(app: AppHandle) -> Result<bool, String> {
    Ok(store::load_auto_mark_read(&app)?.unwrap_or(false))
}

/// Persist the auto-mark-read preference to disk.
#[tauri::command]
#[specta::specta]
pub async fn save_auto_mark_read(app: AppHandle, enabled: bool) -> Result<(), String> {
    store::save_auto_mark_read(&app, enabled)
}

/// Load the persisted mail filter state. Returns `(false, false)` if not set.
#[tauri::command]
#[specta::specta]
pub async fn load_mail_filter(app: AppHandle) -> Result<(bool, bool), String> {
    Ok(store::load_mail_filter(&app)?.unwrap_or((false, false)))
}

/// Persist the mail filter state (unread, starred) to disk.
#[tauri::command]
#[specta::specta]
pub async fn save_mail_filter(app: AppHandle, unread: bool, starred: bool) -> Result<(), String> {
    store::save_mail_filter(&app, unread, starred)
}

/// Load the persisted calendar view mode. Returns `"week"` if not set.
#[tauri::command]
#[specta::specta]
pub async fn load_calendar_view_mode(app: AppHandle) -> Result<String, String> {
    Ok(store::load_calendar_view_mode(&app)?.unwrap_or_else(|| "week".to_string()))
}

/// Persist the calendar view mode to disk.
#[tauri::command]
#[specta::specta]
pub async fn save_calendar_view_mode(app: AppHandle, mode: String) -> Result<(), String> {
    store::save_calendar_view_mode(&app, &mode)
}
