use axum::{
    body::Body,
    extract::State,
    http::{Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{Arc, RwLock},
};
use tokio::{net::TcpListener, sync::oneshot};

const DEFAULT_PORT: u16 = 5678;
const CLAUDE_CONFIG_ID: &str = "a0a0a0a0-b1b1-4c2c-9d3d-e4e4e4e4e4e4";

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
struct RuntimeState {
    running: bool,
    shutdown: Option<oneshot::Sender<()>>,
}

#[derive(Default)]
pub struct ModelMappingManager {
    runtime: RwLock<RuntimeState>,
    config: RwLock<ModelMappingConfig>,
    logs: RwLock<Vec<ModelMappingLogEntry>>,
}

struct GatewayState {
    client: Client,
    manager: Arc<ModelMappingManager>,
    port: u16,
}

#[derive(Debug)]
struct ResolvedModel {
    requested_model: String,
    target_model: String,
    target_url: String,
    api_key: String,
    thinking_effort: String,
    protocol: MappingProtocol,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MappingProtocol {
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
struct AutostartRequest {
    enabled: bool,
}

pub fn config_dir() -> PathBuf {
    home_dir().join(".claude-model-proxy")
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn load_config_file() -> ModelMappingConfig {
    let path = config_path();
    if !path.exists() {
        return ModelMappingConfig::default();
    }
    let data = std::fs::read_to_string(path).unwrap_or_default();
    serde_json::from_str(&data).unwrap_or_default()
}

fn normalize_port(port: u16) -> Result<u16, String> {
    if port == 0 {
        Err("端口必须在 1 - 65535 之间。".to_string())
    } else {
        Ok(port)
    }
}

fn load_settings_file() -> ModelMappingSettings {
    let path = settings_path();
    if !path.exists() {
        return ModelMappingSettings::default();
    }
    let data = std::fs::read_to_string(path).unwrap_or_default();
    let settings = serde_json::from_str::<ModelMappingSettings>(&data).unwrap_or_default();
    normalize_port(settings.port)
        .map(|port| ModelMappingSettings { port })
        .unwrap_or_default()
}

fn write_with_retry(path: &PathBuf, data: &str) -> Result<(), String> {
    for attempt in 0..3 {
        match std::fs::write(path, data) {
            Ok(()) => return Ok(()),
            Err(err)
                if (err.raw_os_error() == Some(32) || err.raw_os_error() == Some(33))
                    && attempt < 2 =>
            {
                std::thread::sleep(std::time::Duration::from_millis(800));
            }
            Err(err) => return Err(format!("写入失败 {}: {}", path.display(), err)),
        }
    }
    Err(format!("写入失败 {}", path.display()))
}

fn save_config_file(config: &ModelMappingConfig) -> Result<(), String> {
    let dir = config_dir();
    std::fs::create_dir_all(&dir).map_err(|err| format!("无法创建目录 {}: {}", dir.display(), err))?;
    let data = serde_json::to_string_pretty(config).map_err(|err| err.to_string())?;
    let target = config_path();
    let tmp = target.with_extension("json.tmp");
    write_with_retry(&tmp, &data)?;
    std::fs::rename(&tmp, &target).map_err(|err| format!("无法更新 {}: {}", target.display(), err))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn save_settings_file(settings: &ModelMappingSettings) -> Result<(), String> {
    normalize_port(settings.port)?;
    let dir = config_dir();
    std::fs::create_dir_all(&dir).map_err(|err| format!("无法创建目录 {}: {}", dir.display(), err))?;
    let data = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    let target = settings_path();
    let tmp = target.with_extension("json.tmp");
    write_with_retry(&tmp, &data)?;
    std::fs::rename(&tmp, &target).map_err(|err| format!("无法更新 {}: {}", target.display(), err))
}

fn current_port() -> u16 {
    load_settings_file().port
}

fn sanitize_model_name(name: &str) -> String {
    let safe: String = name
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let collapsed = safe
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if collapsed.is_empty() {
        "provider".to_string()
    } else {
        collapsed
    }
}

fn make_model_display_name(provider_name: &str, model_name: &str) -> String {
    let provider = provider_name.trim();
    let model = model_name.trim();
    if provider.is_empty() {
        if model.is_empty() {
            "provider".to_string()
        } else {
            model.to_string()
        }
    } else if model.is_empty() {
        provider.to_string()
    } else {
        format!("{}-{}", provider, model)
    }
}

pub fn make_slot(provider_name: &str, order: usize) -> String {
    format!(
        "anthropic/claude-claude-{}-{}",
        sanitize_model_name(provider_name),
        order
    )
}

fn legacy_slot(name: &str) -> String {
    let safe = sanitize_model_name(name);
    format!("claude-{}", safe)
}

fn is_auto_generated_slot(slot: &str, name: &str) -> bool {
    let safe_name = sanitize_model_name(name);
    let lower = slot.trim().to_ascii_lowercase();
    (lower.starts_with("anthropic/claude-claude-")
        && lower
            .trim_start_matches("anthropic/claude-claude-")
            .rsplit('-')
            .next()
            .map(|tail| !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit()))
            .unwrap_or(false))
        || (lower.starts_with("claude-claude-")
            && lower
                .trim_start_matches("claude-claude-")
                .rsplit('-')
                .next()
                .map(|tail| !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit()))
                .unwrap_or(false))
        || lower == format!("anthropic/claude-{}", safe_name)
        || lower == format!("claude-{}", safe_name)
        || lower == format!("anthropic/claude-claude-{}", safe_name)
        || lower == format!("claude-claude-{}", safe_name)
}

fn normalize_slot(slot: &str, name: &str, provider_name: &str, order: usize) -> String {
    let trimmed = slot.trim();
    if trimmed.is_empty() || is_auto_generated_slot(trimmed, name) {
        return make_slot(provider_name, order);
    }
    let normalized = trimmed
        .strip_prefix("anthropic/")
        .or_else(|| trimmed.strip_prefix("Anthropic/"))
        .unwrap_or(trimmed);
    let safe: String = normalized
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect();
    if safe.starts_with("claude-") {
        format!("anthropic/{}", safe)
    } else {
        format!("anthropic/claude-claude-{}", safe)
    }
}

fn effective_slot(model: &ModelMappingEntry) -> String {
    model.slot.trim().to_string()
}

fn effective_display_name(model: &ModelMappingEntry, provider_name: &str) -> String {
    let trimmed = model.display_name.trim();
    if trimmed.is_empty() {
        make_model_display_name(provider_name, model.name.trim())
    } else {
        trimmed.to_string()
    }
}

fn normalize_config(config: ModelMappingConfig) -> ModelMappingConfig {
    ModelMappingConfig {
        providers: config
            .providers
            .into_iter()
            .map(|provider| {
                let provider_label = if provider.name.trim().is_empty() {
                    provider.id.as_deref().unwrap_or("provider").to_string()
                } else {
                    provider.name.clone()
                };
                let target_url = provider.target_url.clone();
                ModelMappingProvider {
                models: provider
                    .models
                    .into_iter()
                    .enumerate()
                    .map(|(index, model)| {
                        let supported_protocols = normalize_supported_protocols(&model, &target_url);
                        let target_protocol = resolve_target_protocol(&model);
                        let source_protocol = resolve_source_protocol(&model, &target_url, &target_protocol);
                        let normalized_slot = normalize_slot(
                            &model.slot,
                            model.name.trim(),
                            &provider_label,
                            index + 1,
                        );
                        ModelMappingEntry {
                            slot: normalized_slot,
                            display_name: effective_display_name(&model, &provider_label),
                            supported_protocols,
                            source_protocol,
                            target_protocol,
                            ..model
                        }
                    })
                    .collect(),
                ..provider
            }
            })
            .collect(),
    }
}

fn protocol_to_string(protocol: MappingProtocol) -> String {
    match protocol {
        MappingProtocol::Claude => "claude",
        MappingProtocol::OpenAiChat => "openai-chat",
        MappingProtocol::OpenAiResponses => "openai-responses",
        MappingProtocol::OpenRouter => "openrouter",
        MappingProtocol::Gemini => "gemini",
    }
    .to_string()
}

fn normalize_protocol_value(protocol: &str) -> Option<String> {
    let normalized = protocol.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "" => None,
        "claude" | "anthropic" => Some("claude".to_string()),
        "openapi" | "openai" | "openai-chat" | "open-ai-chat" | "chat" => {
            Some("openai-chat".to_string())
        }
        "openai-responses" | "open-ai-responses" | "responses" => {
            Some("openai-responses".to_string())
        }
        "openrouter" => Some("openrouter".to_string()),
        "gemini" => Some("gemini".to_string()),
        other => Some(other.to_string()),
    }
}

fn normalize_supported_protocols(entry: &ModelMappingEntry, target_url: &str) -> Vec<String> {
    let mut result = Vec::new();
    for value in &entry.supported_protocols {
        if let Some(normalized) = normalize_protocol_value(value) {
            if !result.contains(&normalized) {
                result.push(normalized);
            }
        }
    }
    if result.is_empty() {
        if let Some(explicit) = normalize_protocol_value(&entry.source_protocol)
            .or_else(|| normalize_protocol_value(&entry.protocol))
        {
            result.push(explicit);
        }
    }
    if result.is_empty() {
        result.push(protocol_to_string(infer_mapping_protocol(target_url, &entry.name)));
    }
    result
}

fn resolve_source_protocol(entry: &ModelMappingEntry, target_url: &str, target_protocol: &str) -> String {
    let supported = normalize_supported_protocols(entry, target_url);
    if let Some(explicit) = normalize_protocol_value(&entry.source_protocol)
        .or_else(|| normalize_protocol_value(&entry.protocol))
    {
        if supported.contains(&explicit) || supported.is_empty() {
            return explicit;
        }
    }
    if supported.iter().any(|protocol| protocol == target_protocol) {
        return target_protocol.to_string();
    }
    if supported.iter().any(|protocol| protocol == "claude") {
        return "claude".to_string();
    }
    supported
        .first()
        .cloned()
        .unwrap_or_else(|| protocol_to_string(infer_mapping_protocol(target_url, &entry.name)))
}

fn resolve_target_protocol(entry: &ModelMappingEntry) -> String {
    match normalize_protocol_value(&entry.target_protocol).as_deref() {
        Some("claude" | "openai-chat" | "openai-responses" | "gemini") => {
            normalize_protocol_value(&entry.target_protocol).unwrap()
        }
        _ => "claude".to_string(),
    }
}

fn resolve_effective_upstream_protocol(entry: &ModelMappingEntry, target_url: &str) -> String {
    let supported = normalize_supported_protocols(entry, target_url);
    let target = resolve_target_protocol(entry);
    if supported.contains(&target) {
        return target;
    }
    resolve_source_protocol(entry, target_url, &target)
}

fn parse_mapping_protocol(protocol: &str, target_url: &str, model: &str) -> MappingProtocol {
    let normalized = protocol.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return MappingProtocol::Claude;
    }
    match normalized.as_str() {
        "claude" | "anthropic" => MappingProtocol::Claude,
        "openapi" | "openai" | "openai-chat" | "open-ai-chat" | "chat" => {
            MappingProtocol::OpenAiChat
        }
        "openai-responses" | "open-ai-responses" | "responses" => MappingProtocol::OpenAiResponses,
        "openrouter" => MappingProtocol::OpenRouter,
        "gemini" => MappingProtocol::Gemini,
        _ => infer_mapping_protocol(target_url, model),
    }
}

fn infer_mapping_protocol(target_url: &str, _model: &str) -> MappingProtocol {
    let url = target_url.trim().to_ascii_lowercase();
    if url.contains("openrouter.ai") {
        MappingProtocol::OpenRouter
    } else if url.contains("anthropic") || url.contains("claude") {
        MappingProtocol::Claude
    } else if url.contains("generativelanguage.googleapis.com") || url.contains("gemini") {
        MappingProtocol::Gemini
    } else {
        MappingProtocol::OpenAiChat
    }
}

fn flatten_config(config: &ModelMappingConfig) -> Vec<ModelMappingFlatEntry> {
    let normalized = normalize_config(config.clone());
    let mut result = Vec::new();
    for provider in &normalized.providers {
        for model in &provider.models {
            if !model.enabled
                || model.name.trim().is_empty()
                || model.target_protocol.trim() != "claude"
            {
                continue;
            }
            result.push(ModelMappingFlatEntry {
                slot: effective_slot(model),
                name: model.name.trim().to_string(),
                display_name: effective_display_name(model, &provider.name),
                supported_protocols: model.supported_protocols.clone(),
                source_protocol: model.source_protocol.clone(),
                target_protocol: model.target_protocol.clone(),
                provider_name: provider.name.clone(),
                target_url: provider.target_url.clone(),
                supports_1m: !model.to_1m.trim().is_empty(),
                thinking_effort: provider.thinking_effort.clone(),
                protocol: protocol_to_string(parse_mapping_protocol(
                    &resolve_effective_upstream_protocol(model, &provider.target_url),
                    &provider.target_url,
                    &model.name,
                )),
            });
        }
    }
    result
}

fn validate_config(config: &ModelMappingConfig) -> Result<(), String> {
    if config.providers.is_empty() {
        return Err("请至少添加一个服务商。".to_string());
    }
    for (index, provider) in config.providers.iter().enumerate() {
        if provider.target_url.trim().is_empty() {
            return Err(format!("第 {} 个服务商缺少 API 地址。", index + 1));
        }
        if !provider.target_url.starts_with("http://") && !provider.target_url.starts_with("https://") {
            return Err(format!("第 {} 个服务商 API 地址必须以 http:// 或 https:// 开头。", index + 1));
        }
        if provider.api_key.trim().is_empty() {
            return Err(format!("第 {} 个服务商缺少 API Key。", index + 1));
        }
        if provider.models.is_empty() {
            return Err(format!("第 {} 个服务商缺少模型。", index + 1));
        }
        for model in &provider.models {
            if model.name.trim().is_empty() {
                return Err(format!("第 {} 个服务商存在空模型名。", index + 1));
            }
        }
    }
    Ok(())
}

fn claude_3p_dir() -> Option<PathBuf> {
    let home = home_dir();

    #[cfg(target_os = "macos")]
    let dir = home.join("Library/Application Support/Claude-3p");

    #[cfg(target_os = "windows")]
    let dir = {
        let localappdata = std::env::var("LOCALAPPDATA")
            .ok()
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData/Local"));
        let packages = localappdata.join("Packages");
        let store_dir = std::fs::read_dir(&packages)
            .ok()
            .and_then(|entries| {
                entries.flatten().find_map(|entry| {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with("Claude_") || name.starts_with("Claude_pzs8sxrjxfjjc") {
                        Some(entry.path().join("LocalCache/Roaming/Claude-3p"))
                    } else {
                        None
                    }
                })
            });
        store_dir.unwrap_or_else(|| {
            let appdata = std::env::var("APPDATA")
                .ok()
                .map(PathBuf::from)
                .unwrap_or_else(|| home.join("AppData/Roaming"));
            appdata.join("Claude-3p")
        })
    };

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let dir = home.join(".config/Claude-3p");

    Some(dir)
}

fn windows_claude_fallback_dirs(primary_3p: &PathBuf) -> Vec<(PathBuf, PathBuf)> {
    #[cfg(target_os = "windows")]
    {
        let appdata = PathBuf::from(std::env::var("APPDATA").unwrap_or_default());
        let localappdata = PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default());
        let candidates = [
            (appdata.join("Claude-3p"), appdata.join("Claude")),
            (localappdata.join("Claude-3p"), localappdata.join("Claude")),
        ];
        candidates
            .into_iter()
            .filter(|(three_p, _)| three_p != primary_3p)
            .collect()
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = primary_3p;
        Vec::new()
    }
}

