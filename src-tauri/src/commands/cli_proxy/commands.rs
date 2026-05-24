use std::sync::Arc;

use crate::commands::cli_proxy::config::{
    build_cli_proxy_status, load_cli_proxy_config_file, save_cli_proxy_config_file,
};
use crate::commands::cli_proxy::gateway::{run_cli_gateway_until_shutdown, test_cli_proxy_upstream};
use crate::commands::cli_proxy::types::{CliProxyConfig, CliProxyManager, CliProxyStatus, CliProxyTestResult};

#[tauri::command]
pub fn load_cli_proxy_config() -> Result<CliProxyConfig, String> {
    Ok(load_cli_proxy_config_file())
}

#[tauri::command]
pub fn save_cli_proxy_config(
    manager: tauri::State<'_, Arc<CliProxyManager>>,
    config: CliProxyConfig,
) -> Result<CliProxyStatus, String> {
    for tool in &config.tools {
        if tool.port == 0 {
            return Err(format!("工具 {} 的端口不能为 0", tool.tool_type.as_str()));
        }
    }
    let duplicate_ports: Vec<u16> = {
        let mut ports: Vec<u16> = config.tools.iter().map(|t| t.port).collect();
        ports.sort();
        ports.dedup();
        let original: Vec<u16> = config.tools.iter().map(|t| t.port).collect();
        ports.into_iter().filter(|p| original.iter().filter(|&&o| o == *p).count() > 1).collect()
    };
    if !duplicate_ports.is_empty() {
        return Err(format!("端口冲突：{} 被多个工具使用", duplicate_ports.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(", ")));
    }

    save_cli_proxy_config_file(&config)?;
    *manager
        .config
        .write()
        .unwrap_or_else(|err| err.into_inner()) = config.clone();
    let manager_arc = manager.inner().clone();
    Ok(build_cli_proxy_status(&manager_arc, &config))
}

#[tauri::command]
pub fn get_cli_proxy_status(
    manager: tauri::State<'_, Arc<CliProxyManager>>,
) -> Result<CliProxyStatus, String> {
    let config = manager
        .config
        .read()
        .unwrap_or_else(|err| err.into_inner())
        .clone();
    let manager_arc = manager.inner().clone();
    Ok(build_cli_proxy_status(&manager_arc, &config))
}

#[tauri::command]
pub async fn start_cli_proxy_service(
    manager: tauri::State<'_, Arc<CliProxyManager>>,
    tool_id: String,
) -> Result<CliProxyStatus, String> {
    // 1. 从内存读取当前配置
    let config = manager
        .config
        .read()
        .unwrap_or_else(|err| err.into_inner())
        .clone();
    let tool_config = config
        .tools
        .iter()
        .find(|t| t.id == tool_id)
        .cloned()
        .ok_or_else(|| format!("未找到工具配置：{}", tool_id))?;

    if !tool_config.enabled {
        return Err("请先启用该工具".to_string());
    }
    if tool_config.api_url.trim().is_empty() {
        return Err("请先配置 API 地址".to_string());
    }
    if tool_config.api_key.trim().is_empty() {
        return Err("请先配置 API Key".to_string());
    }

    // 2. 自动保存配置到文件（确保启动的是最新配置）
    save_cli_proxy_config_file(&config)?;

    // 3. 检查端口是否被占用
    let port = tool_config.port;
    match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
        Ok(listener) => {
            // 端口可用，立即释放
            drop(listener);
        }
        Err(_) => {
            return Err(format!(
                "端口 {} 已被占用，请更换端口或等待其他服务释放",
                port
            ));
        }
    }

    let shutdown_receiver = {
        let mut runtimes = manager
            .runtimes
            .write()
            .unwrap_or_else(|err| err.into_inner());
        if let Some(state) = runtimes.get(&tool_id) {
            if state.running {
                let manager_arc = manager.inner().clone();
                return Ok(build_cli_proxy_status(&manager_arc, &config));
            }
        }
        let (shutdown_sender, shutdown_receiver) = tokio::sync::oneshot::channel();
        runtimes.insert(
            tool_id.clone(),
            crate::commands::cli_proxy::types::ToolRuntimeState {
                running: true,
                shutdown: Some(shutdown_sender),
            },
        );
        shutdown_receiver
    };

    let manager_arc = manager.inner().clone();
    let id_for_cleanup = tool_id.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(err) =
            run_cli_gateway_until_shutdown(tool_config, port, shutdown_receiver)
                .await
        {
            eprintln!("[cli-proxy] gateway {} stopped: {}", id_for_cleanup, err);
        }
        let mut runtimes = manager_arc
            .runtimes
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(state) = runtimes.get_mut(&id_for_cleanup) {
            state.running = false;
            state.shutdown = None;
        }
    });

    let manager_arc = manager.inner().clone();
    Ok(build_cli_proxy_status(&manager_arc, &config))
}

#[tauri::command]
pub fn stop_cli_proxy_service(
    manager: tauri::State<'_, Arc<CliProxyManager>>,
    tool_id: String,
) -> Result<CliProxyStatus, String> {
    let mut runtimes = manager
        .runtimes
        .write()
        .unwrap_or_else(|err| err.into_inner());
    if let Some(state) = runtimes.get_mut(&tool_id) {
        if let Some(shutdown) = state.shutdown.take() {
            let _ = shutdown.send(());
        }
        state.running = false;
    }
    drop(runtimes);

    let config = manager
        .config
        .read()
        .unwrap_or_else(|err| err.into_inner())
        .clone();
    let manager_arc = manager.inner().clone();
    Ok(build_cli_proxy_status(&manager_arc, &config))
}

#[tauri::command]
pub async fn test_cli_proxy_connection(
    manager: tauri::State<'_, Arc<CliProxyManager>>,
    tool_id: String,
) -> Result<CliProxyTestResult, String> {
    let config = manager
        .config
        .read()
        .unwrap_or_else(|err| err.into_inner())
        .clone();
    let tool_config = config
        .tools
        .iter()
        .find(|t| t.id == tool_id)
        .cloned()
        .ok_or_else(|| format!("未找到工具配置：{}", tool_id))?;
    test_cli_proxy_upstream(&tool_config).await
}
