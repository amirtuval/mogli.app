use tauri::AppHandle;

use crate::google::calendar as calendar_api;
use crate::google::oauth::OAuthCredentials;
use crate::models::{CalEvent, Calendar};
use crate::store;

/// List all calendars for an account. Merges enabled state from store.
#[tauri::command]
#[specta::specta]
pub async fn list_calendars(app: AppHandle, account_id: String) -> Result<Vec<Calendar>, String> {
    let creds = OAuthCredentials::load()?;
    let email = store::account_email(&app, &account_id)?;

    let mut calendars = calendar_api::fetch_calendars(&creds, &account_id, &email).await?;

    // Apply persisted enabled state
    let enabled_state = store::load_calendar_enabled(&app)?;
    for cal in &mut calendars {
        let key = format!("{}::{}", cal.account_id, cal.id);
        if let Some(&enabled) = enabled_state.get(&key) {
            cal.enabled = enabled;
        }
    }

    Ok(calendars)
}

/// Toggle a calendar's enabled state and persist it.
#[tauri::command]
#[specta::specta]
pub async fn set_calendar_enabled(
    app: AppHandle,
    account_id: String,
    calendar_id: String,
    enabled: bool,
) -> Result<(), String> {
    let key = format!("{account_id}::{calendar_id}");
    store::save_calendar_enabled(&app, &key, enabled)
}

/// Fetch events across multiple accounts and calendars for a time range.
///
/// `calendar_ids` acts as a filter — only calendars whose ID is in this list
/// will be queried. Each account only fetches its own matching calendars
/// (calendar IDs are account-scoped).
#[tauri::command]
#[specta::specta]
pub async fn get_events(
    app: AppHandle,
    account_ids: Vec<String>,
    calendar_ids: Vec<String>,
    time_min: i64,
    time_max: i64,
) -> Result<Vec<CalEvent>, String> {
    let creds = OAuthCredentials::load()?;
    let mut all_events = Vec::new();

    let calendar_id_set: std::collections::HashSet<&str> =
        calendar_ids.iter().map(String::as_str).collect();

    for account_id in &account_ids {
        let email = store::account_email(&app, account_id)?;

        // Fetch this account's calendar list to know which IDs belong to it
        let account_calendars = calendar_api::fetch_calendars(&creds, account_id, &email).await?;

        // Apply persisted enabled state
        let enabled_state = store::load_calendar_enabled(&app)?;

        for cal in &account_calendars {
            // Skip calendars not in the requested set
            if !calendar_id_set.contains(cal.id.as_str()) {
                continue;
            }

            // Skip calendars the user has disabled
            let key = format!("{}::{}", account_id, cal.id);
            let enabled = enabled_state.get(&key).copied().unwrap_or(true);
            if !enabled {
                continue;
            }

            match calendar_api::fetch_events(
                &creds, account_id, &email, &cal.id, time_min, time_max,
            )
            .await
            {
                Ok(events) => all_events.extend(events),
                Err(e) => {
                    log::warn!("Failed to fetch events for {account_id}/{}: {e}", cal.id);
                }
            }
        }
    }

    // Sort by start time ascending
    all_events.sort_by_key(|e| e.start);

    Ok(all_events)
}
