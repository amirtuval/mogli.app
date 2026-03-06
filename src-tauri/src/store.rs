use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

use crate::models::Account;

#[cfg(debug_assertions)]
const STORE_FILENAME: &str = "accounts.dev.json";

#[cfg(not(debug_assertions))]
const STORE_FILENAME: &str = "accounts.json";

const ACCOUNTS_KEY: &str = "accounts";
const THEME_KEY: &str = "theme";
const CALENDAR_ENABLED_KEY: &str = "calendar_enabled";
const WEEK_START_DAY_KEY: &str = "week_start_day";

/// In-memory account state, synced to disk via tauri-plugin-store.
pub struct AccountStore {
    pub accounts: Mutex<Vec<Account>>,
}

impl AccountStore {
    pub fn new() -> Self {
        Self {
            accounts: Mutex::new(Vec::new()),
        }
    }
}

/// Load accounts from the persistent store into the in-memory state.
pub fn load_accounts(app: &AppHandle) -> Result<Vec<Account>, String> {
    let store = app
        .store(STORE_FILENAME)
        .map_err(|e| format!("Failed to open store: {e}"))?;

    let accounts: Vec<Account> = store
        .get(ACCOUNTS_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    // Sync to in-memory state
    let state = app.state::<AccountStore>();
    let mut guard = state
        .accounts
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;
    guard.clone_from(&accounts);

    Ok(accounts)
}

/// Save the current in-memory accounts to the persistent store.
pub fn save_accounts(app: &AppHandle, accounts: &[Account]) -> Result<(), String> {
    let store = app
        .store(STORE_FILENAME)
        .map_err(|e| format!("Failed to open store: {e}"))?;

    let value = serde_json::to_value(accounts).map_err(|e| format!("Serialize error: {e}"))?;
    store.set(ACCOUNTS_KEY, value);
    store.save().map_err(|e| format!("Save error: {e}"))?;

    Ok(())
}

/// Add an account to both in-memory state and persistent store.
pub fn add_account(app: &AppHandle, account: Account) -> Result<(), String> {
    let state = app.state::<AccountStore>();
    let mut guard = state
        .accounts
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;
    guard.push(account);
    save_accounts(app, &guard)?;
    Ok(())
}

/// Remove an account by ID from both in-memory state and persistent store.
pub fn remove_account(app: &AppHandle, account_id: &str) -> Result<(), String> {
    let state = app.state::<AccountStore>();
    let mut guard = state
        .accounts
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;
    guard.retain(|a| a.id != account_id);
    save_accounts(app, &guard)?;
    Ok(())
}

/// Get the current account count (for color assignment).
pub fn account_count(app: &AppHandle) -> Result<usize, String> {
    let state = app.state::<AccountStore>();
    let guard = state
        .accounts
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;
    Ok(guard.len())
}

/// Load the persisted theme preference. Returns `None` if not set.
pub fn load_theme(app: &AppHandle) -> Result<Option<String>, String> {
    let store = app
        .store(STORE_FILENAME)
        .map_err(|e| format!("Failed to open store: {e}"))?;

    Ok(store
        .get(THEME_KEY)
        .and_then(|v| v.as_str().map(String::from)))
}

/// Persist the theme preference to disk.
pub fn save_theme(app: &AppHandle, theme: &str) -> Result<(), String> {
    let store = app
        .store(STORE_FILENAME)
        .map_err(|e| format!("Failed to open store: {e}"))?;

    store.set(THEME_KEY, serde_json::json!(theme));
    store.save().map_err(|e| format!("Save error: {e}"))?;
    Ok(())
}

/// Load the persisted week start day. Returns `None` if not set.
/// 0 = Sunday, 1 = Monday.
pub fn load_week_start_day(app: &AppHandle) -> Result<Option<u8>, String> {
    let store = app
        .store(STORE_FILENAME)
        .map_err(|e| format!("Failed to open store: {e}"))?;

    Ok(store
        .get(WEEK_START_DAY_KEY)
        .and_then(|v| v.as_u64())
        .and_then(|v| u8::try_from(v).ok())
        .filter(|&d| d <= 1))
}

/// Persist the week start day to disk. 0 = Sunday, 1 = Monday.
pub fn save_week_start_day(app: &AppHandle, day: u8) -> Result<(), String> {
    let store = app
        .store(STORE_FILENAME)
        .map_err(|e| format!("Failed to open store: {e}"))?;

    store.set(WEEK_START_DAY_KEY, serde_json::json!(day));
    store.save().map_err(|e| format!("Save error: {e}"))?;
    Ok(())
}

/// Update the `history_id` for an account (used by incremental sync).
pub fn update_history_id(
    app: &AppHandle,
    account_id: &str,
    history_id: &str,
) -> Result<(), String> {
    let state = app.state::<AccountStore>();
    let mut guard = state
        .accounts
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;

    if let Some(account) = guard.iter_mut().find(|a| a.id == account_id) {
        account.history_id = history_id.to_string();
    }
    save_accounts(app, &guard)?;
    Ok(())
}

/// Look up an account's email by its ID.
pub fn account_email(app: &AppHandle, account_id: &str) -> Result<String, String> {
    let state = app.state::<AccountStore>();
    let guard = state
        .accounts
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;

    guard
        .iter()
        .find(|a| a.id == account_id)
        .map(|a| a.email.clone())
        .ok_or_else(|| format!("Account not found: {account_id}"))
}

/// Load the persisted calendar enabled states.
/// Returns a map of `"account_id::calendar_id"` → `bool`.
pub fn load_calendar_enabled(app: &AppHandle) -> Result<HashMap<String, bool>, String> {
    let store = app
        .store(STORE_FILENAME)
        .map_err(|e| format!("Failed to open store: {e}"))?;

    let map: HashMap<String, bool> = store
        .get(CALENDAR_ENABLED_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    Ok(map)
}

/// Persist a single calendar's enabled state.
pub fn save_calendar_enabled(app: &AppHandle, key: &str, enabled: bool) -> Result<(), String> {
    let store = app
        .store(STORE_FILENAME)
        .map_err(|e| format!("Failed to open store: {e}"))?;

    let mut map: HashMap<String, bool> = store
        .get(CALENDAR_ENABLED_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    map.insert(key.to_string(), enabled);

    let value = serde_json::to_value(&map).map_err(|e| format!("Serialize error: {e}"))?;
    store.set(CALENDAR_ENABLED_KEY, value);
    store.save().map_err(|e| format!("Save error: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_account_store_new_is_empty() {
        let store = AccountStore::new();
        let guard = store.accounts.lock().unwrap();
        assert!(guard.is_empty());
    }
}
