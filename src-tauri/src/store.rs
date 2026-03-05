use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

use crate::models::Account;

#[cfg(debug_assertions)]
const STORE_FILENAME: &str = "accounts.dev.json";

#[cfg(not(debug_assertions))]
const STORE_FILENAME: &str = "accounts.json";

const ACCOUNTS_KEY: &str = "accounts";

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
