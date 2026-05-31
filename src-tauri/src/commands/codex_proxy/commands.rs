use std::sync::Arc;
use tauri::State;

use crate::commands::codex_proxy::{
    types::*,
    config::*,
    gateway::start_gateway,
};

/// 加载配置
#[tauri::command]
pub fn load_codex_proxy_config() -> Result<CodexProxyConfig, String> {
    Ok(load_config_file())
}

/// 保存配置
#[tauri::command]
pub fn save_codex_proxy_config(config: CodexProxyConfig) -> Result<CodexProxyStatus, String> {
    validate_config(&config)?;
    let normalized = normalize_config(config);
    save_config_file(&normalized)?;
    Ok(build_status(false, Some(normalized)))
}

/// 加载设置
#[tauri::command]
pub fn load_codex_proxy_settings() -> Result<CodexProxySettings, String> {
    Ok(load_settings_file())
}

/// 保存设置
#[tauri::command]
pub fn save_codex_proxy_settings(settings: CodexProxySettings) -> Result<(), String> {
    save_settings_file(&settings)
}

/// 获取状态
#[tauri::command]
pub fn get_codex_proxy_status() -> Result<CodexProxyStatus, String> {
    Ok(build_status(false, None))
}

/// 启动代理
#[tauri::command]
pub async fn start_codex_proxy_gateway(
    config: CodexProxyConfig,
) -> Result<CodexProxyStatus, String> {
    validate_config(&config)?;
    
    let settings = load_settings_file();
    let port = settings.port;
    
    // 保存配置
    let normalized = normalize_config(config);
    save_config_file(&normalized)?;
    
    // 启动网关
    match start_gateway(port).await {
        Ok(_handle) => {
            Ok(build_status(true, Some(normalized)))
        }
        Err(e) => Err(e),
    }
}

/// 停止代理
#[tauri::command]
pub fn stop_codex_proxy_gateway() -> Result<CodexProxyStatus, String> {
    // 实际停止逻辑需要实现
    Ok(build_status(false, None))
}

/// 测试 Provider
#[tauri::command]
pub async fn test_codex_proxy_provider(
    target_url: String,
    api_key: String,
    model: String,
) -> Result<CodexProxyTestResult, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/v1/chat/completions", target_url.trim_end_matches('/'));
    
    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 10,
    });
    
    let start = std::time::Instant::now();
    
    match client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
    {
        Ok(resp) => {
            let status = resp.status();
            let latency = start.elapsed().as_millis() as u64;
            
            if status.is_success() {
                match resp.json::<serde_json::Value>().await {
                    Ok(json) => {
                        if json.get("choices").is_some() {
                            Ok(CodexProxyTestResult {
                                ok: true,
                                status: Some(status.as_u16()),
                                message: format!("连接成功 ({}ms)", latency),
                            })
                        } else {
                            Ok(CodexProxyTestResult {
                                ok: false,
                                status: Some(status.as_u16()),
                                message: "响应格式不正确".to_string(),
                            })
                        }
                    }
                    Err(e) => Ok(CodexProxyTestResult {
                        ok: false,
                        status: Some(status.as_u16()),
                        message: format!("解析响应失败: {}", e),
                    }),
                }
            } else {
                let text = resp.text().await.unwrap_or_default();
                Ok(CodexProxyTestResult {
                    ok: false,
                    status: Some(status.as_u16()),
                    message: format!("HTTP {}: {}", status.as_u16(), text),
                })
            }
        }
        Err(e) => Ok(CodexProxyTestResult {
            ok: false,
            status: None,
            message: format!("请求失败: {}", e),
        }),
    }
}

/// 获取日志
#[tauri::command]
pub fn get_codex_proxy_logs() -> Result<Vec<CodexProxyLogEntry>, String> {
    // 实际日志实现需要完善
    Ok(Vec::new())
}

/// 设置开机自启
#[tauri::command]
pub fn set_codex_proxy_autostart(enabled: bool) -> Result<bool, String> {
    // 实际自启实现需要完善
    Ok(enabled)
}

/// 应用到 Codex
#[tauri::command]
pub fn apply_codex_proxy_to_codex(config: CodexProxyConfig) -> Result<String, String> {
    // 将配置应用到 Codex CLI 的配置文件
    let codex_dir = codex_config_dir();
    if let Some(dir) = codex_dir {
        std::fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {}", e))?;
        
        // 创建或更新 Codex 配置文件
        let config_file = dir.join("config.json");
        let settings = load_settings_file();
        
        let codex_config = serde_json::json!({
            "api_key": "dummy-key-use-proxy",
            "base_url": format!("http://127.0.0.1:{}", settings.port),
        });
        
        std::fs::write(&config_file, serde_json::to_string_pretty(&codex_config).unwrap())
            .map_err(|e| format!("写入配置文件失败: {}", e))?;
        
        Ok(format!("已应用到 Codex 配置: {}", config_file.display()))
    } else {
        Err("无法找到 Codex 配置目录".to_string())
    }
}

/// 获取默认下载路径
fn codex_config_dir() -> Option<std::path::PathBuf> {
    let home = home_dir();
    Some(home.join(".codex"))
}
