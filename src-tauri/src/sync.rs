use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;

use log::{error, warn};
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::interval;

use crate::google::gmail as gmail_api;
use crate::google::oauth::OAuthCredentials;
use crate::keychain;
use crate::store::{self, AccountStore};

/// Tracks which message IDs have already had an OS notification fired.
/// Prevents duplicate notifications when `history.list` returns the same
/// messages across sync cycles (e.g. if `update_history_id` failed).
/// Reset on app restart.
pub struct NotifiedMessages {
    pub ids: Mutex<HashSet<String>>,
}

impl NotifiedMessages {
    pub fn new() -> Self {
        Self {
            ids: Mutex::new(HashSet::new()),
        }
    }
}

/// Check if an error string indicates an authentication/authorization failure
/// that should mark the account as needing re-authentication.
pub fn is_auth_error(error: &str) -> bool {
    error.starts_with("AUTH_EXPIRED:")
        || error.contains("invalid_grant")
        || error.contains("UNAUTHENTICATED")
        || error.contains("Invalid Credentials")
        || error.contains("Keychain retrieve error")
}

/// Fast notification pipe — polls `history.list` every 15 seconds.
/// Lightweight: only checks whether new messages exist, then fires
/// OS notifications and emits `mail:new` so the frontend refreshes.
const NOTIFY_INTERVAL_SECS: u64 = 15;

/// Maximum number of new-message notifications per sync cycle (avoid spam).
const MAX_NOTIFICATIONS_PER_SYNC: usize = 5;

/// Start background tasks:
/// - **Notification pipe** (15 s): lightweight `history.list` poll that fires
///   OS notifications and emits `mail:new` for instant inbox refresh.
pub fn start_background_sync(app: &AppHandle) {
    // Fast notification pipe
    let notify_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut ticker = interval(Duration::from_secs(NOTIFY_INTERVAL_SECS));
        // Skip the first immediate tick — the frontend fetches on mount
        ticker.tick().await;

        loop {
            ticker.tick().await;
            check_all_accounts(&notify_app).await;
        }
    });
}

async fn check_all_accounts(app: &AppHandle) {
    let creds = match OAuthCredentials::load() {
        Ok(c) => c,
        Err(e) => {
            error!("Background sync: failed to load OAuth credentials: {e}");
            return;
        }
    };

    let accounts = {
        let state = app.state::<AccountStore>();
        let guard = match state.accounts.lock() {
            Ok(g) => g,
            Err(e) => {
                error!("Background sync: lock error: {e}");
                return;
            }
        };
        guard.clone()
    };

    if accounts.is_empty() {
        return;
    }

    let mut found_new = false;

    for account in &accounts {
        // Skip accounts with expired/revoked tokens
        if account.auth_expired {
            continue;
        }

        match sync_account(
            &creds,
            app,
            &account.id,
            &account.email,
            &account.history_id,
        )
        .await
        {
            Ok(has_new) => {
                if has_new {
                    found_new = true;
                }
            }
            Err(e) if is_auth_error(&e) => {
                warn!(
                    "Background sync: auth failed for {}, marking account: {e}",
                    account.email
                );
                let _ = store::set_auth_expired(app, &account.id, true);
                let _ = keychain::delete_tokens(&account.email);
                let _ = app.emit("account:auth_expired", &account.id);
            }
            Err(e) => {
                error!("Background sync: failed for {}: {e}", account.email);
            }
        }
    }

    if found_new && let Err(e) = app.emit("mail:new", ()) {
        error!("Background sync: failed to emit event: {e}");
    }
}

/// Sync a single account. Returns whether new messages were detected.
///
/// Uses incremental `history.list` when a valid `history_id` is stored;
/// falls back to a full inbox check otherwise.
/// Fires OS notifications for new unread messages.
async fn sync_account(
    creds: &OAuthCredentials,
    app: &AppHandle,
    account_id: &str,
    email: &str,
    history_id: &str,
) -> Result<bool, String> {
    // If we have a historyId, try incremental sync
    if !history_id.is_empty() {
        match gmail_api::fetch_history(creds, email, history_id).await? {
            Some(result) => {
                // Update the stored historyId
                if let Err(e) = store::update_history_id(app, account_id, &result.new_history_id) {
                    warn!("Failed to update historyId for {email}: {e}");
                }

                // Dedup message IDs — Gmail can return the same message in
                // multiple history records when it has multiple label changes.
                let unique_ids: Vec<String> = {
                    let mut seen = HashSet::new();
                    result
                        .new_message_ids
                        .into_iter()
                        .filter(|id| seen.insert(id.clone()))
                        .collect()
                };

                // Filter out messages we've already notified about (guards
                // against re-notification when historyId update fails).
                let novel_ids: Vec<String> = {
                    let notified = app.state::<NotifiedMessages>();
                    let ids = notified
                        .ids
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner);
                    unique_ids
                        .into_iter()
                        .filter(|id| !ids.contains(id))
                        .collect()
                };

                let has_new = !novel_ids.is_empty();

                // Notify only for genuinely new messages
                if has_new {
                    notify_new_messages(creds, app, account_id, email, &novel_ids).await;
                }

                return Ok(has_new);
            }
            None => {
                // historyId too old (404) — fall through to full sync
                warn!("historyId expired for {email}, falling back to full sync");
            }
        }
    }

    // Full sync fallback: seed historyId from profile so next sync uses the
    // incremental path on subsequent cycles.  We deliberately do NOT report
    // has_new here — we can't distinguish genuinely new messages from ones
    // that were already sitting unread in the inbox.
    match gmail_api::fetch_profile_history_id(creds, email).await {
        Ok(hid) => {
            if let Err(e) = store::update_history_id(app, account_id, &hid) {
                warn!("Failed to seed historyId for {email}: {e}");
            }
        }
        Err(e) => warn!("Failed to fetch profile historyId for {email}: {e}"),
    }

    Ok(false)
}

