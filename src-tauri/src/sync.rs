use std::time::Duration;

use log::{error, info};
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::interval;

use crate::google::gmail as gmail_api;
use crate::google::oauth::OAuthCredentials;
use crate::store::AccountStore;

const SYNC_INTERVAL_SECS: u64 = 120;

/// Start the background sync task that polls Gmail every 2 minutes.
/// Emits `mail:new` event when new messages are detected.
pub fn start_background_sync(app: AppHandle) {
    tokio::spawn(async move {
        let mut ticker = interval(Duration::from_secs(SYNC_INTERVAL_SECS));
        // Skip the first immediate tick — the frontend fetches on mount
        ticker.tick().await;

        loop {
            ticker.tick().await;
            info!("Background sync: refreshing messages");
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
        match gmail_api::fetch_messages(&creds, &account.id, &account.email, "INBOX", None).await {
            Ok(messages) => {
                if messages.iter().any(|m| m.unread) {
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
