use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;

use log::{error, info, warn};
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::interval;

use crate::google::calendar as calendar_api;
use crate::google::oauth::OAuthCredentials;
use crate::keychain;
use crate::models::ReminderPayload;
use crate::store::{self, AccountStore};
use crate::sync::{is_auth_error, is_auth_revoked, is_keychain_error};

const REMINDER_CHECK_SECS: u64 = 60;
const REMINDER_WINDOW_SECS: i64 = 600; // 10 minutes

/// Tracks which events have already had a notification fired.
/// Reset on app restart.
pub struct NotifiedEvents {
    pub ids: Mutex<HashSet<String>>,
}

impl NotifiedEvents {
    pub fn new() -> Self {
        Self {
            ids: Mutex::new(HashSet::new()),
        }
    }
}

/// Stores active reminder payloads so new windows can retrieve them on mount.
/// The popup window loads asynchronously and may miss `calendar:reminder`
/// events that were emitted before its JS listener was ready.
pub struct ActiveReminders {
    pub list: Mutex<Vec<ReminderPayload>>,
}

impl ActiveReminders {
    pub fn new() -> Self {
        Self {
            list: Mutex::new(Vec::new()),
        }
    }
}

/// Check if an event should trigger a reminder given the current time.
/// Returns `true` if the event starts within [now, now + `window_secs`].
pub fn should_remind(event_start: i64, now: i64, window_secs: i64) -> bool {
    let diff = event_start - now;
    diff >= 0 && diff <= window_secs
}

/// Start the background calendar reminder task that checks every 60 seconds
/// for events starting within the next 10 minutes and fires OS notifications.
pub fn start_calendar_reminders(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut ticker = interval(Duration::from_secs(REMINDER_CHECK_SECS));
        // Skip the first immediate tick — give the app time to load
        ticker.tick().await;

        loop {
            ticker.tick().await;
            check_upcoming_events(&app).await;
        }
    });
}

async fn check_upcoming_events(app: &AppHandle) {
    let creds = match OAuthCredentials::load() {
        Ok(c) => c,
        Err(e) => {
            error!("Calendar reminders: failed to load OAuth credentials: {e}");
            return;
        }
    };

    let accounts = {
        let state = app.state::<AccountStore>();
        let guard = match state.accounts.lock() {
            Ok(g) => g,
            Err(e) => {
                error!("Calendar reminders: lock error: {e}");
                return;
            }
        };
        guard.clone()
    };

    if accounts.is_empty() {
        return;
    }

    let now = chrono::Utc::now().timestamp();
    let time_max = now + 24 * 60 * 60; // next 24 hours

    let enabled_state = match store::load_calendar_enabled(app) {
        Ok(state) => state,
        Err(e) => {
            warn!("Calendar reminders: failed to load enabled state: {e}");
            std::collections::HashMap::new()
        }
    };

    for account in &accounts {
        // Skip accounts with expired/revoked tokens
        if account.auth_expired {
            continue;
        }
        if let Err(e) =
            check_account_events(app, &creds, account, &enabled_state, now, time_max).await
        {
            if is_auth_revoked(&e) {
                warn!(
                    "Calendar reminders: auth revoked for {}, marking account: {e}",
                    account.email
                );
                let _ = store::set_auth_expired(app, &account.id, true);
                let _ = keychain::delete_tokens(&account.email);
                let _ = app.emit("account:auth_expired", &account.id);
            } else if is_keychain_error(&e) {
                warn!(
                    "Calendar reminders: keychain unavailable for {}, will retry: {e}",
                    account.email
                );
            }
        }
    }
}

/// Check a single account's calendars for upcoming events and fire reminders.
/// Returns `Err` for auth-related failures so the caller can mark the account.
async fn check_account_events(
    app: &AppHandle,
    creds: &OAuthCredentials,
    account: &crate::models::Account,
    enabled_state: &std::collections::HashMap<String, bool>,
    now: i64,
    time_max: i64,
) -> Result<(), String> {
    let calendars = match calendar_api::fetch_calendars(creds, &account.id, &account.email).await {
        Ok(c) => c,
        Err(e) => {
            warn!(
                "Calendar reminders: failed to fetch calendars for {}: {e}",
                account.email
            );
            return if is_auth_error(&e) { Err(e) } else { Ok(()) };
        }
    };

    let notified_state = app.state::<NotifiedEvents>();

    for cal in &calendars {
        let key = format!("{}::{}", account.id, cal.id);
        let enabled = enabled_state.get(&key).copied().unwrap_or(true);
        if !enabled {
            continue;
        }

        let events = match calendar_api::fetch_events(
            creds,
            &account.id,
            &account.email,
            &cal.id,
            now,
            time_max,
        )
        .await
        {
            Ok(e) => e,
            Err(e) => {
                warn!(
                    "Calendar reminders: failed to fetch events for {}/{}: {e}",
                    account.email, cal.name
                );
                if is_auth_error(&e) {
                    return Err(e);
                }
                continue;
            }
        };

        for event in &events {
            if !should_remind(event.start, now, REMINDER_WINDOW_SECS) {
                continue;
            }

            // Deduplicate by event ID + start time so rescheduled events re-trigger
            let dedup_key = format!("{}::{}", event.id, event.start);
            let Ok(mut notified) = notified_state.ids.lock() else {
                continue;
            };
            if notified.contains(&dedup_key) {
                continue;
            }
            notified.insert(dedup_key);
            drop(notified);

            let minutes_until = (event.start - now) / 60;

            info!(
                "Calendar reminder: {} — {} (in {} min)",
                event.title, cal.name, minutes_until
            );

            // Emit to frontend for in-app reminder cards
            let payload = ReminderPayload {
                event_id: event.id.clone(),
                title: event.title.clone(),
                start: event.start,
                calendar_name: cal.name.clone(),
                calendar_color: cal.color.clone(),
                minutes_until,
            };

            // Store in backend state so the popup window can fetch on mount
            if let Ok(mut list) = app.state::<ActiveReminders>().list.lock()
                && !list.iter().any(|r| r.event_id == event.id)
            {
                list.push(payload.clone());
            }

            let _ = app.emit("calendar:reminder", payload);

            // Open / focus the reminder popup window
            show_reminder_window(app);
        }
    }

    Ok(())
}