/// Payload emitted to frontend when a new-mail notification fires.
#[derive(Clone, serde::Serialize)]
struct OpenThread {
    thread_id: String,
    account_id: String,
}

/// Fetch metadata for newly arrived messages and fire OS notifications.
/// Only notifies for messages that are still unread (skips messages the
/// user already read on another client). Records notified IDs to prevent
/// duplicates across sync cycles.
async fn notify_new_messages(
    creds: &OAuthCredentials,
    app: &AppHandle,
    account_id: &str,
    email: &str,
    new_message_ids: &[String],
) {
    // Only fetch metadata for the specific new messages (up to limit)
    let ids_to_fetch: Vec<String> = new_message_ids
        .iter()
        .take(MAX_NOTIFICATIONS_PER_SYNC)
        .cloned()
        .collect();

    let messages =
        match gmail_api::fetch_messages_by_ids(creds, account_id, email, &ids_to_fetch).await {
            Ok(m) => m,
            Err(e) => {
                warn!("Failed to fetch messages for notification: {e}");
                return;
            }
        };

    // Record all fetched IDs as notified (even read ones) so we don't
    // re-fetch them on the next cycle.
    {
        let notified = app.state::<NotifiedMessages>();
        let mut ids = notified
            .ids
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        for id in &ids_to_fetch {
            ids.insert(id.clone());
        }
    }

    for msg in &messages {
        // Skip messages that are already read — the user read them on
        // another client before this sync cycle fired.
        if !msg.unread {
            continue;
        }

        // Fire OS notification via notify-rust (bypasses Tauri plugin's broken
        // async spawn on Windows — see crate::notify module docs).
        if let Err(e) = crate::notify::send(&msg.from, &msg.subject) {
            warn!("Failed to send email notification: {e}");
        }

        // Emit event so frontend can navigate to the thread on click
        if let Err(e) = app.emit(
            "notification:open_thread",
            OpenThread {
                thread_id: msg.thread_id.clone(),
                account_id: msg.account_id.clone(),
            },
        ) {
            warn!("Failed to emit open_thread event: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_auth_error_sentinel() {
        assert!(is_auth_error("AUTH_EXPIRED:user@example.com"));
    }

    #[test]
    fn test_is_auth_error_invalid_grant() {
        assert!(is_auth_error("Token refresh failed: invalid_grant"));
    }

    #[test]
    fn test_is_auth_error_unauthenticated() {
        assert!(is_auth_error(
            r#"Gmail history.list failed: {"error":{"status":"UNAUTHENTICATED"}}"#
        ));
    }

    #[test]
    fn test_is_auth_error_invalid_credentials() {
        assert!(is_auth_error(
            r#"Gmail history.list failed: {"error":{"errors":[{"message":"Invalid Credentials"}]}}"#
        ));
    }

    #[test]
    fn test_is_auth_error_keychain() {
        assert!(is_auth_error("Keychain retrieve error: item not found"));
    }

    #[test]
    fn test_is_not_auth_error() {
        assert!(!is_auth_error("Network timeout"));
        assert!(!is_auth_error(
            "Gmail history.list failed: 500 Internal Server Error"
        ));
        assert!(!is_auth_error(""));
    }

    #[test]
    fn test_notified_messages_dedup() {
        let notified = NotifiedMessages::new();
        let mut ids = notified.ids.lock().unwrap();

        // First insert succeeds
        assert!(ids.insert("msg-1".to_string()));
        // Duplicate insert returns false
        assert!(!ids.insert("msg-1".to_string()));
        // Different ID succeeds
        assert!(ids.insert("msg-2".to_string()));

        assert_eq!(ids.len(), 2);
    }

    #[test]
    fn test_dedup_message_ids_from_history() {
        // Simulate Gmail returning the same message ID in multiple history records
        let raw_ids = vec![
            "msg-a".to_string(),
            "msg-b".to_string(),
            "msg-a".to_string(), // duplicate
            "msg-c".to_string(),
            "msg-b".to_string(), // duplicate
        ];

        let unique_ids: Vec<String> = {
            let mut seen = HashSet::new();
            raw_ids
                .into_iter()
                .filter(|id| seen.insert(id.clone()))
                .collect()
        };

        assert_eq!(unique_ids, vec!["msg-a", "msg-b", "msg-c"]);
    }

    #[test]
    fn test_cross_cycle_dedup() {
        let notified = NotifiedMessages::new();

        // Simulate first cycle: notify about msg-1 and msg-2
        {
            let mut ids = notified.ids.lock().unwrap();
            ids.insert("msg-1".to_string());
            ids.insert("msg-2".to_string());
        }

        // Simulate second cycle: history returns msg-1 again (historyId update failed)
        // plus a genuinely new msg-3
        let incoming = vec!["msg-1".to_string(), "msg-3".to_string()];
        let novel: Vec<String> = {
            let ids = notified.ids.lock().unwrap();
            incoming
                .into_iter()
                .filter(|id| !ids.contains(id))
                .collect()
        };

        // Only msg-3 should be novel
        assert_eq!(novel, vec!["msg-3"]);
    }
}
