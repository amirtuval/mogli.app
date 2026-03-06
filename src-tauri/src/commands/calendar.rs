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

/// Fetch events for a single account across its enabled calendars.
///
/// All calendar event fetches run in parallel via `tokio::task::JoinSet`.
/// The frontend calls this once per account so results stream in as each
/// account completes independently.
#[tauri::command]
#[specta::specta]
pub async fn get_account_events(
    app: AppHandle,
    account_id: String,
    calendar_ids: Vec<String>,
    time_min: i64,
    time_max: i64,
) -> Result<Vec<CalEvent>, String> {
    let creds = OAuthCredentials::load()?;
    let email = store::account_email(&app, &account_id)?;

    let calendar_id_set: std::collections::HashSet<String> = calendar_ids.into_iter().collect();

    // Fetch this account's calendar list
    let account_calendars = calendar_api::fetch_calendars(&creds, &account_id, &email).await?;
    let enabled_state = store::load_calendar_enabled(&app)?;

    // Spawn parallel event fetches for each enabled calendar
    let mut join_set = tokio::task::JoinSet::new();

    for cal in account_calendars {
        if !calendar_id_set.contains(&cal.id) {
            continue;
        }
        let key = format!("{}::{}", account_id, cal.id);
        let enabled = enabled_state.get(&key).copied().unwrap_or(true);
        if !enabled {
            continue;
        }

        let creds = creds.clone();
        let acct_id = account_id.clone();
        let email = email.clone();
        let cal_id = cal.id.clone();
        join_set.spawn(async move {
            calendar_api::fetch_events(&creds, &acct_id, &email, &cal_id, time_min, time_max).await
        });
    }

    let mut all_events = Vec::new();
    while let Some(result) = join_set.join_next().await {
        match result {
            Ok(Ok(events)) => all_events.extend(events),
            Ok(Err(e)) => log::warn!("Failed to fetch events for {account_id}: {e}"),
            Err(e) => log::warn!("Task panicked for {account_id}: {e}"),
        }
    }

    all_events.sort_by_key(|e| e.start);
    Ok(all_events)
}

/// Fetch events across multiple accounts and calendars for a time range.
///
/// Kept for backwards compatibility. Internally parallelises across accounts.
#[tauri::command]
#[specta::specta]
pub async fn get_events(
    app: AppHandle,
    account_ids: Vec<String>,
    calendar_ids: Vec<String>,
    time_min: i64,
    time_max: i64,
) -> Result<Vec<CalEvent>, String> {
    let mut join_set = tokio::task::JoinSet::new();

    for account_id in account_ids {
        let app = app.clone();
        let cal_ids = calendar_ids.clone();
        join_set.spawn(async move {
            get_account_events(app, account_id, cal_ids, time_min, time_max).await
        });
    }

    let mut all_events = Vec::new();
    while let Some(result) = join_set.join_next().await {
        match result {
            Ok(Ok(events)) => all_events.extend(events),
            Ok(Err(e)) => log::warn!("Failed to fetch account events: {e}"),
            Err(e) => log::warn!("Task panicked: {e}"),
        }
    }

    all_events.sort_by_key(|e| e.start);
    Ok(all_events)
}
