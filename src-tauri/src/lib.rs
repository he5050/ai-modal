#![cfg_attr(target_os = "macos", allow(unexpected_cfgs))]

mod commands;
mod providers;

use commands::mcp::{
    extract_modelscope_mcp_server, extract_modelscope_mcp_server_with_profile,
    inspect_modelscope_mcp_server, search_modelscope_mcp_servers, test_mcp_server,
};
use commands::cli_proxy::{
    get_cli_proxy_status, load_cli_proxy_config, save_cli_proxy_config,
    start_cli_proxy_service, stop_cli_proxy_service, test_cli_proxy_connection, CliProxyManager,
};
use commands::codex_proxy::{
    load_codex_proxy_config, save_codex_proxy_config, load_codex_proxy_settings,
    save_codex_proxy_settings, get_codex_proxy_status, start_codex_proxy_gateway,
    stop_codex_proxy_gateway, test_codex_proxy_provider, get_codex_proxy_logs,
    set_codex_proxy_autostart, apply_codex_proxy_to_codex,
};
use commands::model::{list_models, test_models};
use commands::model_mapping::{
    apply_model_mapping_to_claude, ensure_model_mapping_claude_gateway,
    get_model_mapping_autostart, get_model_mapping_logs, get_model_mapping_status,
    load_model_mapping_config, load_model_mapping_settings, save_model_mapping_config,
    save_model_mapping_settings, set_model_mapping_autostart, start_model_mapping_gateway,
    start_model_mapping_gateway_on_startup, stop_model_mapping_gateway,
    test_model_mapping_provider, ModelMappingManager,
};
use commands::model_config::test_model_config;
use commands::provider::{
    list_models_by_provider, test_models_by_provider, test_single_model_by_provider,
};
use commands::skill_enrichment::{
    enrich_single_skill, resolve_system_llm, translate_online_skill_detail,
};
use commands::skill_enrichment_job::{
    get_skill_enrichment_job_status, start_skill_enrichment_job, stop_skill_enrichment_job,
    SkillEnrichmentJobManager,
};
use commands::curl_task::{
    delete_curl_task, execute_curl_direct, execute_curl_raw, execute_curl_task, load_curl_tasks,
    parse_curl_command, save_curl_task,
};
use commands::skills::{
    inspect_online_skill, inspect_skill_targets, run_skills_command, scan_local_skills,
    search_online_skills, sync_skill_targets,
};
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuEvent, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Manager, WindowEvent, Wry,
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
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(SkillEnrichmentJobManager::default())
        .manage(std::sync::Arc::new(ModelMappingManager::default()))
        .manage(std::sync::Arc::new(CliProxyManager::default()))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:state.db", migrations)
                .build(),
        )
        .setup(|app| {
            ensure_model_mapping_claude_gateway();
            if let Some(manager) = app.try_state::<std::sync::Arc<ModelMappingManager>>() {
                start_model_mapping_gateway_on_startup(manager.inner().clone());
            }
            let show_item = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&quit_item)
                .build()?;
            let icon = app
                .default_window_icon()
                .cloned()
                .unwrap_or_else(|| Image::new(&[], 0, 0));
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .tooltip("AIModal")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app: &AppHandle<Wry>, event: MenuEvent| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            #[cfg(target_os = "macos")]
            {
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

                        // 设置标题栏背景色为深色（与主题一致）
                        use cocoa::appkit::{NSColor, NSWindow};
                        let bg_color = NSColor::colorWithRed_green_blue_alpha_(
                            cocoa::base::nil,
                            17.0 / 255.0,   // Red (深灰色 #111827)
                            24.0 / 255.0,   // Green
                            39.0 / 255.0,   // Blue
                            1.0,            // Alpha
                        );
                        ns_window.setBackgroundColor_(bg_color);
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_models,
            test_models,
            test_mcp_server,
            search_modelscope_mcp_servers,
            inspect_modelscope_mcp_server,
            extract_modelscope_mcp_server,
            extract_modelscope_mcp_server_with_profile,
            load_model_mapping_config,
            load_model_mapping_settings,
            save_model_mapping_config,
            save_model_mapping_settings,
            apply_model_mapping_to_claude,
            start_model_mapping_gateway,
            stop_model_mapping_gateway,
            get_model_mapping_status,
            get_model_mapping_logs,
            test_model_mapping_provider,
            get_model_mapping_autostart,
            set_model_mapping_autostart,
            load_cli_proxy_config,
            save_cli_proxy_config,
            get_cli_proxy_status,
            start_cli_proxy_service,
            stop_cli_proxy_service,
            test_cli_proxy_connection,
            test_model_config,
            list_models_by_provider,
            test_models_by_provider,
            test_single_model_by_provider,
            scan_local_skills,
            inspect_skill_targets,
            sync_skill_targets,
            run_skills_command,
            search_online_skills,
            inspect_online_skill,
            resolve_system_llm,
            enrich_single_skill,
            translate_online_skill_detail,
            start_skill_enrichment_job,
            get_skill_enrichment_job_status,
            stop_skill_enrichment_job,
            load_curl_tasks,
            save_curl_task,
            delete_curl_task,
            execute_curl_task,
            execute_curl_direct,
            execute_curl_raw,
            parse_curl_command,
            load_codex_proxy_config,
            save_codex_proxy_config,
            load_codex_proxy_settings,
            save_codex_proxy_settings,
            get_codex_proxy_status,
            start_codex_proxy_gateway,
            stop_codex_proxy_gateway,
            test_codex_proxy_provider,
            get_codex_proxy_logs,
            set_codex_proxy_autostart,
            apply_codex_proxy_to_codex,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
