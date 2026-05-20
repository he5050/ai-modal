use std::path::PathBuf;

use crate::commands::cli_proxy::types::CliProxyConfig;

pub fn cli_proxy_config_dir() -> PathBuf {
    home_dir().join(".aimodal-cli-proxy")
}

pub fn cli_proxy_config_path() -> PathBuf {
    cli_proxy_config_dir().join("config.json")
}

pub fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

pub fn load_cli_proxy_config_file() -> CliProxyConfig {
    let path = cli_proxy_config_path();
    if !path.exists() {
        return CliProxyConfig::default();
    }
    let data = std::fs::read_to_string(path).unwrap_or_default();
    serde_json::from_str(&data).unwrap_or_default()
}

pub fn save_cli_proxy_config_file(config: &CliProxyConfig) -> Result<(), String> {
    let dir = cli_proxy_config_dir();
    std::fs::create_dir_all(&dir).map_err(|err| format!("创建配置目录失败：{}", err))?;
    let data = serde_json::to_string_pretty(config).map_err(|err| format!("序列化配置失败：{}", err))?;
    std::fs::write(cli_proxy_config_path(), data).map_err(|err| format!("写入配置失败：{}", err))
}

pub fn build_cli_proxy_status(
    manager: &std::sync::Arc<crate::commands::cli_proxy::types::CliProxyManager>,
    config: &CliProxyConfig,
) -> crate::commands::cli_proxy::types::CliProxyStatus {
    let runtimes = manager
        .runtimes
        .read()
        .unwrap_or_else(|err| err.into_inner());
    let running_tools: Vec<String> = runtimes
        .iter()
        .filter(|(_, state)| state.running)
        .map(|(id, _)| id.clone())
        .collect();
    let any_running = !running_tools.is_empty();
    let port = if any_running {
        running_tools
            .iter()
            .filter_map(|id| config.tools.iter().find(|t| &t.id == id).map(|t| t.port))
            .next()
            .unwrap_or(0)
    } else {
        0
    };
    crate::commands::cli_proxy::types::CliProxyStatus {
        running: any_running,
        port,
        tool_count: config.tools.len(),
        running_tools,
    }
}