fn write_json_atomic(path: &PathBuf, value: &serde_json::Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("无法创建目录 {}: {}", parent.display(), err))?;
    }
    let data = serde_json::to_string_pretty(value).map_err(|err| err.to_string())?;
    let tmp = path.with_extension("json.tmp");
    write_with_retry(&tmp, &data)?;
    std::fs::rename(&tmp, path).map_err(|err| format!("无法更新 {}: {}", path.display(), err))
}

fn write_claude_gateway_config(config: &ModelMappingConfig, validate: bool) -> Result<String, String> {
    if validate {
        validate_config(config)?;
    }
    let port = current_port();
    let claude_dir = claude_3p_dir().ok_or_else(|| "无法定位 Claude-3p 目录。".to_string())?;
    let config_lib = claude_dir.join("configLibrary");
    std::fs::create_dir_all(&config_lib)
        .map_err(|err| format!("无法创建目录 {}: {}", config_lib.display(), err))?;

    let flat = flatten_config(config);
    let models: Vec<serde_json::Value> = flat
        .iter()
        .map(|entry| {
            serde_json::json!({
                "name": entry.slot,
                "supports1m": entry.supports_1m
            })
        })
        .collect();

    let meta_path = config_lib.join("_meta.json");
    let mut meta = read_json_or_empty(&meta_path);
    let applied_id = meta
        .get("appliedId")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let target_id = if !applied_id.is_empty() && config_lib.join(format!("{}.json", applied_id)).exists() {
        applied_id
    } else {
        CLAUDE_CONFIG_ID.to_string()
    };

    let config_file = config_lib.join(format!("{}.json", target_id));
    let mut gateway = read_json_or_empty(&config_file);
    gateway["coworkEgressAllowedHosts"] = serde_json::json!(["*"]);
    gateway["inferenceProvider"] = serde_json::json!("gateway");
    gateway["inferenceGatewayBaseUrl"] = serde_json::json!(format!("http://127.0.0.1:{}", port));
    gateway["inferenceGatewayApiKey"] = serde_json::json!("proxy");
    gateway["inferenceGatewayAuthScheme"] = serde_json::json!("bearer");
    gateway["inferenceModels"] = serde_json::json!(models);
    write_json_atomic(&config_file, &gateway)?;

    if target_id == CLAUDE_CONFIG_ID {
        meta["appliedId"] = serde_json::json!(CLAUDE_CONFIG_ID);
        let entries = meta
            .get("entries")
            .and_then(|value| value.as_array())
            .cloned()
            .unwrap_or_default();
        let mut next_entries: Vec<serde_json::Value> = entries
            .into_iter()
            .filter(|entry| {
                entry
                    .get("id")
                    .and_then(|value| value.as_str())
                    .map(|id| id == CLAUDE_CONFIG_ID || config_lib.join(format!("{}.json", id)).exists())
                    .unwrap_or(false)
            })
            .collect();
        if !next_entries
            .iter()
            .any(|entry| entry.get("id").and_then(|value| value.as_str()) == Some(CLAUDE_CONFIG_ID))
        {
            next_entries.push(serde_json::json!({"id": CLAUDE_CONFIG_ID, "name": "AIModal Model Mapping"}));
        }
        meta["entries"] = serde_json::json!(next_entries);
        write_json_atomic(&meta_path, &meta)?;
    }

    let desktop_config_path = claude_dir.join("claude_desktop_config.json");
    let mut desktop_config = read_json_or_empty(&desktop_config_path);
    desktop_config["deploymentMode"] = serde_json::json!("3p");
    write_json_atomic(&desktop_config_path, &desktop_config)?;

    for (three_p_dir, claude_normal_dir) in windows_claude_fallback_dirs(&claude_dir) {
        let _ = write_deployment_mode(&three_p_dir.join("claude_desktop_config.json"));
        let _ = write_deployment_mode(&claude_normal_dir.join("claude_desktop_config.json"));
        let normal_dev = claude_normal_dir.join("developer_settings.json");
        if !normal_dev.exists() {
            let _ = write_json_atomic(&normal_dev, &serde_json::json!({"allowDevTools": true}));
        }
        let three_p_dev = three_p_dir.join("developer_settings.json");
        if !three_p_dev.exists() {
            let _ = write_json_atomic(&three_p_dev, &serde_json::json!({"allowDevTools": true}));
        }
    }

    Ok(format!("已写入 {}", config_file.display()))
}

