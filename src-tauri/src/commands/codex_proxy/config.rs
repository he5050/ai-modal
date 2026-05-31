use std::path::PathBuf;
use std::collections::HashSet;

use crate::commands::codex_proxy::types::{
    CodexProxyConfig, CodexProxySettings, CodexProvider, CodexModelEntry,
    CodexModelFlatEntry, DEFAULT_CODEX_SLOTS, CodexProxyStatus,
};

pub fn config_dir() -> PathBuf {
    home_dir().join(".aimodal-codex-proxy")
}

pub fn config_path() -> PathBuf {
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

pub fn load_config_file() -> CodexProxyConfig {
    let path = config_path();
    if !path.exists() {
        return CodexProxyConfig::default();
    }
    let data = std::fs::read_to_string(path).unwrap_or_default();
    serde_json::from_str(&data).unwrap_or_default()
}

pub fn save_config_file(config: &CodexProxyConfig) -> Result<(), String> {
    let dir = config_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|err| format!("无法创建目录 {}: {}", dir.display(), err))?;
    let data = serde_json::to_string_pretty(config).map_err(|err| err.to_string())?;
    let target = config_path();
    let tmp = target.with_extension("json.tmp");
    std::fs::write(&tmp, &data)
        .map_err(|err| format!("写入临时文件失败: {}", err))?;
    std::fs::rename(&tmp, &target)
        .map_err(|err| format!("无法更新 {}: {}", target.display(), err))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

pub fn load_settings_file() -> CodexProxySettings {
    let path = settings_path();
    if !path.exists() {
        return CodexProxySettings::default();
    }
    let data = std::fs::read_to_string(path).unwrap_or_default();
    serde_json::from_str(&data).unwrap_or_default()
}

pub fn save_settings_file(settings: &CodexProxySettings) -> Result<(), String> {
    let dir = config_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|err| format!("无法创建目录 {}: {}", dir.display(), err))?;
    let data = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    let target = settings_path();
    let tmp = target.with_extension("json.tmp");
    std::fs::write(&tmp, &data)
        .map_err(|err| format!("写入临时文件失败: {}", err))?;
    std::fs::rename(&tmp, &target)
        .map_err(|err| format!("无法更新 {}: {}", target.display(), err))?;
    Ok(())
}

pub fn current_port() -> u16 {
    load_settings_file().port
}

/// 生成槽位名称
pub fn make_slot(order: usize) -> String {
    DEFAULT_CODEX_SLOTS
        .get(order.saturating_sub(1))
        .map(|slot| (*slot).to_string())
        .unwrap_or_else(|| format!("openai/gpt-custom-{}", order))
}

/// 清理模型名称
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

/// 检查是否是自动生成的槽位
fn is_auto_generated_slot(slot: &str, name: &str) -> bool {
    let safe_name = sanitize_model_name(name);
    let lower = slot.trim().to_ascii_lowercase();
    (lower.starts_with("openai/gpt-gpt-")
        && lower
            .trim_start_matches("openai/gpt-gpt-")
            .rsplit('-')
            .next()
            .map(|tail| !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit()))
            .unwrap_or(false))
        || (lower.starts_with("gpt-gpt-")
            && lower
                .trim_start_matches("gpt-gpt-")
                .rsplit('-')
                .next()
                .map(|tail| !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit()))
                .unwrap_or(false))
        || lower == format!("openai/gpt-{}", safe_name)
        || lower == format!("gpt-{}", safe_name)
        || lower == format!("openai/gpt-gpt-{}", safe_name)
        || lower == format!("gpt-gpt-{}", safe_name)
        || lower.starts_with("openai/gpt-custom-")
        || lower.starts_with("gpt-custom-")
}

/// 规范化显式槽位
fn normalize_explicit_slot(slot: &str) -> String {
    let trimmed = slot.trim();
    let normalized = trimmed
        .strip_prefix("openai/")
        .or_else(|| trimmed.strip_prefix("OpenAI/"))
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
    if safe.starts_with("gpt-") {
        format!("openai/{}", safe)
    } else {
        format!("openai/gpt-{}", safe)
    }
}