/// Open the always-on-top reminder popup window, or focus it if it already
/// exists.  The window loads the same frontend entry-point; the React code
/// detects the `reminder-popup` window label and renders the reminder UI.
pub fn show_reminder_window(app: &AppHandle) {
    use tauri::WebviewWindowBuilder;

    const LABEL: &str = "reminder-popup";
    const WIDTH: i32 = 380;
    const HEIGHT: i32 = 360;

    // If the window already exists, just make sure it's visible.
    // Don't call set_focus() — the window is always-on-top so the user
    // will see it, but we shouldn't steal focus from their current task.
    if let Some(win) = app.webview_windows().get(LABEL) {
        let _ = win.show();
        let _ = win.unminimize();
        return;
    }

    let url = tauri::WebviewUrl::App("index.html".into());

    match WebviewWindowBuilder::new(app, LABEL, url)
        .title("Reminders")
        .inner_size(f64::from(WIDTH), f64::from(HEIGHT))
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(true)
        .focused(false)
        .build()
    {
        Ok(win) => {
            // Position at bottom-right of the primary monitor.
            // Monitor size/position are physical pixels; convert to logical
            // via scale_factor so the window doesn't overflow on high-DPI.
            if let Ok(Some(monitor)) = win.primary_monitor() {
                let scale = win.scale_factor().unwrap_or(1.0);
                let phys_w = f64::from(monitor.size().width);
                let phys_h = f64::from(monitor.size().height);
                let phys_x = f64::from(monitor.position().x);
                let phys_y = f64::from(monitor.position().y);

                let mon_w = phys_w / scale;
                let mon_h = phys_h / scale;
                let mon_x = phys_x / scale;
                let mon_y = phys_y / scale;

                let margin = 20.0;
                let x = mon_x + mon_w - f64::from(WIDTH) - margin;
                let y = mon_y + mon_h - f64::from(HEIGHT) - margin - 40.0;
                let _ =
                    win.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
            }
        }
        Err(e) => {
            error!("Failed to create reminder popup window: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_remind_within_window() {
        let now = 1_000_000;
        // Event starting in 5 minutes (300 seconds)
        assert!(should_remind(now + 300, now, 600));
    }

    #[test]
    fn test_should_remind_at_boundary() {
        let now = 1_000_000;
        // Event starting exactly at window boundary (10 min)
        assert!(should_remind(now + 600, now, 600));
        // Event starting right now
        assert!(should_remind(now, now, 600));
    }

    #[test]
    fn test_should_not_remind_past_event() {
        let now = 1_000_000;
        // Event already started 5 min ago
        assert!(!should_remind(now - 300, now, 600));
    }

    #[test]
    fn test_should_not_remind_too_far_ahead() {
        let now = 1_000_000;
        // Event starting in 15 minutes (900 seconds)
        assert!(!should_remind(now + 900, now, 600));
    }

    #[test]
    fn test_deduplication_with_hashset() {
        let notified = NotifiedEvents::new();
        let key = "event-123::1000300".to_string();

        {
            let mut ids = notified.ids.lock().unwrap();
            assert!(!ids.contains(&key));
            ids.insert(key.clone());
        }

        {
            let ids = notified.ids.lock().unwrap();
            assert!(ids.contains(&key));
        }
    }

    #[test]
    fn test_dedup_multiple_events() {
        let notified = NotifiedEvents::new();
        let mut ids = notified.ids.lock().unwrap();

        ids.insert("ev-1::1000".to_string());
        ids.insert("ev-2::2000".to_string());
        ids.insert("ev-1::1000".to_string()); // duplicate

        assert_eq!(ids.len(), 2);
        assert!(ids.contains("ev-1::1000"));
        assert!(ids.contains("ev-2::2000"));
    }

    #[test]
    fn test_rescheduled_event_triggers_new_reminder() {
        let notified = NotifiedEvents::new();

        // First reminder at original start time
        {
            let mut ids = notified.ids.lock().unwrap();
            ids.insert("ev-1::1000".to_string());
        }

        // Same event rescheduled to a later time — different key
        let rescheduled_key = "ev-1::4600".to_string();
        {
            let ids = notified.ids.lock().unwrap();
            assert!(!ids.contains(&rescheduled_key));
        }
    }

    #[test]
    fn test_snooze_clears_dedup_entry() {
        let notified = NotifiedEvents::new();

        // Simulate initial notification
        {
            let mut ids = notified.ids.lock().unwrap();
            ids.insert("ev-snooze::5000".to_string());
            ids.insert("ev-keep::6000".to_string());
        }

        // Simulate snooze: remove all entries for this event (matching prefix)
        {
            let mut ids = notified.ids.lock().unwrap();
            ids.retain(|key| !key.starts_with("ev-snooze::"));
        }

        // Verify the snoozed event is gone but others remain
        {
            let ids = notified.ids.lock().unwrap();
            assert!(!ids.contains("ev-snooze::5000"));
            assert!(ids.contains("ev-keep::6000"));
        }
    }
}
