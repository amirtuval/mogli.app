use tauri::{AppHandle, Manager};

use crate::google::gmail as gmail_api;
use crate::google::oauth::OAuthCredentials;
use crate::models::{MessageMeta, SendMessageRequest, Thread};
use crate::store::AccountStore;

/// Fetch messages for a single account and label.
///
/// The frontend calls this once per account so results stream in as each
/// account completes independently.
#[tauri::command]
#[specta::specta]
pub async fn get_account_messages(
    app: AppHandle,
    account_id: String,
    label: String,
    page_token: Option<String>,
) -> Result<Vec<MessageMeta>, String> {
    let creds = OAuthCredentials::load()?;

    let email = {
        let state = app.state::<AccountStore>();
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

    let mut messages =
        gmail_api::fetch_messages(&creds, &account_id, &email, &label, page_token.as_deref())
            .await?;

    messages.sort_by(|a, b| b.date.cmp(&a.date));
    Ok(messages)
}

/// Fetch inbox messages for the given accounts and label.
///
/// Kept for backwards compatibility. Internally parallelises across accounts.
#[tauri::command]
#[specta::specta]
pub async fn get_messages(
    app: AppHandle,
    account_ids: Vec<String>,
    label: String,
    page_token: Option<String>,
) -> Result<Vec<MessageMeta>, String> {
    let mut join_set = tokio::task::JoinSet::new();

    for account_id in account_ids {
        let app = app.clone();
        let label = label.clone();
        let page_token = page_token.clone();
        join_set
            .spawn(async move { get_account_messages(app, account_id, label, page_token).await });
    }

    let mut all_messages = Vec::new();
    while let Some(result) = join_set.join_next().await {
        match result {
            Ok(Ok(messages)) => all_messages.extend(messages),
            Ok(Err(e)) => log::error!("Failed to fetch account messages: {e}"),
            Err(e) => log::error!("Task panicked: {e}"),
        }
    }

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

/// Mark a thread as unread.
#[tauri::command]
#[specta::specta]
pub async fn mark_unread(
    app: AppHandle,
    account_id: String,
    thread_id: String,
) -> Result<(), String> {
    let creds = OAuthCredentials::load()?;
    let email = get_account_email(&app, &account_id)?;
    gmail_api::mark_unread(&creds, &email, &thread_id).await
}

/// Search messages across the given accounts.
#[tauri::command]
#[specta::specta]
pub async fn search_messages(
    app: AppHandle,
    account_ids: Vec<String>,
    query: String,
) -> Result<Vec<MessageMeta>, String> {
    let mut join_set = tokio::task::JoinSet::new();

    for account_id in account_ids {
        let app = app.clone();
        let query = query.clone();
        join_set.spawn(async move {
            let creds = OAuthCredentials::load()?;
            let email = get_account_email(&app, &account_id)?;
            gmail_api::search_messages(&creds, &account_id, &email, &query).await
        });
    }

    let mut all_messages = Vec::new();
    while let Some(result) = join_set.join_next().await {
        match result {
            Ok(Ok(messages)) => all_messages.extend(messages),
            Ok(Err(e)) => log::error!("Failed to search account: {e}"),
            Err(e) => log::error!("Search task panicked: {e}"),
        }
    }

    all_messages.sort_by(|a, b| b.date.cmp(&a.date));
    Ok(all_messages)
}

/// Send an email from the specified account.
#[tauri::command]
#[specta::specta]
pub async fn send_message(app: AppHandle, request: SendMessageRequest) -> Result<(), String> {
    let creds = OAuthCredentials::load()?;
    let email = get_account_email(&app, &request.account_id)?;
    gmail_api::send_message(
        &creds,
        &email,
        &request.to,
        &request.cc,
        &request.subject,
        &request.body,
        request.in_reply_to.as_deref(),
        request.references.as_deref(),
    )
    .await
}
