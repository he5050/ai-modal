use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;
use tokio::sync::oneshot;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CliToolType {
    ClaudeCode,
    Codex,
    GeminiCli,
    Opencode,
    Aider,
}

impl CliToolType {
    pub fn as_str(&self) -> &'static str {
        match self {
            CliToolType::ClaudeCode => "claude-code",
            CliToolType::Codex => "codex",
            CliToolType::GeminiCli => "gemini-cli",
            CliToolType::Opencode => "opencode",
            CliToolType::Aider => "aider",
        }
    }

    pub fn default_protocol(&self) -> &'static str {
        match self {
            CliToolType::ClaudeCode => "claude",
            CliToolType::Codex | CliToolType::Opencode | CliToolType::Aider => "openai-chat",
            CliToolType::GeminiCli => "gemini",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CliToolConfig {
    pub id: String,
    #[serde(rename = "type")]
    pub tool_type: CliToolType,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub api_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub port: u16,
    #[serde(default)]
    pub custom_args: String,
    #[serde(default)]
    pub protocol: String,
    #[serde(default)]
    pub base_path: String,
}

impl CliToolConfig {
    pub fn effective_protocol(&self) -> &str {
        let p = self.protocol.trim();
        if p.is_empty() {
            self.tool_type.default_protocol()
        } else {
            p
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct CliProxyConfig {
    #[serde(default)]
    pub tools: Vec<CliToolConfig>,
}

#[derive(Debug, Serialize, Clone)]
pub struct CliProxyStatus {
    pub running: bool,
    pub port: u16,
    pub tool_count: usize,
    pub running_tools: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct CliProxyTestResult {
    pub ok: bool,
    pub status: Option<u16>,
    pub message: String,
}

pub(crate) struct ToolRuntimeState {
    pub(crate) running: bool,
    pub(crate) shutdown: Option<oneshot::Sender<()>>,
}

pub struct CliProxyManager {
    pub(crate) runtimes: RwLock<HashMap<String, ToolRuntimeState>>,
    pub(crate) config: RwLock<CliProxyConfig>,
}

impl Default for CliProxyManager {
    fn default() -> Self {
        Self {
            runtimes: RwLock::new(HashMap::new()),
            config: RwLock::new(CliProxyConfig::default()),
        }
    }
}

pub(crate) struct CliGatewayState {
    pub(crate) client: reqwest::Client,
    pub(crate) tool_config: CliToolConfig,
    pub(crate) port: u16,
}
