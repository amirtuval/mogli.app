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