fn apply_to_claude_desktop(config: &ModelMappingConfig) -> Result<String, String> {
    write_claude_gateway_config(config, true)
}

fn write_deployment_mode(path: &PathBuf) -> Result<(), String> {
    let mut config = read_json_or_empty(path);
    config["deploymentMode"] = serde_json::json!("3p");
    write_json_atomic(path, &config)
}

pub fn ensure_model_mapping_claude_gateway() {
    let config = load_config_file();
    if let Err(err) = write_claude_gateway_config(&config, false) {
        eprintln!("[model-mapping] auto gateway config failed: {}", err);
    }
}

fn read_json_or_empty(path: &PathBuf) -> serde_json::Value {
    if !path.exists() {
        return serde_json::json!({});
    }
    std::fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

fn resolve_model(model: &str, config: &ModelMappingConfig) -> Result<ResolvedModel, String> {
    let (base_model, wants_1m) = model
        .strip_suffix("[1m]")
        .map(|base| (base, true))
        .unwrap_or((model, false));

    for provider in &config.providers {
        for entry in &provider.models {
            if !entry.enabled || entry.target_protocol.trim() != "claude" {
                continue;
            }
            if base_model == effective_slot(entry) || base_model == legacy_slot(entry.name.trim()) {
                let target_model = if wants_1m && !entry.to_1m.trim().is_empty() {
                    format!("{}[1m]", entry.name.trim())
                } else {
                    entry.name.trim().to_string()
                };
                return Ok(ResolvedModel {
                    requested_model: model.to_string(),
                    target_model,
                    target_url: provider.target_url.clone(),
                    api_key: provider.api_key.clone(),
                    thinking_effort: provider.thinking_effort.clone(),
                    protocol: parse_mapping_protocol(
                        &resolve_effective_upstream_protocol(entry, &provider.target_url),
                        &provider.target_url,
                        &entry.name,
                    ),
                });
            }
        }
    }

    Err(format!(
        "未命中模型映射槽位：{}。请确认该槽位已启用，并重新保存/应用到 Claude。",
        model
    ))
}

fn now_time() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let local = secs + 8 * 3600;
    let h = (local % 86400) / 3600;
    let m = (local % 3600) / 60;
    let s = local % 60;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

fn push_log(manager: &ModelMappingManager, entry: ModelMappingLogEntry) {
    let mut logs = manager.logs.write().unwrap_or_else(|err| err.into_inner());
    logs.insert(0, entry);
    logs.truncate(50);
}

fn stringify_json_pretty(value: &serde_json::Value) -> String {
    serde_json::to_string_pretty(value)
        .unwrap_or_else(|_| serde_json::to_string(value).unwrap_or_default())
}

async fn gateway_models_handler(State(state): State<Arc<GatewayState>>) -> Json<serde_json::Value> {
    let config = state.manager.config.read().unwrap_or_else(|err| err.into_inner()).clone();
    let models: Vec<serde_json::Value> = flatten_config(&config)
        .iter()
        .flat_map(|entry| {
            let mut values = vec![serde_json::json!({
                "id": entry.slot,
                "display_name": entry.display_name,
                "created": 0
            })];
            if entry.supports_1m {
                values.push(serde_json::json!({
                    "id": format!("{}[1m]", entry.slot),
                    "display_name": format!("{} (1M)", entry.display_name),
                    "created": 0
                }));
            }
            values
        })
        .collect();
    Json(serde_json::json!({ "data": models }))
}

async fn gateway_proxy_handler(
    State(state): State<Arc<GatewayState>>,
    req: axum::http::Request<Body>,
) -> axum::response::Response {
    let (parts, body) = req.into_parts();
    if parts.method != Method::POST {
        return (StatusCode::NOT_FOUND, "Not Found").into_response();
    }

    let body_bytes = match axum::body::to_bytes(body, 10 * 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(err) => return (StatusCode::BAD_REQUEST, err.to_string()).into_response(),
    };
    let mut data: serde_json::Value = match serde_json::from_slice(&body_bytes) {
        Ok(value) => value,
        Err(err) => return (StatusCode::BAD_REQUEST, err.to_string()).into_response(),
    };

    let config = state.manager.config.read().unwrap_or_else(|err| err.into_inner()).clone();
    let requested = data
        .get("model")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();
    let resolved = match resolve_model(&requested, &config) {
        Ok(value) => value,
        Err(err) => {
            push_log(
                &state.manager,
                ModelMappingLogEntry {
                    time: now_time(),
                    model: requested.clone(),
                    target_model: String::new(),
                    status: 502,
                    thinking: String::new(),
                    source_protocol: String::new(),
                    target_protocol: "claude".to_string(),
                    request_url: parts.uri.path().to_string(),
                    request_method: "POST".to_string(),
                    request_body: String::from_utf8_lossy(&body_bytes).into_owned(),
                    response_body: String::new(),
                    converted_response_body: String::new(),
                    error_message: err.clone(),
                },
            );
            return (StatusCode::BAD_GATEWAY, err).into_response();
        }
    };
    data["model"] = serde_json::json!(resolved.target_model);

    let thinking = apply_thinking_effort(&mut data, &resolved.thinking_effort);
    let wants_stream = data
        .get("stream")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let request_path = parts.uri.path().to_string();
    let source_protocol = protocol_to_string(resolved.protocol);
    let target_protocol = "claude".to_string();
    let (request_url, upstream_body) = match resolved.protocol {
        MappingProtocol::Claude => (
            build_anthropic_messages_url(&resolved.target_url, &request_path),
            data.clone(),
        ),
        MappingProtocol::OpenAiChat | MappingProtocol::OpenRouter => (
            build_openai_chat_url(&resolved.target_url),
            anthropic_to_openai_chat_request(&data),
        ),
        MappingProtocol::OpenAiResponses => (
            build_openai_responses_url(&resolved.target_url),
            anthropic_to_openai_responses_request(&data),
        ),
        MappingProtocol::Gemini => (
            format!(
                "{}/v1beta/{}:generateContent",
                normalize_gemini_base(&resolved.target_url),
                normalize_gemini_model_path(&resolved.target_model)
            ),
            anthropic_to_gemini_request(&data),
        ),
    };
    let request_body = stringify_json_pretty(&upstream_body);
    let response = match resolved.protocol {
        MappingProtocol::Claude => {
            let mut request = state
                .client
                .post(&request_url)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", resolved.api_key))
                .header(
                    "anthropic-version",
                    parts
                        .headers
                        .get("anthropic-version")
                        .and_then(|value| value.to_str().ok())
                        .unwrap_or("2023-06-01"),
                );

            for header in ["anthropic-beta", "x-api-key", "user-agent"] {
                if let Some(value) = parts.headers.get(header) {
                    request = request.header(header, value);
                }
            }
            request.json(&upstream_body).send().await
        }
        MappingProtocol::OpenAiChat | MappingProtocol::OpenRouter => {
            let request = state
                .client
                .post(&request_url)
                .header("content-type", "application/json")
                .bearer_auth(&resolved.api_key)
                .json(&upstream_body);
            let request = if resolved.protocol == MappingProtocol::OpenRouter {
                request.header("X-Title", "AIModal")
            } else {
                request
            };
            request.send().await
        }
        MappingProtocol::OpenAiResponses => {
            state
                .client
                .post(&request_url)
                .header("content-type", "application/json")
                .bearer_auth(&resolved.api_key)
                .json(&upstream_body)
                .send()
                .await
        }
        MappingProtocol::Gemini => {
            state
                .client
                .post(&request_url)
                .header("content-type", "application/json")
                .header("x-goog-api-key", &resolved.api_key)
                .json(&upstream_body)
                .send()
                .await
        }
    };
    match response {
        Ok(resp) => {
            let status = resp.status();
            let headers = resp.headers().clone();
            if resolved.protocol == MappingProtocol::Claude || !status.is_success() {
                let body_bytes = resp.bytes().await.unwrap_or_default();
                let response_body = String::from_utf8_lossy(&body_bytes).into_owned();
                push_log(
                    &state.manager,
                    ModelMappingLogEntry {
                        time: now_time(),
                        model: resolved.requested_model.clone(),
                        target_model: resolved.target_model.clone(),
                        status: status.as_u16(),
                        thinking,
                        source_protocol: source_protocol.clone(),
                        target_protocol: target_protocol.clone(),
                        request_url: request_url.clone(),
                        request_method: "POST".to_string(),
                        request_body: request_body.clone(),
                        response_body: response_body.clone(),
                        converted_response_body: String::new(),
                        error_message: if status.is_success() {
                            String::new()
                        } else {
                            extract_mapping_error_message(&response_body)
                                .unwrap_or_else(|| format!("HTTP {}", status.as_u16()))
                        },
                    },
                );
                let mut builder = axum::http::Response::builder().status(status);
                for (name, value) in headers.iter() {
                    let name_text = name.as_str().to_ascii_lowercase();
                    if name_text != "transfer-encoding" && name_text != "connection" {
                        builder = builder.header(name, value);
                    }
                }
                builder
                    .body(Body::from(body_bytes))
                    .unwrap_or_else(|_| (StatusCode::BAD_GATEWAY, "Invalid upstream response").into_response())
            } else {
                let raw_text = resp.text().await.unwrap_or_default();
                match openai_response_to_anthropic_message(
                    resolved.protocol,
                    &resolved.target_model,
                    &raw_text,
                ) {
                    Ok(value) => {
                        let converted_response_body = stringify_json_pretty(&value);
                        push_log(
                            &state.manager,
                            ModelMappingLogEntry {
                                time: now_time(),
                                model: resolved.requested_model.clone(),
                                target_model: resolved.target_model.clone(),
                                status: status.as_u16(),
                                thinking,
                                source_protocol: source_protocol.clone(),
                                target_protocol: target_protocol.clone(),
                                request_url: request_url.clone(),
                                request_method: "POST".to_string(),
                                request_body: request_body.clone(),
                                response_body: raw_text.clone(),
                                converted_response_body,
                                error_message: String::new(),
                            },
                        );
                        if wants_stream {
                            anthropic_message_to_sse_response(value)
                        } else {
                            Json(value).into_response()
                        }
                    }
                    Err(err) => {
                        push_log(
                            &state.manager,
                            ModelMappingLogEntry {
                                time: now_time(),
                                model: resolved.requested_model.clone(),
                                target_model: resolved.target_model.clone(),
                                status: 502,
                                thinking,
                                source_protocol: source_protocol.clone(),
                                target_protocol: target_protocol.clone(),
                                request_url: request_url.clone(),
                                request_method: "POST".to_string(),
                                request_body: request_body.clone(),
                                response_body: raw_text,
                                converted_response_body: String::new(),
                                error_message: err.clone(),
                            },
                        );
                        (StatusCode::BAD_GATEWAY, err).into_response()
                    }
                }
            }
        }
        Err(err) => {
            push_log(
                &state.manager,
                ModelMappingLogEntry {
                    time: now_time(),
                    model: resolved.requested_model,
                    target_model: resolved.target_model,
                    status: 502,
                    thinking,
                    source_protocol,
                    target_protocol,
                    request_url,
                    request_method: "POST".to_string(),
                    request_body,
                    response_body: String::new(),
                    converted_response_body: String::new(),
                    error_message: err.to_string(),
                },
            );
            (StatusCode::BAD_GATEWAY, err.to_string()).into_response()
        }
    }
}

fn apply_thinking_effort(data: &mut serde_json::Value, effort: &str) -> String {
    match effort {
        "off" => {
            data["thinking"] = serde_json::json!({"type": "disabled"});
            if let Some(object) = data.as_object_mut() {
                object.remove("output_config");
            }
            "off".to_string()
        }
        "high" | "max" => {
            data["thinking"] = serde_json::json!({"type": "enabled", "budget_tokens": 8192});
            data["output_config"] = serde_json::json!({"effort": effort});
            effort.to_string()
        }
        _ => String::new(),
    }
}

async fn api_get_config_handler(State(state): State<Arc<GatewayState>>) -> Json<ModelMappingConfig> {
    Json(state.manager.config.read().unwrap_or_else(|err| err.into_inner()).clone())
}

async fn api_save_config_handler(
    State(state): State<Arc<GatewayState>>,
    Json(config): Json<ModelMappingConfig>,
) -> Json<serde_json::Value> {
    match save_config_file(&config) {
        Ok(()) => {
            *state.manager.config.write().unwrap_or_else(|err| err.into_inner()) = config;
            Json(serde_json::json!({ "ok": true }))
        }
        Err(err) => Json(serde_json::json!({ "ok": false, "message": err })),
    }
}

async fn api_test_handler(Json(request): Json<ModelMappingTestRequest>) -> Json<serde_json::Value> {
    match test_model_mapping_provider(request).await {
        Ok(result) => Json(serde_json::json!({
            "ok": result.ok,
            "message": result.message,
            "status": result.status
        })),
        Err(err) => Json(serde_json::json!({ "ok": false, "message": err })),
    }
}

async fn api_apply_handler(State(state): State<Arc<GatewayState>>) -> Json<serde_json::Value> {
    let config = state.manager.config.read().unwrap_or_else(|err| err.into_inner()).clone();
    match apply_to_claude_desktop(&config) {
        Ok(_) => {
            restart_claude_desktop();
            Json(serde_json::json!({ "ok": true, "message": "Applied! Claude Desktop is restarting..." }))
        }
        Err(err) => Json(serde_json::json!({ "ok": false, "message": err })),
    }
}

async fn api_logs_handler(State(state): State<Arc<GatewayState>>) -> Json<Vec<ModelMappingLogEntry>> {
    Json(state.manager.logs.read().unwrap_or_else(|err| err.into_inner()).clone())
}

async fn api_autostart_get_handler() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "enabled": is_autostart_enabled() }))
}

