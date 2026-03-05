use tauri::{AppHandle, Manager};

use crate::google::gmail as gmail_api;
use crate::google::oauth::OAuthCredentials;
use crate::models::{MessageMeta, Thread};
use crate::store::AccountStore;

/// Fetch inbox messages for the given accounts and label.
#[tauri::command]
#[specta::specta]
pub async fn get_messages(
    app: AppHandle,
    account_ids: Vec<String>,
    label: String,
    page_token: Option<String>,
) -> Result<Vec<MessageMeta>, String> {
    let creds = OAuthCredentials::load()?;

    let state = app.state::<AccountStore>();
    let accounts = {
        let guard = state
            .accounts
            .lock()
            .map_err(|e| format!("Lock error: {e}"))?;
        guard
            .iter()
            .filter(|a| account_ids.contains(&a.id))
            .cloned()
            .collect::<Vec<_>>()
    };

    let mut all_messages = Vec::new();
    for account in &accounts {
        match gmail_api::fetch_messages(
            &creds,
            &account.id,
            &account.email,
            &label,
            page_token.as_deref(),
        )
        .await
        {
            Ok(messages) => all_messages.extend(messages),
            Err(e) => {
                log::error!("Failed to fetch messages for {}: {e}", account.email);
                // Continue with other accounts
            }
        }
    }

    // Sort all messages by date descending (unified inbox)
    all_messages.sort_by(|a, b| b.date.cmp(&a.date));
    Ok(all_messages)
}

/// Fetch a full thread with message bodies.
#[tauri::command]
#[specta::specta]
pub async fn get_thread(
    app: AppHandle,
    account_id: String,
    thread_id: String,
) -> Result<Thread, String> {
    let creds = OAuthCredentials::load()?;

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
            .ok_or_else(|| format!("Account {account_id} not found"))?
    };

    gmail_api::fetch_thread(&creds, &account_id, &email, &thread_id).await
}

/// Helper to resolve account email from store.
fn get_account_email(app: &AppHandle, account_id: &str) -> Result<String, String> {
    let state = app.state::<AccountStore>();
    let guard = state
        .accounts
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;
    guard
        .iter()
        .find(|a| a.id == account_id)
        .map(|a| a.email.clone())
        .ok_or_else(|| format!("Account {account_id} not found"))
}

/// Archive a thread (remove from Inbox).
#[tauri::command]
#[specta::specta]
pub async fn archive_thread(
    app: AppHandle,
    account_id: String,
    thread_id: String,
) -> Result<(), String> {
    let creds = OAuthCredentials::load()?;
    let email = get_account_email(&app, &account_id)?;
    gmail_api::archive_thread(&creds, &email, &thread_id).await
}

/// Star or unstar a thread.
#[tauri::command]
#[specta::specta]
pub async fn star_thread(
    app: AppHandle,
    account_id: String,
    thread_id: String,
    starred: bool,
) -> Result<(), String> {
    let creds = OAuthCredentials::load()?;
    let email = get_account_email(&app, &account_id)?;
    gmail_api::star_thread(&creds, &email, &thread_id, starred).await
}

/// Mark a thread as read.
#[tauri::command]
#[specta::specta]
pub async fn mark_read(
    app: AppHandle,
    account_id: String,
    thread_id: String,
) -> Result<(), String> {
    let creds = OAuthCredentials::load()?;
    let email = get_account_email(&app, &account_id)?;
    gmail_api::mark_read(&creds, &email, &thread_id).await
}
