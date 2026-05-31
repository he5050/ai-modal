use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;
use tokio::sync::oneshot;

/// Codex 默认模型槽位（类似 Claude 的槽位）
pub const DEFAULT_CODEX_SLOTS: &[&str] = &[
    "openai/gpt-5.5",
    "openai/gpt-5.4",
    "openai/gpt-5.4-mini",
    "openai/gpt-5.3-codex",
    "openai/gpt-5.2",
];

/// 模型映射条目
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CodexModelEntry {
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub slot: String,
    #[serde(default)]
    pub slots: Vec<String>,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub supported_protocols: Vec<String>,
    #[serde(default)]
    pub source_protocol: String,
    #[serde(default)]
    pub target_protocol: String,
    #[serde(default)]
    pub to_1m: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub protocol: String,
}

impl Default for CodexModelEntry {
    fn default() -> Self {
        Self {
            id: None,
            name: String::new(),
            slot: String::new(),
            slots: Vec::new(),
            display_name: String::new(),
            supported_protocols: Vec::new(),
            source_protocol: "openai-chat".to_string(),
            target_protocol: "openai-chat".to_string(),
            to_1m: String::new(),
            enabled: true,
            protocol: String::new(),
        }
    }
}

/// Provider 配置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CodexProvider {
    pub id: Option<String>,
    pub name: String,
    pub target_url: String,
    pub api_key: String,
    pub models: Vec<CodexModelEntry>,
    #[serde(default)]
    pub thinking_effort: String,
}

impl Default for CodexProvider {
    fn default() -> Self {
        Self {
            id: None,
            name: String::new(),
            target_url: String::new(),
            api_key: String::new(),
            models: Vec::new(),
            thinking_effort: String::new(),
        }
    }
}

/// 整体配置
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct CodexProxyConfig {
    #[serde(default)]
    pub providers: Vec<CodexProvider>,
}

/// 设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CodexProxySettings {
    pub port: u16,
}

impl Default for CodexProxySettings {
    fn default() -> Self {
        Self { port: 5679 }
    }
}

/// 状态
#[derive(Debug, Serialize, Clone)]
pub struct CodexProxyStatus {
    pub running: bool,
    pub autostart: bool,
    pub port: u16,
    pub config_path: String,
    pub codex_dir: Option<String>,
    pub model_count: usize,
    pub mapped_models: Vec<CodexModelFlatEntry>,
}

/// 扁平化的模型条目（用于展示）
#[derive(Debug, Serialize, Clone)]
pub struct CodexModelFlatEntry {
    pub slot: String,
    pub name: String,
    pub display_name: String,
    pub supported_protocols: Vec<String>,
    pub source_protocol: String,
    pub target_protocol: String,
    pub provider_name: String,
    pub target_url: String,
    pub supports_1m: bool,
    pub thinking_effort: String,
    pub protocol: String,
}

/// 测试结果
#[derive(Debug, Serialize, Clone)]
pub struct CodexProxyTestResult {
    pub ok: bool,
    pub status: Option<u16>,
    pub message: String,
}

/// 日志条目
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CodexProxyLogEntry {
    pub time: String,
    pub model: String,
    pub target_model: String,
    pub status: u16,
    pub thinking: String,
    pub source_protocol: Option<String>,
    pub target_protocol: Option<String>,
    pub request_url: Option<String>,
    pub request_method: Option<String>,
    pub request_body: Option<String>,
    pub response_body: Option<String>,
    pub converted_response_body: Option<String>,
    pub error_message: Option<String>,
}

/// 运行时状态
pub(crate) struct ToolRuntimeState {
    pub(crate) running: bool,
    pub(crate) shutdown: Option<oneshot::Sender<()>>,
}

/// 管理器
pub struct CodexProxyManager {
    pub(crate) runtimes: RwLock<HashMap<String, ToolRuntimeState>>,
    pub(crate) config: RwLock<CodexProxyConfig>,
    pub(crate) logs: RwLock<Vec<CodexProxyLogEntry>>,
}

impl Default for CodexProxyManager {
    fn default() -> Self {
        Self {
            runtimes: RwLock::new(HashMap::new()),
            config: RwLock::new(CodexProxyConfig::default()),
            logs: RwLock::new(Vec::new()),
        }
    }
}

/// 网关状态
pub(crate) struct CodexGatewayState {
    pub(crate) client: reqwest::Client,
    pub(crate) config: CodexProxyConfig,
    pub(crate) port: u16,
}