async fn api_autostart_set_handler(Json(request): Json<AutostartRequest>) -> Json<serde_json::Value> {
    match set_autostart(request.enabled) {
        Ok(()) => Json(serde_json::json!({ "ok": true })),
        Err(err) => Json(serde_json::json!({ "ok": false, "message": err })),
    }
}

async fn gateway_root_handler(State(state): State<Arc<GatewayState>>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "ok": true,
        "name": "AIModal Model Mapping",
        "port": state.port,
    }))
}

fn restart_claude_desktop() {
    std::thread::spawn(|| {
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("osascript")
                .args(["-e", "tell application \"Claude\" to quit"])
                .output();
            for _ in 0..15 {
                std::thread::sleep(std::time::Duration::from_millis(500));
                if let Ok(output) = std::process::Command::new("pgrep").args(["-x", "Claude"]).output() {
                    if output.stdout.is_empty() {
                        break;
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
            let _ = std::process::Command::new("open").args(["-a", "Claude"]).output();
        }

        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("powershell")
                .args([
                    "-WindowStyle",
                    "Hidden",
                    "-Command",
                    r#"
                    $proc = Get-Process -Name 'Claude' -ErrorAction SilentlyContinue | Select-Object -First 1
                    $path = if ($proc) { $proc.Path } else { $null }
                    Stop-Process -Name 'Claude' -Force -ErrorAction SilentlyContinue
                    Start-Sleep -Seconds 3
                    if ($path -like '*WindowsApps*') {
                        $pkg = Get-AppxPackage | Where-Object { $path.StartsWith($_.InstallLocation) } | Select-Object -First 1
                        if ($pkg) { explorer.exe "shell:AppsFolder\$($pkg.PackageFamilyName)!Claude" }
                    } elseif ($path) {
                        Start-Process $path
                    }
                    "#,
                ])
                .output();
        }
    });
}

fn autostart_plist_path() -> PathBuf {
    home_dir().join("Library/LaunchAgents/com.ai-modal.model-mapping.plist")
}

fn is_autostart_enabled() -> bool {
    #[cfg(target_os = "macos")]
    {
        autostart_plist_path().exists()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

fn set_autostart(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let plist_path = autostart_plist_path();
        if enabled {
            let exe = std::env::current_exe().map_err(|err| err.to_string())?;
            let escaped = exe
                .display()
                .to_string()
                .replace('&', "&amp;")
                .replace('<', "&lt;")
                .replace('>', "&gt;")
                .replace('"', "&quot;")
                .replace('\'', "&apos;");
            let content = format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ai-modal.model-mapping</string>
    <key>ProgramArguments</key>
    <array>
        <string>{}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>"#,
                escaped
            );
            if let Some(parent) = plist_path.parent() {
                std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
            }
            std::fs::write(&plist_path, content).map_err(|err| err.to_string())?;
        } else {
            let _ = std::fs::remove_file(&plist_path);
        }
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        if enabled {
            Err("当前只支持 macOS 开机自启。".to_string())
        } else {
            Ok(())
        }
    }
}

async fn run_gateway_until_shutdown(
    manager: Arc<ModelMappingManager>,
    port: u16,
    shutdown: oneshot::Receiver<()>,
) -> Result<(), String> {
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|err| err.to_string())?;
    let state = Arc::new(GatewayState {
        client,
        manager,
        port,
    });
    let app = Router::new()
        .route("/", get(gateway_root_handler))
        .route("/api/config", get(api_get_config_handler).post(api_save_config_handler))
        .route("/api/test", post(api_test_handler))
        .route("/api/apply", post(api_apply_handler))
        .route("/api/logs", get(api_logs_handler))
        .route("/api/autostart", get(api_autostart_get_handler).post(api_autostart_set_handler))
        .route("/v1/models", get(gateway_models_handler))
        .route("/*path", post(gateway_proxy_handler))
        .with_state(state);
    let listener = TcpListener::bind(("127.0.0.1", port))
        .await
        .map_err(|err| format!("无法监听 127.0.0.1:{}: {}", port, err))?;
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = shutdown.await;
        })
        .await
        .map_err(|err| err.to_string())
}

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
    let config = manager.config.read().unwrap_or_else(|err| err.into_inner()).clone();
    if let Err(err) = write_claude_gateway_config(&config, false) {
        eprintln!("[model-mapping] update gateway config after port change failed: {}", err);
    }
    let running = manager.runtime.read().unwrap_or_else(|err| err.into_inner()).running;
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
    *manager.config.write().unwrap_or_else(|err| err.into_inner()) = normalized.clone();
    let running = manager.runtime.read().unwrap_or_else(|err| err.into_inner()).running;
    Ok(build_status(running, Some(normalized)))
}

