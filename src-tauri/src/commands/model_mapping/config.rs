use std::{
    collections::HashSet,
    path::PathBuf,
};

use crate::commands::model_mapping::types::{
    MappingProtocol, ModelMappingConfig, ModelMappingEntry, ModelMappingFlatEntry,
    ModelMappingLogEntry, ModelMappingManager, ModelMappingProvider, ModelMappingSettings,
    DEFAULT_CLAUDE_SLOTS,
};

// Re-export for tests and other modules
// pub use crate::commands::model_mapping::protocol::validate_anthropic_message_response;
// pub use crate::commands::model_mapping::gateway::build_anthropic_messages_url;

pub fn config_dir() -> PathBuf {
    home_dir().join(".claude-model-proxy")
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

pub fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

pub fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

pub fn load_config_file() -> ModelMappingConfig {
    let path = config_path();
    if !path.exists() {
        return ModelMappingConfig::default();
    }
    let data = std::fs::read_to_string(path).unwrap_or_default();
    serde_json::from_str(&data).unwrap_or_default()
}

pub fn normalize_port(port: u16) -> Result<u16, String> {
    if port == 0 {
        Err("端口必须在 1 - 65535 之间。".to_string())
    } else {
        Ok(port)
    }
}

pub fn load_settings_file() -> ModelMappingSettings {
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

pub fn write_with_retry(path: &PathBuf, data: &str) -> Result<(), String> {
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

pub fn save_config_file(config: &ModelMappingConfig) -> Result<(), String> {
    let dir = config_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|err| format!("无法创建目录 {}: {}", dir.display(), err))?;
    let data = serde_json::to_string_pretty(config).map_err(|err| err.to_string())?;
    let target = config_path();
    let tmp = target.with_extension("json.tmp");
    write_with_retry(&tmp, &data)?;
    std::fs::rename(&tmp, &target)
        .map_err(|err| format!("无法更新 {}: {}", target.display(), err))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

pub fn save_settings_file(settings: &ModelMappingSettings) -> Result<(), String> {
    normalize_port(settings.port)?;
    let dir = config_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|err| format!("无法创建目录 {}: {}", dir.display(), err))?;
    let data = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    let target = settings_path();
    let tmp = target.with_extension("json.tmp");
    write_with_retry(&tmp, &data)?;
    std::fs::rename(&tmp, &target).map_err(|err| format!("无法更新 {}: {}", target.display(), err))
}

pub fn current_port() -> u16 {
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

pub fn make_slot(order: usize) -> String {
    DEFAULT_CLAUDE_SLOTS
        .get(order.saturating_sub(1))
        .map(|slot| (*slot).to_string())
        .unwrap_or_else(|| format!("anthropic/claude-custom-{}", order))
}

pub fn legacy_slot(name: &str) -> String {
    let safe = sanitize_model_name(name);
    if safe.starts_with("claude-") {
        safe
    } else {
        format!("claude-{}", safe)
    }
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
        // 识别自动生成的 custom 槽位
        || lower.starts_with("anthropic/claude-custom-")
        || lower.starts_with("claude-custom-")
}

fn normalize_explicit_slot(slot: &str) -> String {
    let trimmed = slot.trim();
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

pub fn effective_slot(model: &ModelMappingEntry) -> String {
    model.slot.trim().to_string()
}

pub fn effective_slots(model: &ModelMappingEntry) -> Vec<String> {
    let mut result: Vec<String> = model
        .slots
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let legacy = model.slot.trim().to_string();
    if !legacy.is_empty() && !result.contains(&legacy) {
        result.insert(0, legacy);
    }
    result
}

fn effective_display_name(model: &ModelMappingEntry, provider_name: &str) -> String {
    let trimmed = model.display_name.trim();
    if trimmed.is_empty() {
        make_model_display_name(provider_name, model.name.trim())
    } else {
        trimmed.to_string()
    }
}

pub fn normalize_config(config: ModelMappingConfig) -> ModelMappingConfig {
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
                        .map(|model| {
                            let supported_protocols =
                                normalize_supported_protocols(&model, &target_url);
                            let target_protocol = resolve_target_protocol(&model);
                            let source_protocol =
                                resolve_source_protocol(&model, &target_url, &target_protocol);
                            // 只保留用户手动设置的槽位，取消自动分配
                            let raw_slots = effective_slots(&model);
                            let normalized_slots: Vec<String> = raw_slots
                                .into_iter()
                                .map(|s| {
                                    if s.is_empty() || is_auto_generated_slot(&s, model.name.trim()) {
                                        String::new()
                                    } else {
                                        normalize_explicit_slot(&s)
                                    }
                                })
                                .filter(|s| !s.is_empty())
                                .collect();
                            let legacy_slot = normalized_slots.first().cloned().unwrap_or_default();
                            ModelMappingEntry {
                                slot: legacy_slot,
                                slots: normalized_slots,
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

pub fn protocol_to_string(protocol: MappingProtocol) -> String {
    match protocol {
        MappingProtocol::Claude => "claude",
        MappingProtocol::OpenAiChat => "openai-chat",
        MappingProtocol::OpenAiResponses => "openai-responses",
        MappingProtocol::OpenRouter => "openrouter",
        MappingProtocol::Gemini => "gemini",
    }
    .to_string()
}

pub fn normalize_protocol_value(protocol: &str) -> Option<String> {
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

pub fn normalize_supported_protocols(entry: &ModelMappingEntry, target_url: &str) -> Vec<String> {
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
        result.push(protocol_to_string(infer_mapping_protocol(
            target_url,
            &entry.name,
        )));
    }
    result
}

pub fn resolve_source_protocol(
    entry: &ModelMappingEntry,
    target_url: &str,
    target_protocol: &str,
) -> String {
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

pub fn resolve_target_protocol(entry: &ModelMappingEntry) -> String {
    match normalize_protocol_value(&entry.target_protocol).as_deref() {
        Some("claude" | "openai-chat" | "openai-responses" | "gemini") => {
            normalize_protocol_value(&entry.target_protocol).unwrap()
        }
        _ => "claude".to_string(),
    }
}

pub fn resolve_effective_upstream_protocol(entry: &ModelMappingEntry, target_url: &str) -> String {
    let supported = normalize_supported_protocols(entry, target_url);
    let target = resolve_target_protocol(entry);
    if supported.contains(&target) {
        return target;
    }
    resolve_source_protocol(entry, target_url, &target)
}

pub fn parse_mapping_protocol(protocol: &str, target_url: &str, model: &str) -> MappingProtocol {
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

pub fn infer_mapping_protocol(target_url: &str, _model: &str) -> MappingProtocol {
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

pub fn flatten_config(config: &ModelMappingConfig) -> Vec<ModelMappingFlatEntry> {
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
            // 只输出用户手动设置的槽位，没有槽位的模型不参与映射
            let all_slots = effective_slots(model);
            let slots_to_emit: Vec<String> = all_slots.into_iter().filter(|s| !s.is_empty()).collect();
            for slot in slots_to_emit {
                result.push(ModelMappingFlatEntry {
                    slot,
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
    }
    result
}

pub fn validate_config(config: &ModelMappingConfig) -> Result<(), String> {
    if config.providers.is_empty() {
        return Err("请至少添加一个服务商。".to_string());
    }
    for (index, provider) in config.providers.iter().enumerate() {
        if provider.target_url.trim().is_empty() {
            return Err(format!("第 {} 个服务商缺少 API 地址。", index + 1));
        }
        if !provider.target_url.starts_with("http://")
            && !provider.target_url.starts_with("https://")
        {
            return Err(format!(
                "第 {} 个服务商 API 地址必须以 http:// 或 https:// 开头。",
                index + 1
            ));
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

pub fn build_status(running: bool, config: Option<ModelMappingConfig>) -> crate::commands::model_mapping::types::ModelMappingStatus {
    let config = config.unwrap_or_else(load_config_file);
    let mapped_models = flatten_config(&config);
    crate::commands::model_mapping::types::ModelMappingStatus {
        running,
        autostart: is_autostart_enabled(),
        port: current_port(),
        config_path: config_path().display().to_string(),
        claude_dir: claude_3p_dir().map(|path| path.display().to_string()),
        model_count: mapped_models.len(),
        mapped_models,
    }
}

pub fn now_time() -> String {
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

pub fn push_log(manager: &ModelMappingManager, entry: ModelMappingLogEntry) {
    let mut logs = manager.logs.write().unwrap_or_else(|err| err.into_inner());
    logs.insert(0, entry);
    logs.truncate(20);
}

pub fn stringify_json_pretty(value: &serde_json::Value) -> String {
    serde_json::to_string_pretty(value)
        .unwrap_or_else(|_| serde_json::to_string(value).unwrap_or_default())
}

// Claude Desktop functions (moved from original file)
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
        let store_dir = std::fs::read_dir(&packages).ok().and_then(|entries| {
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

fn autostart_plist_path() -> PathBuf {
    home_dir().join("Library/LaunchAgents/com.ai-modal.model-mapping.plist")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::model_mapping::types::{
        ModelMappingConfig, ModelMappingEntry, ModelMappingProvider,
    };
    use crate::commands::model_mapping::config::{
        normalize_config, flatten_config, make_slot,
        parse_mapping_protocol, MappingProtocol,
    };
    use crate::commands::model_mapping::gateway::resolve_model;
    use crate::commands::model_mapping::gateway::build_anthropic_messages_url;
    use crate::commands::model_mapping::protocol::validate_anthropic_message_response;

    fn provider_with_models(models: Vec<ModelMappingEntry>) -> ModelMappingProvider {
        ModelMappingProvider {
            name: "Test".to_string(),
            target_url: "https://example.com/anthropic".to_string(),
            api_key: "secret".to_string(),
            models,
            ..Default::default()
        }
    }

    fn test_entry(name: &str) -> ModelMappingEntry {
        ModelMappingEntry {
            name: name.to_string(),
            enabled: true,
            supported_protocols: vec!["claude".to_string()],
            source_protocol: "claude".to_string(),
            target_protocol: "claude".to_string(),
            ..Default::default()
        }
    }

    fn test_entry_with_slot(name: &str, slot: &str) -> ModelMappingEntry {
        ModelMappingEntry {
            name: name.to_string(),
            slot: slot.to_string(),
            enabled: true,
            supported_protocols: vec!["claude".to_string()],
            source_protocol: "claude".to_string(),
            target_protocol: "claude".to_string(),
            ..Default::default()
        }
    }

    #[test]
    fn slot_naming_matches_canonical_defaults_and_custom_fallback() {
        assert_eq!(make_slot(1), "anthropic/claude-opus-current");
        assert_eq!(make_slot(2), "anthropic/claude-sonnet-current");
        assert_eq!(make_slot(14), "anthropic/claude-haiku-3-5");
        assert_eq!(make_slot(15), "anthropic/claude-custom-15");
    }

    #[test]
    fn flatten_config_keeps_only_manual_slots() {
        // 没有手动设置槽位的模型不参与映射
        let models = (0..3)
            .map(|index| ModelMappingEntry {
                name: format!("model-{index}"),
                supported_protocols: vec!["openai-chat".to_string()],
                source_protocol: "openai-chat".to_string(),
                target_protocol: "claude".to_string(),
                to_1m: "auto".to_string(),
                enabled: true,
                ..Default::default()
            })
            .collect();
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(models)],
        };

        let flat = flatten_config(&config);

        // 没有手动设置槽位，应该为空
        assert_eq!(flat.len(), 0);
    }

    #[test]
    fn flatten_config_keeps_models_with_manual_slots() {
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![
                ModelMappingEntry {
                    name: "model-with-slot".to_string(),
                    slot: "anthropic/claude-opus-current".to_string(),
                    supported_protocols: vec!["claude".to_string()],
                    source_protocol: "claude".to_string(),
                    target_protocol: "claude".to_string(),
                    enabled: true,
                    ..Default::default()
                },
                ModelMappingEntry {
                    name: "model-without-slot".to_string(),
                    supported_protocols: vec!["claude".to_string()],
                    source_protocol: "claude".to_string(),
                    target_protocol: "claude".to_string(),
                    enabled: true,
                    ..Default::default()
                },
            ])],
        };

        let flat = flatten_config(&config);

        assert_eq!(flat.len(), 1);
        assert_eq!(flat[0].slot, "anthropic/claude-opus-current");
        assert_eq!(flat[0].name, "model-with-slot");
    }

    #[test]
    fn flatten_config_preserves_manual_slot_override() {
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![ModelMappingEntry {
                name: "deepseek-v4-flash".to_string(),
                slot: "anthropic/claude-sonnet-4-5".to_string(),
                display_name: "Manual Alias".to_string(),
                enabled: true,
                ..Default::default()
            }])],
        };

        let flat = flatten_config(&config);

        assert_eq!(flat[0].slot, "anthropic/claude-sonnet-4-5");
    }

    #[test]
    fn normalize_config_clears_old_auto_slots() {
        // 旧的自动生成的槽位应该被清空，不再自动分配新槽位
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![
                ModelMappingEntry {
                    name: "glm-5-turbo".to_string(),
                    slot: "anthropic/claude-glm-5-turbo".to_string(),
                    supported_protocols: vec!["gemini".to_string()],
                    source_protocol: "gemini".to_string(),
                    enabled: true,
                    ..Default::default()
                },
                ModelMappingEntry {
                    name: "kimi-k2.6".to_string(),
                    slot: "anthropic/claude-claude-kimi-k2.6".to_string(),
                    supported_protocols: vec!["openai-responses".to_string()],
                    source_protocol: "openai-responses".to_string(),
                    enabled: true,
                    ..Default::default()
                },
            ])],
        };

        let normalized = normalize_config(config);

        // 自动生成的槽位被清空，不再自动分配
        assert_eq!(normalized.providers[0].models[0].slot, "");
        assert_eq!(normalized.providers[0].models[1].slot, "");
        assert!(normalized.providers[0].models[0].slots.is_empty());
        assert!(normalized.providers[0].models[1].slots.is_empty());
    }

    #[test]
    fn normalize_config_does_not_auto_assign_slots() {
        // 取消自动分配槽位，没有手动设置的模型槽位为空
        let config = ModelMappingConfig {
            providers: vec![
                ModelMappingProvider {
                    name: "DeepSeek".to_string(),
                    target_url: "https://example.com/anthropic".to_string(),
                    api_key: "secret".to_string(),
                    models: vec![
                        test_entry("a-1"),
                        test_entry("a-2"),
                    ],
                    ..Default::default()
                },
                ModelMappingProvider {
                    name: "GLM 智谱".to_string(),
                    target_url: "https://example.com/anthropic".to_string(),
                    api_key: "secret".to_string(),
                    models: vec![test_entry("b-1")],
                    ..Default::default()
                },
            ],
        };

        let normalized = normalize_config(config);

        // 没有手动设置槽位，全部为空
        assert_eq!(normalized.providers[0].models[0].slot, "");
        assert_eq!(normalized.providers[0].models[1].slot, "");
        assert_eq!(normalized.providers[1].models[0].slot, "");
        assert!(normalized.providers[0].models[0].slots.is_empty());
        assert!(normalized.providers[0].models[1].slots.is_empty());
        assert!(normalized.providers[1].models[0].slots.is_empty());
    }

    #[test]
    fn normalize_config_sets_provider_model_display_name_and_keeps_manual_alias() {
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![
                ModelMappingEntry {
                    name: "claude-opus-4".to_string(),
                    enabled: true,
                    ..Default::default()
                },
                ModelMappingEntry {
                    name: "claude-sonnet-4-5".to_string(),
                    display_name: "My Sonnet Alias".to_string(),
                    enabled: true,
                    ..Default::default()
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
                slot: "anthropic/claude-opus-current".to_string(),
                display_name: "Hybrid".to_string(),
                supported_protocols: vec!["claude".to_string(), "gemini".to_string()],
                source_protocol: "gemini".to_string(),
                target_protocol: "claude".to_string(),
                enabled: true,
                ..Default::default()
            }])],
        };

        let resolved = resolve_model("anthropic/claude-opus-current", &config)
            .expect("should resolve configured slot");

        assert_eq!(resolved.protocol, MappingProtocol::Claude);
    }

    #[test]
    fn defaults_source_protocol_to_claude_when_supported() {
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![ModelMappingEntry {
                name: "hybrid-model".to_string(),
                supported_protocols: vec!["gemini".to_string(), "claude".to_string()],
                enabled: true,
                ..Default::default()
            }])],
        };

        let normalized = normalize_config(config);

        assert_eq!(normalized.providers[0].models[0].source_protocol, "claude");
        assert_eq!(normalized.providers[0].models[0].target_protocol, "claude");
    }

    #[test]
    fn unknown_slot_returns_explicit_error() {
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![ModelMappingEntry {
                name: "kimi-k2.6".to_string(),
                to_1m: "auto".to_string(),
                enabled: true,
                ..Default::default()
            }])],
        };

        let error = resolve_model("unknown[1m]", &config).expect_err("unknown slot should fail");

        assert!(error.contains("未命中模型映射槽位"));
    }

    #[test]
    fn resolve_model_matches_manual_slot_override() {
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![test_entry_with_slot("deepseek-v4-flash", "anthropic/claude-sonnet-4-5")])],
        };

        let resolved = resolve_model("anthropic/claude-sonnet-4-5", &config)
            .expect("manual slot should resolve");

        assert_eq!(resolved.target_model, "deepseek-v4-flash");
    }

    #[test]
    fn resolve_model_requires_explicit_slot() {
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![test_entry("claude-haiku-4-5-20251001")])],
        };

        let error = resolve_model("claude-haiku-4-5-20251001", &config)
            .expect_err("model without slot should not resolve");

        assert!(error.contains("未命中模型映射槽位"));
    }

    #[test]
    fn resolve_model_matches_slot_without_anthropic_prefix() {
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![ModelMappingEntry {
                name: "glm-5-turbo".to_string(),
                slot: "anthropic/claude-haiku-4-5-20251001".to_string(),
                slots: vec!["anthropic/claude-haiku-4-5-20251001".to_string()],
                supported_protocols: vec!["claude".to_string()],
                source_protocol: "claude".to_string(),
                target_protocol: "claude".to_string(),
                enabled: true,
                ..Default::default()
            }])],
        };

        let resolved = resolve_model("claude-haiku-4-5-20251001", &config)
            .expect("slot without anthropic/ prefix should still match");
        assert_eq!(resolved.target_model, "glm-5-turbo");

        let resolved2 = resolve_model("anthropic/claude-haiku-4-5-20251001", &config)
            .expect("slot with anthropic/ prefix should match");
        assert_eq!(resolved2.target_model, "glm-5-turbo");
    }

    #[test]
    fn resolve_model_matches_slot_reverse_prefix_scenario() {
        // base_model 带前缀、slots 不带前缀的反向场景（防御性匹配）
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![ModelMappingEntry {
                name: "test-model".to_string(),
                slot: "claude-opus-current".to_string(),
                slots: vec!["claude-opus-current".to_string()],
                supported_protocols: vec!["claude".to_string()],
                source_protocol: "claude".to_string(),
                target_protocol: "claude".to_string(),
                enabled: true,
                ..Default::default()
            }])],
        };

        let resolved = resolve_model("anthropic/claude-opus-current", &config)
            .expect("base_model with prefix should match slot without prefix");
        assert_eq!(resolved.target_model, "test-model");

        let resolved2 = resolve_model("claude-opus-current", &config)
            .expect("exact match should still work");
        assert_eq!(resolved2.target_model, "test-model");
    }

    #[test]
    fn resolve_model_supports_multiple_slots_per_model() {
        // 一个模型可以对应多个槽位
        let config = ModelMappingConfig {
            providers: vec![provider_with_models(vec![ModelMappingEntry {
                name: "deepseek-v4".to_string(),
                slots: vec![
                    "anthropic/claude-opus-current".to_string(),
                    "anthropic/claude-sonnet-current".to_string(),
                ],
                slot: "anthropic/claude-opus-current".to_string(),
                supported_protocols: vec!["claude".to_string()],
                source_protocol: "claude".to_string(),
                target_protocol: "claude".to_string(),
                enabled: true,
                ..Default::default()
            }])],
        };

        let resolved1 = resolve_model("anthropic/claude-opus-current", &config)
            .expect("first slot should resolve");
        assert_eq!(resolved1.target_model, "deepseek-v4");

        let resolved2 = resolve_model("anthropic/claude-sonnet-current", &config)
            .expect("second slot should resolve");
        assert_eq!(resolved2.target_model, "deepseek-v4");
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
