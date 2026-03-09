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
mod notify;
mod reminders;
mod store;
mod sync;

use reminders::NotifiedEvents;
use store::AccountStore;
use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri_specta::{Builder, collect_commands};

/// Create the tauri-specta builder with all commands registered.
fn create_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        commands::auth::add_account,
        commands::auth::remove_account,
        commands::auth::list_accounts,
        commands::auth::load_theme,
        commands::auth::save_theme,
        commands::auth::load_week_start_day,
        commands::auth::save_week_start_day,
        commands::auth::load_auto_mark_read,
        commands::auth::save_auto_mark_read,
        commands::gmail::get_account_messages,
        commands::gmail::get_messages,
        commands::gmail::get_thread,
        commands::gmail::archive_thread,
        commands::gmail::star_thread,
        commands::gmail::mark_read,
        commands::gmail::mark_unread,
        commands::gmail::search_messages,
        commands::calendar::list_calendars,
        commands::calendar::set_calendar_enabled,
        commands::calendar::get_account_events,
        commands::calendar::get_events,
        commands::notification::is_notification_granted,
        commands::notification::request_notification_permission,
        commands::notification::set_tray_badge,
    ])
}

/// Set up the system tray icon with a right-click context menu.
fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let open_item = MenuItemBuilder::with_id("open", "Open Mogly").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&open_item, &quit_item])
        .build()?;

    TrayIconBuilder::with_id("main-tray")
        .tooltip("Mogly")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                if let Some(window) = app.webview_windows().values().next() {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.webview_windows().values().next() {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

/// Launch the Tauri application.
///
/// # Panics
///
/// Panics if the Tauri runtime fails to initialise (e.g. missing webview).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // In debug builds, load .env from the project root for OAuth credentials
    #[cfg(debug_assertions)]
    if let Err(e) = dotenvy::dotenv() {
        eprintln!("Warning: failed to load .env file: {e}");
    }

    let builder = create_builder();

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_filename({
                    #[cfg(debug_assertions)]
                    {
                        "window-state.dev.json"
                    }
                    #[cfg(not(debug_assertions))]
                    {
                        "window-state.json"
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AccountStore::new())
        .manage(NotifiedEvents::new())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);

            // Load accounts from store on startup
            if let Err(e) = store::load_accounts(app.handle()) {
                log::warn!("Failed to load accounts on startup: {e}");
            }

            // Start background sync (polls Gmail every 2 minutes)
            sync::start_background_sync(app.handle());

            // Start calendar reminder checks (every 60 seconds)
            reminders::start_calendar_reminders(app.handle().clone());

            // Set up system tray icon with right-click menu
            setup_tray(app)?;

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
