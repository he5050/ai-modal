use serde::{Deserialize, Serialize};
use std::sync::RwLock;
use tokio::sync::oneshot;

pub const DEFAULT_PORT: u16 = 5678;
pub const CLAUDE_CONFIG_ID: &str = "a0a0a0a0-b1b1-4c2c-9d3d-e4e4e4e4e4e4";
pub const DEFAULT_CLAUDE_SLOTS: &[&str] = &[
    "anthropic/claude-opus-current",
    "anthropic/claude-sonnet-current",
    "anthropic/claude-haiku-current",
    "anthropic/claude-opus-4-1",
    "anthropic/claude-opus-4",
    "anthropic/claude-sonnet-4",
    "anthropic/claude-sonnet-3-7",
    "anthropic/claude-haiku-3-5",
];

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ModelMappingConfig {
    #[serde(default)]
    pub providers: Vec<ModelMappingProvider>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ModelMappingProvider {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub target_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub models: Vec<ModelMappingEntry>,
    #[serde(default)]
    pub thinking_effort: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ModelMappingEntry {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub slot: String,
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelMappingLogEntry {
    pub time: String,
    pub model: String,
    pub target_model: String,
    pub status: u16,
    #[serde(default)]
    pub thinking: String,
    #[serde(default)]
    pub source_protocol: String,
    #[serde(default)]
    pub target_protocol: String,
    #[serde(default)]
    pub request_url: String,
    #[serde(default)]
    pub request_method: String,
    #[serde(default)]
    pub request_body: String,
    #[serde(default)]
    pub response_body: String,
    #[serde(default)]
    pub converted_response_body: String,
    #[serde(default)]
    pub error_message: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ModelMappingFlatEntry {
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

#[derive(Debug, Serialize, Clone)]
pub struct ModelMappingStatus {
    pub running: bool,
    pub autostart: bool,
    pub port: u16,
    pub config_path: String,
    pub claude_dir: Option<String>,
    pub model_count: usize,
    pub mapped_models: Vec<ModelMappingFlatEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelMappingSettings {
    pub port: u16,
}

impl Default for ModelMappingSettings {
    fn default() -> Self {
        Self { port: DEFAULT_PORT }
    }
}

#[derive(Default)]
pub(crate) struct RuntimeState {
    pub(crate) running: bool,
    pub(crate) shutdown: Option<oneshot::Sender<()>>,
}

#[derive(Default)]
pub struct ModelMappingManager {
    pub(crate) runtime: RwLock<RuntimeState>,
    pub(crate) config: RwLock<ModelMappingConfig>,
    pub(crate) logs: RwLock<Vec<ModelMappingLogEntry>>,
}

pub(crate) struct GatewayState {
    pub(crate) client: reqwest::Client,
    pub(crate) manager: std::sync::Arc<ModelMappingManager>,
    pub(crate) port: u16,
}

#[derive(Debug)]
pub(crate) struct ResolvedModel {
    pub(crate) requested_model: String,
    pub(crate) target_model: String,
    pub(crate) target_url: String,
    pub(crate) api_key: String,
    pub(crate) thinking_effort: String,
    pub(crate) protocol: MappingProtocol,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MappingProtocol {
    Claude,
    OpenAiChat,
    OpenAiResponses,
    OpenRouter,
    Gemini,
}

#[derive(Debug, Deserialize)]
pub struct ModelMappingTestRequest {
    pub target_url: String,
    pub api_key: String,
    pub model: String,
    #[serde(default)]
    pub protocol: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ModelMappingTestResult {
    pub ok: bool,
    pub status: Option<u16>,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AutostartRequest {
    pub(crate) enabled: bool,
}
