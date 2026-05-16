use std::sync::Arc;
use tauri;

use crate::commands::model_mapping::types::{
    ModelMappingConfig, ModelMappingManager, ModelMappingSettings, ModelMappingStatus,
    ModelMappingLogEntry, ModelMappingTestRequest, ModelMappingTestResult,
};
use crate::commands::model_mapping::config::{
    load_config_file, load_settings_file, normalize_config, save_config_file,
    save_settings_file, current_port, validate_config, build_status,
};
use crate::commands::model_mapping::claude::{
    apply_to_claude_desktop, restart_claude_desktop, ensure_model_mapping_claude_gateway,
    is_autostart_enabled, set_autostart,
};
use crate::commands::model_mapping::gateway::{
    run_gateway_until_shutdown,
};

#[tauri::command]
pub fn load_model_mapping_config() -> Result<ModelMappingConfig, String> {
    Ok(normalize_config(load_config_file()))
}

#[tauri::command]
pub fn load_model_mapping_settings() -> Result<ModelMappingSettings, String> {
    Ok(load_settings_file())
}

#[tauri::command]
pub fn save_model_mapping_settings(
    manager: tauri::State<'_, Arc<ModelMappingManager>>,
    settings: ModelMappingSettings,
) -> Result<ModelMappingStatus, String> {
    save_settings_file(&settings)?;
    let config = manager
        .config
        .read()
        .unwrap_or_else(|err| err.into_inner())
        .clone();
    if let Err(err) = apply_to_claude_desktop(&config).map(|_| ()) {
        eprintln!(
            "[model-mapping] update gateway config after port change failed: {}",
            err
        );
    }
    let running = manager
        .runtime
        .read()
        .unwrap_or_else(|err| err.into_inner())
        .running;
    Ok(build_status(running, Some(config)))
}

#[tauri::command]
pub fn save_model_mapping_config(
    manager: tauri::State<'_, Arc<ModelMappingManager>>,
    config: ModelMappingConfig,
) -> Result<ModelMappingStatus, String> {
    let normalized = normalize_config(config);
    validate_config(&normalized)?;
    save_config_file(&normalized)?;
    *manager
        .config
        .write()
        .unwrap_or_else(|err| err.into_inner()) = normalized.clone();
    let running = manager
        .runtime
        .read()
        .unwrap_or_else(|err| err.into_inner())
        .running;
    Ok(build_status(running, Some(normalized)))
}

#[tauri::command]
pub fn apply_model_mapping_to_claude(
    manager: tauri::State<'_, Arc<ModelMappingManager>>,
    config: ModelMappingConfig,
) -> Result<String, String> {
    let normalized = normalize_config(config);
    save_config_file(&normalized)?;
    *manager
        .config
        .write()
        .unwrap_or_else(|err| err.into_inner()) = normalized.clone();
    let message = apply_to_claude_desktop(&normalized)?;
    restart_claude_desktop();
    Ok(format!("{}，Claude Desktop 正在重启", message))
}

#[tauri::command]
pub fn get_model_mapping_autostart() -> Result<bool, String> {
    Ok(is_autostart_enabled())
}

#[tauri::command]
pub fn set_model_mapping_autostart(enabled: bool) -> Result<bool, String> {
    set_autostart(enabled)?;
    Ok(is_autostart_enabled())
}

#[tauri::command]
pub async fn start_model_mapping_gateway(
    manager: tauri::State<'_, Arc<ModelMappingManager>>,
    config: ModelMappingConfig,
) -> Result<ModelMappingStatus, String> {
    let normalized = normalize_config(config);
    validate_config(&normalized)?;
    save_config_file(&normalized)?;
    *manager
        .config
        .write()
        .unwrap_or_else(|err| err.into_inner()) = normalized.clone();
    let shutdown_receiver = {
        let mut runtime = manager
            .runtime
            .write()
            .unwrap_or_else(|err| err.into_inner());
        if runtime.running {
            return Ok(build_status(true, Some(normalized)));
        }
        let (shutdown_sender, shutdown_receiver) = tokio::sync::oneshot::channel();
        runtime.shutdown = Some(shutdown_sender);
        runtime.running = true;
        shutdown_receiver
    };

    let manager_arc = manager.inner().clone();
    let port = current_port();
    tauri::async_runtime::spawn(async move {
        if let Err(err) =
            run_gateway_until_shutdown(manager_arc.clone(), port, shutdown_receiver).await
        {
            eprintln!("[model-mapping] gateway stopped: {}", err);
        }
        let mut runtime = manager_arc
            .runtime
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        runtime.running = false;
        runtime.shutdown = None;
    });

    Ok(build_status(true, Some(normalized)))
}

#[tauri::command]
pub fn stop_model_mapping_gateway(
    manager: tauri::State<'_, Arc<ModelMappingManager>>,
) -> Result<ModelMappingStatus, String> {
    let mut runtime = manager
        .runtime
        .write()
        .unwrap_or_else(|err| err.into_inner());
    if let Some(shutdown) = runtime.shutdown.take() {
        let _ = shutdown.send(());
    }
    runtime.running = false;
    Ok(build_status(false, None))
}

pub fn start_model_mapping_gateway_on_startup(manager: Arc<ModelMappingManager>) {
    ensure_model_mapping_claude_gateway();
    let config = normalize_config(load_config_file());
    *manager
        .config
        .write()
        .unwrap_or_else(|err| err.into_inner()) = config;
    let port = current_port();
    let shutdown_receiver = {
        let mut runtime = manager
            .runtime
            .write()
            .unwrap_or_else(|err| err.into_inner());
        if runtime.running {
            return;
        }
        let (shutdown_sender, shutdown_receiver) = tokio::sync::oneshot::channel();
        runtime.shutdown = Some(shutdown_sender);
        runtime.running = true;
        shutdown_receiver
    };
    tauri::async_runtime::spawn(async move {
        if let Err(err) = run_gateway_until_shutdown(manager.clone(), port, shutdown_receiver).await
        {
            eprintln!("[model-mapping] gateway stopped: {}", err);
        }
        let mut runtime = manager
            .runtime
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        runtime.running = false;
        runtime.shutdown = None;
    });
}

#[tauri::command]
pub async fn test_model_mapping_provider(
    request: ModelMappingTestRequest,
) -> Result<ModelMappingTestResult, String> {
    crate::commands::model_mapping::gateway::test_model_mapping_provider(request).await
}

#[tauri::command]
pub fn get_model_mapping_status(
    manager: tauri::State<'_, Arc<ModelMappingManager>>,
) -> Result<ModelMappingStatus, String> {
    let running = manager
        .runtime
        .read()
        .unwrap_or_else(|err| err.into_inner())
        .running;
    Ok(build_status(running, None))
}

#[tauri::command]
pub fn get_model_mapping_logs(
    manager: tauri::State<'_, Arc<ModelMappingManager>>,
) -> Result<Vec<ModelMappingLogEntry>, String> {
    Ok(manager
        .logs
        .read()
        .unwrap_or_else(|err| err.into_inner())
        .clone())
}
