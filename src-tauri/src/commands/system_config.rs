use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::commands::model_mapping::claude::{
    apply_to_claude_desktop, is_autostart_enabled, set_autostart,
};
use crate::commands::model_mapping::config::load_config_file as load_model_mapping_config_file;

/// 读取 home 目录
fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// 读取文件内容，不存在时返回 None
fn read_file_optional(path: PathBuf) -> Option<String> {
    if !path.exists() {
        return None;
    }
    std::fs::read_to_string(&path).ok()
}

/// 获取 6 类配置文件路径
fn model_mapping_config_path() -> PathBuf {
    home_dir().join(".claude-model-proxy/config.json")
}

fn model_mapping_settings_path() -> PathBuf {
    home_dir().join(".claude-model-proxy/settings.json")
}

fn codex_proxy_config_path() -> PathBuf {
    home_dir().join(".aimodal-codex-proxy/config.json")
}

fn codex_proxy_settings_path() -> PathBuf {
    home_dir().join(".aimodal-codex-proxy/settings.json")
}

fn cli_proxy_config_path() -> PathBuf {
    home_dir().join(".aimodal-cli-proxy/config.json")
}

fn mcp_config_path() -> PathBuf {
    home_dir().join(".agents/mcp.config.json")
}

fn curl_tasks_dir() -> PathBuf {
    home_dir().join(".aimodal-curl-tasks")
}

/// 导出文件配置的 key 常量
const KEY_MODEL_MAPPING_CONFIG: &str = "model_mapping_config";
const KEY_MODEL_MAPPING_SETTINGS: &str = "model_mapping_settings";
const KEY_CODEX_PROXY_CONFIG: &str = "codex_proxy_config";
const KEY_CODEX_PROXY_SETTINGS: &str = "codex_proxy_settings";
const KEY_CLI_PROXY_CONFIG: &str = "cli_proxy_config";
const KEY_MCP_CONFIG: &str = "mcp_config";

// ─── 导出 ───

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AutostartState {
    pub model_mapping: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppFilesExport {
    pub files: HashMap<String, Option<String>>,
    pub curl_tasks: HashMap<String, String>,
    pub autostart: AutostartState,
}

/// 导出应用文件配置（6 类配置文件 + curl-tasks + 开机自启状态）
#[tauri::command]
pub fn export_app_files() -> Result<AppFilesExport, String> {
    let mut files: HashMap<String, Option<String>> = HashMap::new();

    files.insert(
        KEY_MODEL_MAPPING_CONFIG.to_string(),
        read_file_optional(model_mapping_config_path()),
    );
    files.insert(
        KEY_MODEL_MAPPING_SETTINGS.to_string(),
        read_file_optional(model_mapping_settings_path()),
    );
    files.insert(
        KEY_CODEX_PROXY_CONFIG.to_string(),
        read_file_optional(codex_proxy_config_path()),
    );
    files.insert(
        KEY_CODEX_PROXY_SETTINGS.to_string(),
        read_file_optional(codex_proxy_settings_path()),
    );
    files.insert(
        KEY_CLI_PROXY_CONFIG.to_string(),
        read_file_optional(cli_proxy_config_path()),
    );
    files.insert(
        KEY_MCP_CONFIG.to_string(),
        read_file_optional(mcp_config_path()),
    );

    // 读取 curl-tasks 目录下所有 .json 文件
    let mut curl_tasks: HashMap<String, String> = HashMap::new();
    let curl_dir = curl_tasks_dir();
    if curl_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&curl_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("json") {
                    let file_name = path
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_string();
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        curl_tasks.insert(file_name, content);
                    }
                }
            }
        }
    }

    let autostart = AutostartState {
        model_mapping: is_autostart_enabled(),
    };

    Ok(AppFilesExport {
        files,
        curl_tasks,
        autostart,
    })
}

// ─── 导入 ───

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppFilesImport {
    pub files: HashMap<String, Option<String>>,
    #[serde(default)]
    pub curl_tasks: Option<HashMap<String, String>>,
    #[serde(default)]
    pub autostart: Option<AutostartState>,
}

/// 写入文件内容（自动创建目录）
fn write_file_content(path: PathBuf, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("无法创建目录 {}: {}", parent.display(), err))?;
    }
    std::fs::write(&path, content)
        .map_err(|err| format!("写入文件 {} 失败: {}", path.display(), err))
}

/// 清空 curl-tasks 目录下所有 .json 文件
fn clear_curl_tasks_dir() -> Result<(), String> {
    let dir = curl_tasks_dir();
    if !dir.exists() {
        return Ok(());
    }
    let entries =
        std::fs::read_dir(&dir).map_err(|err| format!("读取目录 {} 失败: {}", dir.display(), err))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            let _ = std::fs::remove_file(&path);
        }
    }
    Ok(())
}

/// 导入应用文件配置（覆盖写入 6 类配置文件 + curl-tasks + 恢复开机自启）
#[tauri::command]
pub fn import_app_files(payload: AppFilesImport) -> Result<(), String> {
    // 1. 覆盖写入 6 类配置文件（None 值跳过）
    for (key, value) in &payload.files {
        let content = match value {
            Some(c) => c,
            None => continue,
        };
        let path = match key.as_str() {
            KEY_MODEL_MAPPING_CONFIG => model_mapping_config_path(),
            KEY_MODEL_MAPPING_SETTINGS => model_mapping_settings_path(),
            KEY_CODEX_PROXY_CONFIG => codex_proxy_config_path(),
            KEY_CODEX_PROXY_SETTINGS => codex_proxy_settings_path(),
            KEY_CLI_PROXY_CONFIG => cli_proxy_config_path(),
            KEY_MCP_CONFIG => mcp_config_path(),
            _ => continue,
        };
        write_file_content(path, content)?;
    }

    // 2. 模型映射 settings 写入后，自动应用到 Claude Desktop
    //    读取刚写入的 config 文件，调用 apply_to_claude_desktop
    if payload.files.contains_key(KEY_MODEL_MAPPING_CONFIG)
        || payload.files.contains_key(KEY_MODEL_MAPPING_SETTINGS)
    {
        let config = load_model_mapping_config_file();
        if let Err(err) = apply_to_claude_desktop(&config).map(|_| ()) {
            eprintln!(
                "[system_config] 导入后更新 Claude Desktop 配置失败: {}",
                err
            );
        }
    }

    // 3. curl-tasks：先清空目录，再逐个写入
    if let Some(curl_tasks) = &payload.curl_tasks {
        clear_curl_tasks_dir()?;
        let dir = curl_tasks_dir();
        std::fs::create_dir_all(&dir)
            .map_err(|err| format!("无法创建目录 {}: {}", dir.display(), err))?;
        for (file_name, content) in curl_tasks {
            let path = dir.join(file_name);
            write_file_content(path, content)?;
        }
    }

    // 4. 恢复开机自启状态
    if let Some(autostart) = &payload.autostart {
        let _ = set_autostart(autostart.model_mapping);
    }

    Ok(())
}
