use std::time::Duration;

use log::{error, info, warn};
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::interval;

use crate::google::gmail as gmail_api;
use crate::google::oauth::OAuthCredentials;
use crate::store::{self, AccountStore};

const SYNC_INTERVAL_SECS: u64 = 120;

/// Start the background sync task that polls Gmail every 2 minutes.
/// Uses `history.list` for incremental sync when a `historyId` is available;
/// falls back to a full `messages.list` check when the `historyId` is missing
/// or too old (Google returns 404).
///
/// Emits `mail:new` event when new messages are detected.
pub fn start_background_sync(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut ticker = interval(Duration::from_secs(SYNC_INTERVAL_SECS));
        // Skip the first immediate tick — the frontend fetches on mount
        ticker.tick().await;

        loop {
            ticker.tick().await;
            info!("Background sync: checking for new messages");
            sync_all_accounts(&app).await;
        }
    });
}

async fn sync_all_accounts(app: &AppHandle) {
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
                return Ok(result.has_new_messages);
            }
            None => {
                // historyId too old (404) — fall through to full sync
                warn!("historyId expired for {email}, falling back to full sync");
            }
        }
    }

    // Full sync fallback: fetch inbox and check for unread messages
    let messages = gmail_api::fetch_messages(creds, account_id, email, "INBOX", None).await?;
    let has_new = messages.iter().any(|m| m.unread);
    Ok(has_new)
}
