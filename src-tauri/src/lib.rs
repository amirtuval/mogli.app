// Clippy pedantic for the whole crate. Selectively allow lints that are
// too noisy for a Tauri app (module naming dictated by Tauri conventions,
// error types mandated by the command interface, etc.).
#![warn(clippy::pedantic)]
#![allow(
    // Tauri commands must return Result<T, String>; using a custom error
    // enum everywhere would fight the framework.
    clippy::missing_errors_doc,
    // Several public items are only public for tauri-specta / Tauri command
    // registration and don't need full rustdoc.
    clippy::missing_docs_in_private_items,
    // We intentionally keep module names matching file names (models.rs,
    // store.rs) rather than renaming for Clippy's taste.
    clippy::module_name_repetitions
)]

mod commands;
mod google;
mod keychain;
mod models;
mod store;

use store::AccountStore;
use tauri::Manager;
use tauri_specta::{collect_commands, Builder};

/// Create the tauri-specta builder with all commands registered.
fn create_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        commands::auth::add_account,
        commands::auth::remove_account,
        commands::auth::list_accounts,
        commands::gmail::get_messages,
        commands::gmail::get_thread,
    ])
}

/// Launch the Tauri application.
///
/// # Panics
///
/// Panics if the Tauri runtime fails to initialise (e.g. missing webview).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = create_builder();

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AccountStore::new())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);

            // Load accounts from store on startup
            if let Err(e) = store::load_accounts(app.handle()) {
                log::warn!("Failed to load accounts on startup: {e}");
            }

            // In debug builds, prefix the window title so dev is visually distinct
            #[cfg(debug_assertions)]
            if let Some(window) = app.webview_windows().values().next() {
                let _ = window.set_title("[DEV] Mogly");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_ts_bindings() {
        create_builder()
            .export(
                specta_typescript::Typescript::default()
                    .bigint(specta_typescript::BigIntExportBehavior::Number),
                "../src/types/bindings.ts",
            )
            .expect("Failed to export TypeScript bindings");
    }
}
