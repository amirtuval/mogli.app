use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;

use log::{error, info, warn};
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::interval;

use crate::google::calendar as calendar_api;
use crate::google::oauth::OAuthCredentials;
use crate::models::ReminderPayload;
use crate::store::{self, AccountStore};

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
        check_account_events(app, &creds, account, &enabled_state, now, time_max).await;
    }
}

/// Check a single account's calendars for upcoming events and fire reminders.
async fn check_account_events(
    app: &AppHandle,
    creds: &OAuthCredentials,
    account: &crate::models::Account,
    enabled_state: &std::collections::HashMap<String, bool>,
    now: i64,
    time_max: i64,
) {
    let calendars = match calendar_api::fetch_calendars(creds, &account.id, &account.email).await {
        Ok(c) => c,
        Err(e) => {
            warn!(
                "Calendar reminders: failed to fetch calendars for {}: {e}",
                account.email
            );
            return;
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
                continue;
            }
        };

        for event in &events {
            if !should_remind(event.start, now, REMINDER_WINDOW_SECS) {
                continue;
            }

            // Deduplicate
            let Ok(mut notified) = notified_state.ids.lock() else {
                continue;
            };
            if notified.contains(&event.id) {
                continue;
            }
            notified.insert(event.id.clone());
            drop(notified);

            let minutes_until = (event.start - now) / 60;
            let body = if minutes_until <= 0 {
                format!("Starting now · {}", cal.name)
            } else {
                format!("Starting in {} min · {}", minutes_until, cal.name)
            };

            info!(
                "Calendar reminder: {} — {} (in {} min)",
                event.title, cal.name, minutes_until
            );

            if let Err(e) = crate::notify::send(&event.title, &body) {
                error!("Failed to send calendar reminder notification: {e}");
            }

            // Emit to frontend for in-app reminder cards
            let payload = ReminderPayload {
                event_id: event.id.clone(),
                title: event.title.clone(),
                start: event.start,
                calendar_name: cal.name.clone(),
                calendar_color: cal.color.clone(),
                minutes_until,
            };
            let _ = app.emit("calendar:reminder", payload);
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
        let event_id = "event-123".to_string();

        {
            let mut ids = notified.ids.lock().unwrap();
            assert!(!ids.contains(&event_id));
            ids.insert(event_id.clone());
        }

        {
            let ids = notified.ids.lock().unwrap();
            assert!(ids.contains(&event_id));
        }
    }

    #[test]
    fn test_dedup_multiple_events() {
        let notified = NotifiedEvents::new();
        let mut ids = notified.ids.lock().unwrap();

        ids.insert("ev-1".to_string());
        ids.insert("ev-2".to_string());
        ids.insert("ev-1".to_string()); // duplicate

        assert_eq!(ids.len(), 2);
        assert!(ids.contains("ev-1"));
        assert!(ids.contains("ev-2"));
    }

    #[test]
    fn test_snooze_clears_dedup_entry() {
        let notified = NotifiedEvents::new();

        // Simulate initial notification
        {
            let mut ids = notified.ids.lock().unwrap();
            ids.insert("ev-snooze".to_string());
            ids.insert("ev-keep".to_string());
        }

        // Simulate snooze: remove the event so it can re-trigger
        {
            let mut ids = notified.ids.lock().unwrap();
            ids.remove("ev-snooze");
        }

        // Verify the snoozed event is gone but others remain
        {
            let ids = notified.ids.lock().unwrap();
            assert!(!ids.contains("ev-snooze"));
            assert!(ids.contains("ev-keep"));
        }
    }
}