#[tauri::command]
pub fn apply_model_mapping_to_claude(
    manager: tauri::State<'_, Arc<ModelMappingManager>>,
    config: ModelMappingConfig,
) -> Result<String, String> {
    let normalized = normalize_config(config);
    save_config_file(&normalized)?;
    *manager.config.write().unwrap_or_else(|err| err.into_inner()) = normalized.clone();
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
    *manager.config.write().unwrap_or_else(|err| err.into_inner()) = normalized.clone();
    let shutdown_receiver = {
        let mut runtime = manager.runtime.write().unwrap_or_else(|err| err.into_inner());
        if runtime.running {
            return Ok(build_status(true, Some(normalized)));
        }
        let (shutdown_sender, shutdown_receiver) = oneshot::channel();
        runtime.shutdown = Some(shutdown_sender);
        runtime.running = true;
        shutdown_receiver
    };

    let manager_arc = manager.inner().clone();
    let port = current_port();
    tauri::async_runtime::spawn(async move {
        if let Err(err) = run_gateway_until_shutdown(manager_arc.clone(), port, shutdown_receiver).await {
            eprintln!("[model-mapping] gateway stopped: {}", err);
        }
        let mut runtime = manager_arc.runtime.write().unwrap_or_else(|poisoned| poisoned.into_inner());
        runtime.running = false;
        runtime.shutdown = None;
    });

    Ok(build_status(true, Some(normalized)))
}

#[tauri::command]
pub fn stop_model_mapping_gateway(
    manager: tauri::State<'_, Arc<ModelMappingManager>>,
) -> Result<ModelMappingStatus, String> {
    let mut runtime = manager.runtime.write().unwrap_or_else(|err| err.into_inner());
    if let Some(shutdown) = runtime.shutdown.take() {
        let _ = shutdown.send(());
    }
    runtime.running = false;
    Ok(build_status(false, None))
}

pub fn start_model_mapping_gateway_on_startup(manager: Arc<ModelMappingManager>) {
    let config = normalize_config(load_config_file());
    *manager.config.write().unwrap_or_else(|err| err.into_inner()) = config;
    let port = current_port();
    let shutdown_receiver = {
        let mut runtime = manager.runtime.write().unwrap_or_else(|err| err.into_inner());
        if runtime.running {
            return;
        }
        let (shutdown_sender, shutdown_receiver) = oneshot::channel();
        runtime.shutdown = Some(shutdown_sender);
        runtime.running = true;
        shutdown_receiver
    };
    tauri::async_runtime::spawn(async move {
        if let Err(err) = run_gateway_until_shutdown(manager.clone(), port, shutdown_receiver).await {
            eprintln!("[model-mapping] gateway stopped: {}", err);
        }
        let mut runtime = manager.runtime.write().unwrap_or_else(|poisoned| poisoned.into_inner());
        runtime.running = false;
        runtime.shutdown = None;
    });
}

#[tauri::command]
pub async fn test_model_mapping_provider(
    request: ModelMappingTestRequest,
) -> Result<ModelMappingTestResult, String> {
    if request.target_url.trim().is_empty()
        || request.api_key.trim().is_empty()
        || request.model.trim().is_empty()
    {
        return Ok(ModelMappingTestResult {
            ok: false,
            status: None,
            message: "请填写 API 地址、API Key 和模型名。".to_string(),
        });
    }
    if !request.target_url.starts_with("http://") && !request.target_url.starts_with("https://") {
        return Ok(ModelMappingTestResult {
            ok: false,
            status: None,
            message: "API 地址必须以 http:// 或 https:// 开头。".to_string(),
        });
    }

    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|err| err.to_string())?;
    let protocol = parse_mapping_protocol(
        request.protocol.as_deref().unwrap_or_default(),
        &request.target_url,
        &request.model,
    );

    let (url, body) = build_mapping_test_request(&request, protocol);
    let mut builder = client
        .post(url)
        .header("content-type", "application/json");
    builder = match protocol {
        MappingProtocol::Claude => builder
            .header("authorization", format!("Bearer {}", request.api_key))
            .header("anthropic-version", "2023-06-01"),
        MappingProtocol::OpenAiChat | MappingProtocol::OpenAiResponses => {
            builder.bearer_auth(&request.api_key)
        }
        MappingProtocol::OpenRouter => builder.bearer_auth(&request.api_key).header("X-Title", "AIModal"),
        MappingProtocol::Gemini => builder.header("x-goog-api-key", &request.api_key),
    };
    let response = builder.json(&body).send().await;

    match response {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let text = resp.text().await.unwrap_or_default();
            if status == 200 {
                let validation = validate_mapping_response(protocol, &request.model, &text);
                Ok(ModelMappingTestResult {
                    ok: validation.ok,
                    status: Some(status),
                    message: validation.message,
                })
            } else {
                Ok(ModelMappingTestResult {
                    ok: false,
                    status: Some(status),
                    message: extract_mapping_error_message(&text).unwrap_or_else(|| format!("HTTP {}", status)),
                })
            }
        }
        Err(err) => Ok(ModelMappingTestResult {
            ok: false,
            status: None,
            message: if err.is_timeout() {
                "连接超时。".to_string()
            } else if err.is_connect() {
                "无法连接，请检查 API 地址。".to_string()
            } else {
                err.to_string()
            },
        }),
    }
}

struct MappingResponseValidation {
    ok: bool,
    message: String,
}

fn build_mapping_test_request(
    request: &ModelMappingTestRequest,
    protocol: MappingProtocol,
) -> (String, serde_json::Value) {
    let anthropic_body = serde_json::json!({
        "model": request.model,
        "max_tokens": 16,
        "messages": [{"role": "user", "content": "只回复 ok"}]
    });
    match protocol {
        MappingProtocol::Claude => (
            build_anthropic_messages_url(&request.target_url, "/v1/messages"),
            anthropic_body,
        ),
        MappingProtocol::OpenAiChat | MappingProtocol::OpenRouter => (
            build_openai_chat_url(&request.target_url),
            anthropic_to_openai_chat_request(&anthropic_body),
        ),
        MappingProtocol::OpenAiResponses => (
            build_openai_responses_url(&request.target_url),
            anthropic_to_openai_responses_request(&anthropic_body),
        ),
        MappingProtocol::Gemini => (
            format!(
                "{}/v1beta/{}:generateContent",
                normalize_gemini_base(&request.target_url),
                normalize_gemini_model_path(&request.model)
            ),
            anthropic_to_gemini_request(&anthropic_body),
        ),
    }
}

