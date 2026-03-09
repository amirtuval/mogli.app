use tauri::{AppHandle, Manager};

use crate::google::calendar as calendar_api;
use crate::google::oauth::OAuthCredentials;
use crate::models::{CalEvent, Calendar};
use crate::reminders::NotifiedEvents;
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

/// Create a new calendar event via Google Calendar API.
#[tauri::command]
#[specta::specta]
#[allow(clippy::too_many_arguments)]
pub async fn create_event(
    app: AppHandle,
    account_id: String,
    calendar_id: String,
    title: String,
    start: i64,
    end: i64,
    all_day: bool,
    timezone: String,
    location: Option<String>,
    description: Option<String>,
) -> Result<CalEvent, String> {
    let creds = OAuthCredentials::load()?;
    let email = store::account_email(&app, &account_id)?;
    calendar_api::create_event(
        &creds,
        &account_id,
        &email,
        &calendar_id,
        &title,
        start,
        end,
        all_day,
        &timezone,
        location.as_deref(),
        description.as_deref(),
    )
    .await
}

/// Update an existing calendar event via Google Calendar API.
///
/// Uses a request struct because specta supports at most 10 function parameters.
#[tauri::command]
#[specta::specta]
#[allow(clippy::too_many_arguments)]
pub async fn update_event(
    app: AppHandle,
    account_id: String,
    calendar_id: String,
    event_id: String,
    title: String,
    start: i64,
    end: i64,
    all_day: bool,
    timezone: String,
    rest: UpdateEventOptionals,
) -> Result<CalEvent, String> {
    let creds = OAuthCredentials::load()?;
    let email = store::account_email(&app, &account_id)?;
    calendar_api::update_event(
        &creds,
        &account_id,
        &email,
        &calendar_id,
        &event_id,
        &title,
        start,
        end,
        all_day,
        &timezone,
        rest.location.as_deref(),
        rest.description.as_deref(),
    )
    .await
}

/// Optional fields for `update_event`, bundled to stay within specta's 10-param limit.
#[derive(Debug, serde::Deserialize, specta::Type)]
pub struct UpdateEventOptionals {
    pub location: Option<String>,
    pub description: Option<String>,
}

/// Dismiss a calendar reminder (frontend handles state; backend just logs).
#[tauri::command]
#[specta::specta]
pub async fn dismiss_reminder(event_id: String) -> Result<(), String> {
    log::info!("Reminder dismissed: {event_id}");
    Ok(())
}

/// Snooze a calendar reminder by clearing its dedup entry so it can re-trigger.
///
/// The frontend handles the actual delay timing via `setTimeout`; the backend
/// just removes the event from the notified set.
#[tauri::command]
#[specta::specta]
pub async fn snooze_reminder(
    app: AppHandle,
    event_id: String,
    snooze_minutes: i64,
) -> Result<(), String> {
    log::info!("Reminder snoozed: {event_id} for {snooze_minutes} min");

    let state = app.state::<NotifiedEvents>();
    let mut ids = state.ids.lock().map_err(|e| format!("Lock error: {e}"))?;
    ids.remove(&event_id);

    Ok(())
}