/// 获取有效的槽位列表
pub fn effective_slots(model: &CodexModelEntry) -> Vec<String> {
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

/// 获取有效的显示名称
fn effective_display_name(model: &CodexModelEntry, provider_name: &str) -> String {
    let trimmed = model.display_name.trim();
    if trimmed.is_empty() {
        let provider = provider_name.trim();
        let model_name = model.name.trim();
        if provider.is_empty() {
            if model_name.is_empty() {
                "provider".to_string()
            } else {
                model_name.to_string()
            }
        } else if model_name.is_empty() {
            provider.to_string()
        } else {
            format!("{}-{}", provider, model_name)
        }
    } else {
        trimmed.to_string()
    }
}

/// 规范化配置
pub fn normalize_config(config: CodexProxyConfig) -> CodexProxyConfig {
    let mut reserved_slots = HashSet::new();
    for provider in &config.providers {
        for model in &provider.models {
            for s in effective_slots(model) {
                if s.is_empty() || is_auto_generated_slot(&s, model.name.trim()) {
                    continue;
                }
                reserved_slots.insert(normalize_explicit_slot(&s));
            }
        }
    }

    let mut next_auto_index = 1usize;
    let mut allocate_auto_slot = || {
        while reserved_slots.contains(&make_slot(next_auto_index)) {
            next_auto_index += 1;
        }
        let slot = make_slot(next_auto_index);
        reserved_slots.insert(slot.clone());
        next_auto_index += 1;
        slot
    };

    CodexProxyConfig {
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
                CodexProvider {
                    models: provider
                        .models
                        .into_iter()
                        .map(|model| {
                            let raw_slots = effective_slots(&model);
                            let normalized_slots: Vec<String> = if raw_slots.is_empty() {
                                vec![allocate_auto_slot()]
                            } else {
                                raw_slots
                                    .into_iter()
                                    .map(|s| {
                                        if s.is_empty() || is_auto_generated_slot(&s, model.name.trim()) {
                                            allocate_auto_slot()
                                        } else {
                                            normalize_explicit_slot(&s)
                                        }
                                    })
                                    .collect()
                            };
                            let legacy_slot = normalized_slots.first().cloned().unwrap_or_default();
                            CodexModelEntry {
                                slot: legacy_slot,
                                slots: normalized_slots,
                                display_name: effective_display_name(&model, &provider_label),
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

/// 扁平化配置
pub fn flatten_config(config: &CodexProxyConfig) -> Vec<CodexModelFlatEntry> {
    let normalized = normalize_config(config.clone());
    let mut result = Vec::new();
    for provider in &normalized.providers {
        for model in &provider.models {
            if !model.enabled
                || model.name.trim().is_empty()
                || model.target_protocol.trim() != "openai-chat"
            {
                continue;
            }
            let all_slots = effective_slots(model);
            let slots_to_emit: Vec<String> = if all_slots.is_empty() {
                vec![model.slot.clone()]
            } else {
                all_slots
            };
            for slot in slots_to_emit {
                if slot.is_empty() {
                    continue;
                }
                result.push(CodexModelFlatEntry {
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
                    protocol: model.source_protocol.clone(),
                });
            }
        }
    }
    result
}

/// 验证配置
pub fn validate_config(config: &CodexProxyConfig) -> Result<(), String> {
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

/// 构建状态
pub fn build_status(running: bool, config: Option<CodexProxyConfig>) -> CodexProxyStatus {
    let config = config.unwrap_or_else(load_config_file);
    let mapped_models = flatten_config(&config);
    CodexProxyStatus {
        running,
        autostart: is_autostart_enabled(),
        port: current_port(),
        config_path: config_path().display().to_string(),
        codex_dir: codex_config_dir().map(|path| path.display().to_string()),
        model_count: mapped_models.len(),
        mapped_models,
    }
}

/// 获取当前时间字符串
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

/// 检查是否启用了开机自启
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

/// 获取开机自启 plist 路径
fn autostart_plist_path() -> PathBuf {
    home_dir().join("Library/LaunchAgents/com.ai-modal.codex-proxy.plist")
}

/// 获取 Codex 配置目录
fn codex_config_dir() -> Option<PathBuf> {
    let home = home_dir();

    #[cfg(target_os = "macos")]
    let dir = home.join(".codex");

    #[cfg(target_os = "windows")]
    let dir = home.join(".codex");

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let dir = home.join(".codex");

    Some(dir)
}