fn validate_mapping_response(
    protocol: MappingProtocol,
    model: &str,
    text: &str,
) -> MappingResponseValidation {
    match protocol {
        MappingProtocol::Claude => validate_anthropic_message_response(text),
        MappingProtocol::OpenAiChat | MappingProtocol::OpenAiResponses | MappingProtocol::OpenRouter => {
            match openai_response_to_anthropic_message(protocol, model, text) {
                Ok(value) => {
                    let preview = value
                        .get("content")
                        .and_then(|content| content.as_array())
                        .map(|items| {
                            items
                                .iter()
                                .filter_map(|item| item.get("text").and_then(|text| text.as_str()))
                                .collect::<Vec<_>>()
                                .join("")
                        })
                        .unwrap_or_default();
                    let suffix = if preview.trim().is_empty() {
                        String::new()
                    } else {
                        format!("，响应：{}", preview.trim().chars().take(40).collect::<String>())
                    };
                    MappingResponseValidation {
                        ok: true,
                        message: format!("模型可用 HTTP 200{}", suffix),
                    }
                }
                Err(err) => MappingResponseValidation {
                    ok: false,
                    message: err,
                },
            }
        }
        MappingProtocol::Gemini => match openai_response_to_anthropic_message(protocol, model, text) {
            Ok(value) => {
                let preview = value
                    .get("content")
                    .and_then(|content| content.as_array())
                    .map(|items| {
                        items
                            .iter()
                            .filter_map(|item| item.get("text").and_then(|text| text.as_str()))
                            .collect::<Vec<_>>()
                            .join("")
                    })
                    .unwrap_or_default();
                let suffix = if preview.trim().is_empty() {
                    String::new()
                } else {
                    format!("，响应：{}", preview.trim().chars().take(40).collect::<String>())
                };
                MappingResponseValidation {
                    ok: true,
                    message: format!("模型可用 HTTP 200{}", suffix),
                }
            }
            Err(err) => MappingResponseValidation {
                ok: false,
                message: err,
            },
        },
    }
}

fn validate_anthropic_message_response(text: &str) -> MappingResponseValidation {
    let value = match serde_json::from_str::<serde_json::Value>(text) {
        Ok(value) => value,
        Err(_) => {
            return MappingResponseValidation {
                ok: false,
                message: "接口返回 HTTP 200，但响应不是有效 JSON，不能确认模型可用。".to_string(),
            };
        }
    };

    if let Some(message) = extract_mapping_error_message(text) {
        return MappingResponseValidation {
            ok: false,
            message,
        };
    }

    let has_message_shape = value
        .get("type")
        .and_then(|item| item.as_str())
        .map(|item| item == "message")
        .unwrap_or(false)
        || value.get("id").and_then(|item| item.as_str()).is_some()
        || value.get("model").and_then(|item| item.as_str()).is_some();
    let content_text = value
        .get("content")
        .and_then(|content| content.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("text").and_then(|text| text.as_str()))
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();
    let has_stop_reason = value
        .get("stop_reason")
        .and_then(|item| item.as_str())
        .map(|item| !item.trim().is_empty())
        .unwrap_or(false);

    if has_message_shape && (!content_text.trim().is_empty() || has_stop_reason) {
        let preview = content_text.trim();
        let suffix = if preview.is_empty() {
            String::new()
        } else {
            format!("，响应：{}", preview.chars().take(40).collect::<String>())
        };
        return MappingResponseValidation {
            ok: true,
            message: format!("模型可用 HTTP 200{}", suffix),
        };
    }

    MappingResponseValidation {
        ok: false,
        message: "接口返回 HTTP 200，但没有有效的模型生成结果。".to_string(),
    }
}

fn extract_mapping_error_message(text: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(text)
        .ok()
        .and_then(|value| {
            value
                .get("error")
                .and_then(|error| error.get("message").or_else(|| error.get("error")))
                .or_else(|| value.get("message"))
                .and_then(|message| message.as_str())
                .map(ToString::to_string)
        })
}

