use std::time::Duration;

use log::{error, warn};
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::interval;

use crate::google::gmail as gmail_api;
use crate::google::oauth::OAuthCredentials;
use crate::store::{self, AccountStore};

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

                let has_new = !result.new_message_ids.is_empty();

                // Notify only for the newly arrived messages
                if has_new {
                    notify_new_messages(creds, app, account_id, email, &result.new_message_ids)
                        .await;
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

    for msg in &messages {
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
