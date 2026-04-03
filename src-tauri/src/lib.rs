mod commands;
mod providers;

use commands::model::{list_models, test_models};
use commands::model_config::test_model_config;
use commands::provider::{
    list_models_by_provider, test_models_by_provider, test_single_model_by_provider,
};
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create_kv_store",
        sql: "CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL);",
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:state.db", migrations)
                .build(),
        )
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let ns_window = window.ns_window().unwrap() as cocoa::base::id;
                    unsafe {
                        use cocoa::foundation::NSString;
                        use objc::{class, msg_send, sel, sel_impl};
                        let name =
                            NSString::alloc(cocoa::base::nil).init_str("NSAppearanceNameDarkAqua");
                        let cls = class!(NSAppearance);
                        let appearance: cocoa::base::id = msg_send![cls, appearanceNamed: name];
                        let _: () = msg_send![ns_window, setAppearance: appearance];
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_models,
            test_models,
            test_model_config,
            list_models_by_provider,
            test_models_by_provider,
            test_single_model_by_provider,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