fn strip_trailing_suffixes(base_url: &str, suffixes: &[&str]) -> String {
    let mut normalized = base_url.trim().trim_end_matches('/').to_string();
    loop {
        let mut changed = false;
        for suffix in suffixes {
            if normalized.ends_with(suffix) {
                normalized = normalized[..normalized.len() - suffix.len()]
                    .trim_end_matches('/')
                    .to_string();
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    normalized
}

fn build_openai_style_url(base_url: &str, leaf: &str) -> String {
    let normalized = strip_trailing_suffixes(base_url, &["/chat/completions", "/responses", "/models"]);
    if normalized.ends_with("/v1")
        || normalized.ends_with("/v1beta/openai")
        || normalized.ends_with("/openai")
    {
        format!("{}/{}", normalized, leaf)
    } else {
        format!("{}/v1/{}", normalized, leaf)
    }
}

fn build_openai_chat_url(base_url: &str) -> String {
    build_openai_style_url(base_url, "chat/completions")
}

fn build_openai_responses_url(base_url: &str) -> String {
    build_openai_style_url(base_url, "responses")
}

fn normalize_gemini_base(base_url: &str) -> String {
    strip_trailing_suffixes(
        base_url,
        &[
            "/openai/chat/completions",
            "/chat/completions",
            "/models",
            "/v1beta/openai",
            "/v1beta",
            "/openai",
            "/v1",
        ],
    )
}

fn normalize_gemini_model_name(model_name: &str) -> String {
    model_name.trim().trim_start_matches("models/").to_string()
}

fn normalize_gemini_model_path(model_name: &str) -> String {
    format!("models/{}", normalize_gemini_model_name(model_name))
}

fn anthropic_content_to_text(value: &serde_json::Value) -> String {
    if let Some(text) = value.as_str() {
        return text.to_string();
    }
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    item.get("text")
                        .and_then(|text| text.as_str())
                        .map(ToString::to_string)
                })
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
}

fn anthropic_to_openai_messages(data: &serde_json::Value) -> Vec<serde_json::Value> {
    let mut messages = Vec::new();
    if let Some(system) = data.get("system") {
        let content = anthropic_content_to_text(system);
        if !content.trim().is_empty() {
            messages.push(serde_json::json!({"role": "system", "content": content}));
        }
    }
    if let Some(items) = data.get("messages").and_then(|value| value.as_array()) {
        for item in items {
            let role = item
                .get("role")
                .and_then(|role| role.as_str())
                .unwrap_or("user");
            let role = if role == "assistant" { "assistant" } else { "user" };
            let content = item
                .get("content")
                .map(anthropic_content_to_text)
                .unwrap_or_default();
            messages.push(serde_json::json!({"role": role, "content": content}));
        }
    }
    if messages.is_empty() {
        messages.push(serde_json::json!({"role": "user", "content": "Hello"}));
    }
    messages
}

fn anthropic_to_openai_chat_request(data: &serde_json::Value) -> serde_json::Value {
    let max_tokens = data
        .get("max_tokens")
        .and_then(|value| value.as_u64())
        .unwrap_or(1024);
    serde_json::json!({
        "model": data.get("model").cloned().unwrap_or_else(|| serde_json::json!("")),
        "messages": anthropic_to_openai_messages(data),
        "max_completion_tokens": max_tokens,
        "stream": false
    })
}

fn anthropic_to_openai_responses_request(data: &serde_json::Value) -> serde_json::Value {
    let max_tokens = data
        .get("max_tokens")
        .and_then(|value| value.as_u64())
        .unwrap_or(1024);
    let input = anthropic_to_openai_messages(data)
        .iter()
        .filter_map(|message| {
            let role = message.get("role").and_then(|role| role.as_str()).unwrap_or("user");
            let content = message
                .get("content")
                .and_then(|content| content.as_str())
                .unwrap_or("");
            if content.trim().is_empty() {
                None
            } else {
                Some(format!("{role}: {content}"))
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    serde_json::json!({
        "model": data.get("model").cloned().unwrap_or_else(|| serde_json::json!("")),
        "input": input,
        "max_output_tokens": max_tokens
    })
}

fn anthropic_to_gemini_request(data: &serde_json::Value) -> serde_json::Value {
    let max_tokens = data
        .get("max_tokens")
        .and_then(|value| value.as_u64())
        .unwrap_or(1024);

    let contents = data
        .get("messages")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .map(|item| {
                    let role = item
                        .get("role")
                        .and_then(|role| role.as_str())
                        .unwrap_or("user");
                    let gemini_role = if role == "assistant" { "model" } else { "user" };
                    let text = item
                        .get("content")
                        .map(anthropic_content_to_text)
                        .unwrap_or_default();
                    serde_json::json!({
                        "role": gemini_role,
                        "parts": [{"text": text}]
                    })
                })
                .collect::<Vec<_>>()
        })
        .filter(|items| !items.is_empty())
        .unwrap_or_else(|| {
            vec![serde_json::json!({
                "role": "user",
                "parts": [{"text": "Hello"}]
            })]
        });

    let mut body = serde_json::json!({
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": max_tokens
        }
    });

    if let Some(system) = data.get("system") {
        let text = anthropic_content_to_text(system);
        if !text.trim().is_empty() {
            body["systemInstruction"] = serde_json::json!({
                "parts": [{"text": text}]
            });
        }
    }

    if let Some(temperature) = data.get("temperature").and_then(|value| value.as_f64()) {
        body["generationConfig"]["temperature"] = serde_json::json!(temperature);
    }

    body
}

fn extract_openai_chat_text(value: &serde_json::Value) -> Option<String> {
    value
        .get("choices")
        .and_then(|choices| choices.as_array())
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(|content| {
            if let Some(text) = content.as_str() {
                Some(text.to_string())
            } else {
                content.as_array().map(|items| {
                    items
                        .iter()
                        .filter_map(|item| {
                            item.get("text")
                                .and_then(|text| text.as_str())
                                .map(ToString::to_string)
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                })
            }
        })
}

fn extract_openai_responses_text(value: &serde_json::Value) -> Option<String> {
    value
        .get("output_text")
        .and_then(|text| text.as_str())
        .map(ToString::to_string)
        .or_else(|| {
            value
                .get("output")
                .and_then(|output| output.as_array())
                .map(|items| {
                    items
                        .iter()
                        .flat_map(|item| {
                            item.get("content")
                                .and_then(|content| content.as_array())
                                .cloned()
                                .unwrap_or_default()
                        })
                        .filter_map(|part| {
                            part.get("text")
                                .and_then(|text| text.as_str())
                                .map(ToString::to_string)
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                })
        })
}

fn extract_gemini_text(value: &serde_json::Value) -> Option<String> {
    value
        .get("candidates")
        .and_then(|candidates| candidates.as_array())
        .and_then(|candidates| candidates.first())
        .and_then(|candidate| candidate.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(|parts| parts.as_array())
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| {
                    part.get("text")
                        .and_then(|text| text.as_str())
                        .map(ToString::to_string)
                })
                .collect::<Vec<_>>()
                .join("\n")
        })
}

fn openai_response_to_anthropic_message(
    protocol: MappingProtocol,
    model: &str,
    raw_text: &str,
) -> Result<serde_json::Value, String> {
    let value: serde_json::Value =
        serde_json::from_str(raw_text).map_err(|err| format!("上游响应不是有效 JSON：{err}"))?;
    if let Some(message) = extract_mapping_error_message(raw_text) {
        return Err(message);
    }
    let text = match protocol {
        MappingProtocol::OpenAiChat | MappingProtocol::OpenRouter => extract_openai_chat_text(&value),
        MappingProtocol::OpenAiResponses => extract_openai_responses_text(&value),
        MappingProtocol::Gemini => extract_gemini_text(&value),
        _ => None,
    }
    .map(|text| text.trim().to_string())
    .filter(|text| !text.is_empty())
    .ok_or_else(|| {
        let snippet = raw_text.trim().chars().take(240).collect::<String>();
        if snippet.is_empty() {
            "上游响应中没有可转换的模型输出。".to_string()
        } else {
            format!("上游响应中没有可转换的模型输出。原始响应：{}", snippet)
        }
    })?;

    Ok(serde_json::json!({
        "id": value
            .get("id")
            .and_then(|id| id.as_str())
            .unwrap_or("msg_model_mapping"),
        "type": "message",
        "role": "assistant",
        "model": model,
        "content": [{"type": "text", "text": text}],
        "stop_reason": "end_turn",
        "stop_sequence": null,
        "usage": {
            "input_tokens": 0,
            "output_tokens": 0
        }
    }))
}

fn anthropic_message_text(value: &serde_json::Value) -> String {
    value
        .get("content")
        .and_then(|content| content.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("text").and_then(|text| text.as_str()))
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default()
}

fn anthropic_message_to_sse_response(value: serde_json::Value) -> axum::response::Response {
    let text = anthropic_message_text(&value);
    let message_start = serde_json::json!({
        "type": "message_start",
        "message": {
            "id": value.get("id").cloned().unwrap_or_else(|| serde_json::json!("msg_model_mapping")),
            "type": "message",
            "role": "assistant",
            "model": value.get("model").cloned().unwrap_or_else(|| serde_json::json!("")),
            "content": [],
            "stop_reason": null,
            "stop_sequence": null,
            "usage": {"input_tokens": 0, "output_tokens": 0}
        }
    });
    let content_start = serde_json::json!({
        "type": "content_block_start",
        "index": 0,
        "content_block": {"type": "text", "text": ""}
    });
    let content_delta = serde_json::json!({
        "type": "content_block_delta",
        "index": 0,
        "delta": {"type": "text_delta", "text": text}
    });
    let content_stop = serde_json::json!({"type": "content_block_stop", "index": 0});
    let message_delta = serde_json::json!({
        "type": "message_delta",
        "delta": {"stop_reason": "end_turn", "stop_sequence": null},
        "usage": {"output_tokens": 0}
    });
    let message_stop = serde_json::json!({"type": "message_stop"});
    let body = [
        ("message_start", message_start),
        ("content_block_start", content_start),
        ("content_block_delta", content_delta),
        ("content_block_stop", content_stop),
        ("message_delta", message_delta),
        ("message_stop", message_stop),
    ]
    .into_iter()
    .map(|(event, data)| format!("event: {event}\ndata: {data}\n\n"))
    .collect::<String>();

    axum::http::Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "text/event-stream")
        .header("cache-control", "no-cache")
        .body(Body::from(body))
        .unwrap_or_else(|_| (StatusCode::BAD_GATEWAY, "Invalid stream response").into_response())
}

fn build_anthropic_messages_url(base_url: &str, request_path: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    let path = if request_path.is_empty() {
        "/v1/messages"
    } else {
        request_path
    };
    if base.ends_with("/v1") && path.starts_with("/v1/") {
        format!("{}{}", base, path.trim_start_matches("/v1"))
    } else {
        format!("{}{}", base, path)
    }
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
    Ok(manager.logs.read().unwrap_or_else(|err| err.into_inner()).clone())
}

fn build_status(running: bool, config: Option<ModelMappingConfig>) -> ModelMappingStatus {
    let config = config.unwrap_or_else(load_config_file);
    let mapped_models = flatten_config(&config);
    ModelMappingStatus {
        running,
        autostart: is_autostart_enabled(),
        port: current_port(),
        config_path: config_path().display().to_string(),
        claude_dir: claude_3p_dir().map(|path| path.display().to_string()),
        model_count: mapped_models.len(),
        mapped_models,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provider_with_models(models: Vec<ModelMappingEntry>) -> ModelMappingProvider {
        ModelMappingProvider {
            name: "Test".to_string(),
            target_url: "https://example.com/anthropic".to_string(),
            api_key: "secret".to_string(),
            models,
            ..Default::default()
        }
    }

    #[test]
    fn slot_naming_matches_provider_scoped_route() {
        assert_eq!(
            make_slot("DeepSeek", 1),
            "anthropic/claude-claude-deepseek-1"
        );
        assert_eq!(make_slot("GLM 智谱", 2), "anthropic/claude-claude-glm-2");
        assert_eq!(
            make_slot("", 12),
            "anthropic/claude-claude-provider-12"
        );
    }

    #[test]
    fn flatten_config_keeps_all_models() {
        let models = (0..10)
            .map(|index| ModelMappingEntry {
                name: format!("model-{index}"),
                slot: String::new(),
                display_name: String::new(),
                supported_protocols: vec!["openai-chat".to_string()],
                source_protocol: "openai-chat".to_string(),
                target_protocol: "claude".to_string(),
                to_1m: "auto".to_string(),
                enabled: true,
                protocol: "openai-chat".to_string(),
            })
            .collect();
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(models)],
        };

        let flat = flatten_config(&config);

        assert_eq!(flat.len(), 10);
        assert_eq!(flat[0].slot, "anthropic/claude-claude-test-1");
        assert_eq!(flat[9].slot, "anthropic/claude-claude-test-10");
    }

    #[test]
    fn flatten_config_preserves_manual_slot_override() {
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![ModelMappingEntry {
                name: "deepseek-v4-flash".to_string(),
                slot: "anthropic/claude-sonnet-4-5".to_string(),
                display_name: "Manual Alias".to_string(),
                supported_protocols: vec!["claude".to_string()],
                source_protocol: "claude".to_string(),
                target_protocol: "claude".to_string(),
                to_1m: String::new(),
                enabled: true,
                protocol: "claude".to_string(),
            }])],
        };

        let flat = flatten_config(&config);

        assert_eq!(flat[0].slot, "anthropic/claude-sonnet-4-5");
    }

    #[test]
    fn normalize_config_upgrades_old_auto_slot_to_provider_scoped_default() {
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![ModelMappingEntry {
                name: "glm-5-turbo".to_string(),
                slot: "anthropic/claude-glm-5-turbo".to_string(),
                display_name: String::new(),
                supported_protocols: vec!["gemini".to_string()],
                source_protocol: "gemini".to_string(),
                target_protocol: "claude".to_string(),
                to_1m: String::new(),
                enabled: true,
                protocol: "claude".to_string(),
            }, ModelMappingEntry {
                name: "kimi-k2.6".to_string(),
                slot: "anthropic/claude-claude-kimi-k2.6".to_string(),
                display_name: String::new(),
                supported_protocols: vec!["openai-responses".to_string()],
                source_protocol: "openai-responses".to_string(),
                target_protocol: "claude".to_string(),
                to_1m: String::new(),
                enabled: true,
                protocol: "claude".to_string(),
            }])],
        };

        let normalized = normalize_config(config);

        assert_eq!(
            normalized.providers[0].models[0].slot,
            "anthropic/claude-claude-test-1"
        );
        assert_eq!(
            normalized.providers[0].models[1].slot,
            "anthropic/claude-claude-test-2"
        );
    }

    #[test]
    fn normalize_config_restarts_numbering_for_each_provider() {
        let config = ModelMappingConfig {
            providers: vec![
                ModelMappingProvider {
                    name: "DeepSeek".to_string(),
                    target_url: "https://example.com/anthropic".to_string(),
                    api_key: "secret".to_string(),
                    models: vec![
                        ModelMappingEntry {
                            name: "a-1".to_string(),
                            slot: String::new(),
                            display_name: String::new(),
                            supported_protocols: vec!["claude".to_string()],
                            source_protocol: "claude".to_string(),
                            target_protocol: "claude".to_string(),
                            to_1m: String::new(),
                            enabled: true,
                            protocol: "claude".to_string(),
                        },
                        ModelMappingEntry {
                            name: "a-2".to_string(),
                            slot: String::new(),
                            display_name: String::new(),
                            supported_protocols: vec!["claude".to_string()],
                            source_protocol: "claude".to_string(),
                            target_protocol: "claude".to_string(),
                            to_1m: String::new(),
                            enabled: true,
                            protocol: "claude".to_string(),
                        },
                    ],
                    ..Default::default()
                },
                ModelMappingProvider {
                    name: "GLM 智谱".to_string(),
                    target_url: "https://example.com/anthropic".to_string(),
                    api_key: "secret".to_string(),
                    models: vec![ModelMappingEntry {
                        name: "b-1".to_string(),
                        slot: String::new(),
                        display_name: String::new(),
                        supported_protocols: vec!["claude".to_string()],
                        source_protocol: "claude".to_string(),
                        target_protocol: "claude".to_string(),
                        to_1m: String::new(),
                        enabled: true,
                        protocol: "claude".to_string(),
                    }],
                    ..Default::default()
                },
            ],
        };

        let normalized = normalize_config(config);

        assert_eq!(
            normalized.providers[0].models[0].slot,
            "anthropic/claude-claude-deepseek-1"
        );
        assert_eq!(
            normalized.providers[0].models[1].slot,
            "anthropic/claude-claude-deepseek-2"
        );
        assert_eq!(
            normalized.providers[1].models[0].slot,
            "anthropic/claude-claude-glm-1"
        );
    }

    #[test]
    fn normalize_config_sets_provider_model_display_name_and_keeps_manual_alias() {
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![
                ModelMappingEntry {
                    name: "claude-opus-4".to_string(),
                    slot: String::new(),
                    display_name: String::new(),
                    supported_protocols: vec!["claude".to_string()],
                    source_protocol: "claude".to_string(),
                    target_protocol: "claude".to_string(),
                    to_1m: String::new(),
                    enabled: true,
                    protocol: "claude".to_string(),
                },
                ModelMappingEntry {
                    name: "claude-sonnet-4-5".to_string(),
                    slot: String::new(),
                    display_name: "My Sonnet Alias".to_string(),
                    supported_protocols: vec!["claude".to_string()],
                    source_protocol: "claude".to_string(),
                    target_protocol: "claude".to_string(),
                    to_1m: String::new(),
                    enabled: true,
                    protocol: "claude".to_string(),
                },
            ])],
        };

        let normalized = normalize_config(config);

        assert_eq!(
            normalized.providers[0].models[0].display_name,
            "Test-claude-opus-4"
        );
        assert_eq!(
            normalized.providers[0].models[1].display_name,
            "My Sonnet Alias"
        );
    }

    #[test]
    fn prefers_target_protocol_when_model_already_supports_it() {
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![ModelMappingEntry {
                name: "hybrid-model".to_string(),
                slot: "anthropic/claude-claude-test-1".to_string(),
                display_name: "Hybrid".to_string(),
                supported_protocols: vec!["claude".to_string(), "gemini".to_string()],
                source_protocol: "gemini".to_string(),
                target_protocol: "claude".to_string(),
                to_1m: String::new(),
                enabled: true,
                protocol: "gemini".to_string(),
            }])],
        };

        let resolved = resolve_model("anthropic/claude-claude-test-1", &config)
            .expect("should resolve configured slot");

        assert_eq!(resolved.protocol, MappingProtocol::Claude);
    }

    #[test]
    fn defaults_source_protocol_to_claude_when_supported() {
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![ModelMappingEntry {
                name: "hybrid-model".to_string(),
                slot: String::new(),
                display_name: String::new(),
                supported_protocols: vec!["gemini".to_string(), "claude".to_string()],
                source_protocol: String::new(),
                target_protocol: "claude".to_string(),
                to_1m: String::new(),
                enabled: true,
                protocol: String::new(),
            }])],
        };

        let normalized = normalize_config(config);

        assert_eq!(normalized.providers[0].models[0].source_protocol, "claude");
        assert_eq!(normalized.providers[0].models[0].target_protocol, "claude");
    }

    #[test]
    fn converts_anthropic_request_to_gemini_generate_content() {
        let body = serde_json::json!({
            "model": "gemini-2.5-pro",
            "system": "be precise",
            "max_tokens": 12,
            "messages": [
                {"role": "user", "content": "hello"},
                {"role": "assistant", "content": "hi"},
                {"role": "user", "content": [{"type": "text", "text": "next"}]}
            ]
        });

        let converted = anthropic_to_gemini_request(&body);

        assert_eq!(
            converted["generationConfig"]["maxOutputTokens"],
            serde_json::json!(12)
        );
        assert_eq!(
            converted["systemInstruction"]["parts"][0]["text"],
            serde_json::json!("be precise")
        );
        assert_eq!(converted["contents"][0]["role"], serde_json::json!("user"));
        assert_eq!(converted["contents"][1]["role"], serde_json::json!("model"));
        assert_eq!(
            converted["contents"][2]["parts"][0]["text"],
            serde_json::json!("next")
        );
    }

    #[test]
    fn converts_gemini_response_to_anthropic_message() {
        let raw = r#"{
            "candidates": [{
                "content": {
                    "parts": [{"text": "ok from gemini"}]
                }
            }]
        }"#;

        let converted = openai_response_to_anthropic_message(
            MappingProtocol::Gemini,
            "gemini-2.5-pro",
            raw,
        )
        .expect("gemini response should convert");

        assert_eq!(converted["role"], serde_json::json!("assistant"));
        assert_eq!(converted["model"], serde_json::json!("gemini-2.5-pro"));
        assert_eq!(
            converted["content"][0]["text"],
            serde_json::json!("ok from gemini")
        );
    }

    #[test]
    fn unknown_slot_returns_explicit_error() {
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![ModelMappingEntry {
                name: "kimi-k2.6".to_string(),
                slot: String::new(),
                display_name: String::new(),
                supported_protocols: vec!["claude".to_string()],
                source_protocol: "claude".to_string(),
                target_protocol: "claude".to_string(),
                to_1m: "auto".to_string(),
                enabled: true,
                protocol: "claude".to_string(),
            }])],
        };

        let error = resolve_model("unknown[1m]", &config).expect_err("unknown slot should fail");

        assert!(error.contains("未命中模型映射槽位"));
    }

    #[test]
    fn resolve_model_matches_manual_slot_override() {
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![ModelMappingEntry {
                name: "deepseek-v4-flash".to_string(),
                slot: "anthropic/claude-sonnet-4-5".to_string(),
                display_name: "Manual Alias".to_string(),
                supported_protocols: vec!["claude".to_string()],
                source_protocol: "claude".to_string(),
                target_protocol: "claude".to_string(),
                to_1m: String::new(),
                enabled: true,
                protocol: "claude".to_string(),
            }])],
        };

        let resolved = resolve_model("anthropic/claude-sonnet-4-5", &config)
            .expect("manual slot should resolve");

        assert_eq!(resolved.target_model, "deepseek-v4-flash");
    }

    #[test]
    fn validates_real_anthropic_message_response() {
        let validation = validate_anthropic_message_response(
            r#"{"id":"msg_1","type":"message","role":"assistant","model":"test","content":[{"type":"text","text":"ok"}],"stop_reason":"end_turn"}"#,
        );

        assert!(validation.ok);
        assert!(validation.message.contains("模型可用"));
    }

    #[test]
    fn rejects_http_200_without_model_output() {
        let validation = validate_anthropic_message_response(r#"{"ok":true}"#);

        assert!(!validation.ok);
        assert!(validation.message.contains("没有有效的模型生成结果"));
    }

    #[test]
    fn builds_messages_url_without_duplicating_v1() {
        assert_eq!(
            build_anthropic_messages_url("https://iruidong.com/v1", "/v1/messages"),
            "https://iruidong.com/v1/messages"
        );
        assert_eq!(
            build_anthropic_messages_url("https://iruidong.com", "/v1/messages"),
            "https://iruidong.com/v1/messages"
        );
    }

    #[test]
    fn empty_protocol_defaults_to_claude() {
        assert_eq!(
            parse_mapping_protocol("", "https://iruidong.com/v1", "claude-sonnet-4"),
            MappingProtocol::Claude
        );
    }
}
