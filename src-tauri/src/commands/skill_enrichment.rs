use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::providers::router::{self, LlmRequestKind};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemLlmProfile {
    pub tool_id: String,
    pub label: String,
    pub source_path: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub request_kind: LlmRequestKind,
    pub protocols: Vec<String>,
    pub updated_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemLlmSnapshot {
    pub current: Option<SystemLlmProfile>,
    pub profiles: Vec<SystemLlmProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrichSkillRequest {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub request_kind: LlmRequestKind,
    pub protocols: Option<Vec<String>>,
    pub skill_dir: String,
    pub skill_path: String,
    pub description: String,
    pub categories: Vec<String>,
    pub updated_at: Option<u64>,
    pub provider_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillEnrichmentRecord {
    pub skill_dir: String,
    pub skill_path: String,
    pub source_updated_at: Option<u64>,
    pub source_description: String,
    pub localized_description: String,
    pub full_description: String,
    pub content_summary: String,
    pub usage: String,
    pub scenarios: String,
    pub tags: Vec<String>,
    pub status: String,
    pub provider_label: Option<String>,
    pub model: String,
    pub request_kind: LlmRequestKind,
    pub raw_response: Option<String>,
    pub error_message: Option<String>,
    pub enriched_at: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
struct EnrichmentPayload {
    #[serde(rename = "localizedDescription")]
    localized_description: String,
    #[serde(rename = "fullDescription")]
    full_description: String,
    #[serde(rename = "contentSummary")]
    content_summary: String,
    usage: String,
    scenarios: String,
    tags: Vec<String>,
}

fn home_dir() -> Result<PathBuf, String> {
    std::env::var("HOME")
        .map(PathBuf::from)
        .map_err(|_| "无法读取 HOME 目录".to_string())
}

fn system_time_to_epoch_ms(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

fn file_updated_at(path: &Path) -> Option<u64> {
    fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(system_time_to_epoch_ms)
}

fn read_if_exists(path: &Path) -> Option<String> {
    fs::read_to_string(path).ok()
}

fn normalize_json_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(|item| item.as_str())
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

fn normalize_tags(tags: &[String], fallback: &[String]) -> Vec<String> {
    let mut normalized = Vec::new();

    for tag in tags {
        let next = tag.trim();
        if next.is_empty() {
            continue;
        }
        if !normalized.iter().any(|item: &String| item.eq_ignore_ascii_case(next)) {
            normalized.push(next.to_string());
        }
        if normalized.len() >= 10 {
            break;
        }
    }

    if normalized.len() < 2 {
        for tag in fallback {
            let next = tag.trim();
            if next.is_empty() {
                continue;
            }
            if !normalized.iter().any(|item: &String| item.eq_ignore_ascii_case(next)) {
                normalized.push(next.to_string());
            }
            if normalized.len() >= 10 {
                break;
            }
        }
    }

    while normalized.len() < 2 {
        let fallback_tag = match normalized.len() {
            0 => "技能管理",
            _ => "工作流",
        };
        if !normalized
            .iter()
            .any(|item: &String| item.eq_ignore_ascii_case(fallback_tag))
        {
            normalized.push(fallback_tag.to_string());
        } else {
            break;
        }
    }

    normalized.truncate(10);
    normalized
}

fn extract_json_object(raw: &str) -> Option<String> {
    let fenced = raw
        .replace("```json", "")
        .replace("```JSON", "")
        .replace("```", "");
    let start = fenced.find('{')?;
    let end = fenced.rfind('}')?;
    (end > start).then(|| fenced[start..=end].to_string())
}

fn trim_text(value: String, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    value.chars().take(max_chars).collect::<String>()
}

fn parse_env_file(content: &str) -> std::collections::BTreeMap<String, String> {
    let mut entries = std::collections::BTreeMap::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = trimmed.split_once('=') {
            let normalized = value
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .to_string();
            entries.insert(key.trim().to_string(), normalized);
        }
    }
    entries
}

fn parse_toml_value(content: &str, section_name: Option<&str>, key_name: &str) -> Option<String> {
    let mut current_section: Option<String> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            current_section = Some(
                trimmed
                    .trim_start_matches('[')
                    .trim_end_matches(']')
                    .trim()
                    .to_string(),
            );
            continue;
        }

        let section_matches = match section_name {
            Some(section) => current_section.as_deref() == Some(section),
            None => current_section.is_none(),
        };

        if !section_matches {
            continue;
        }

        if let Some((key, value)) = trimmed.split_once('=') {
            if key.trim() == key_name {
                return Some(
                    value
                        .trim()
                        .trim_matches('"')
                        .trim_matches('\'')
                        .to_string(),
                );
            }
        }
    }

    None
}

fn parse_claude_profile(home: &Path) -> Option<SystemLlmProfile> {
    let settings_path = home.join(".claude").join("settings.json");
    let local_settings_path = home.join(".claude").join("settings.local.json");
    let mut root = serde_json::Map::new();

    if let Some(content) = read_if_exists(&settings_path) {
        if let Ok(Value::Object(obj)) = serde_json::from_str::<Value>(&content) {
            root.extend(obj);
        }
    }
    if let Some(content) = read_if_exists(&local_settings_path) {
        if let Ok(Value::Object(obj)) = serde_json::from_str::<Value>(&content) {
            root.extend(obj);
        }
    }

    let env = root.get("env")?.as_object()?;
    let base_url = normalize_json_string(env.get("ANTHROPIC_BASE_URL"))?;
    let api_key = normalize_json_string(env.get("ANTHROPIC_AUTH_TOKEN"))?;
    let model = normalize_json_string(env.get("ANTHROPIC_MODEL"))
        .or_else(|| normalize_json_string(env.get("ANTHROPIC_DEFAULT_SONNET_MODEL")))?;

    Some(SystemLlmProfile {
        tool_id: "claude".to_string(),
        label: "Claude".to_string(),
        source_path: settings_path.to_string_lossy().to_string(),
        base_url,
        api_key,
        model,
        request_kind: LlmRequestKind::Claude,
        protocols: vec!["claude".to_string()],
        updated_at: file_updated_at(&local_settings_path).or_else(|| file_updated_at(&settings_path)),
    })
}

fn parse_codex_profile(home: &Path) -> Option<SystemLlmProfile> {
    let config_path = home.join(".codex").join("config.toml");
    let auth_path = home.join(".codex").join("auth.json");
    let config = read_if_exists(&config_path)?;
    let auth = read_if_exists(&auth_path)?;

    let model = parse_toml_value(&config, None, "model")?;
    let base_url = parse_toml_value(&config, Some("model_providers.codex"), "base_url")?;
    let wire_api = parse_toml_value(&config, Some("model_providers.codex"), "wire_api")
        .unwrap_or_else(|| "responses".to_string());
    let auth_json = serde_json::from_str::<Value>(&auth).ok()?;
    let api_key = normalize_json_string(auth_json.get("OPENAI_API_KEY"))?;

    Some(SystemLlmProfile {
        tool_id: "codex".to_string(),
        label: "Codex".to_string(),
        source_path: config_path.to_string_lossy().to_string(),
        base_url,
        api_key,
        model,
        request_kind: if wire_api.eq_ignore_ascii_case("responses") {
            LlmRequestKind::OpenAiResponses
        } else {
            LlmRequestKind::OpenAiChat
        },
        protocols: vec!["openai".to_string()],
        updated_at: file_updated_at(&config_path).or_else(|| file_updated_at(&auth_path)),
    })
}

fn parse_gemini_profile(home: &Path) -> Option<SystemLlmProfile> {
    let settings_path = home.join(".gemini").join(".settings.json");
    let env_path = home.join(".gemini").join(".env");
    let settings = read_if_exists(&settings_path)?;
    let env_content = read_if_exists(&env_path)?;
    let settings_json = serde_json::from_str::<Value>(&settings).ok()?;
    let env_map = parse_env_file(&env_content);

    let model = settings_json
        .get("model")
        .and_then(|value| value.as_object())
        .and_then(|value| normalize_json_string(value.get("name")))?;
    let base_url = env_map.get("GOOGLE_GEMINI_BASE_URL")?.trim().to_string();
    let api_key = env_map.get("GEMINI_API_KEY")?.trim().to_string();

    Some(SystemLlmProfile {
        tool_id: "gemini".to_string(),
        label: "Gemini".to_string(),
        source_path: settings_path.to_string_lossy().to_string(),
        base_url,
        api_key,
        model,
        request_kind: LlmRequestKind::Gemini,
        protocols: vec!["gemini".to_string()],
        updated_at: file_updated_at(&settings_path).or_else(|| file_updated_at(&env_path)),
    })
}

fn parse_snow_profile(home: &Path) -> Option<SystemLlmProfile> {
    let config_path = home.join(".snow").join("config.json");
    let content = read_if_exists(&config_path)?;
    let root = serde_json::from_str::<Value>(&content).ok()?;
    let snowcfg = root.get("snowcfg")?.as_object()?;
    let base_url = normalize_json_string(snowcfg.get("baseUrl"))?;
    let api_key = normalize_json_string(snowcfg.get("apiKey"))?;
    let model = normalize_json_string(snowcfg.get("advancedModel"))
        .or_else(|| normalize_json_string(snowcfg.get("basicModel")))?;
    let request_method = normalize_json_string(snowcfg.get("requestMethod"))
        .unwrap_or_else(|| "responses".to_string());

    let (request_kind, protocols) = match request_method.to_ascii_lowercase().as_str() {
        "anthropic" => (LlmRequestKind::Claude, vec!["claude".to_string()]),
        "gemini" => (LlmRequestKind::Gemini, vec!["gemini".to_string()]),
        "chat" => (LlmRequestKind::OpenAiChat, vec!["openai".to_string()]),
        _ => (
            LlmRequestKind::OpenAiResponses,
            vec!["openai".to_string()],
        ),
    };

    Some(SystemLlmProfile {
        tool_id: "snow".to_string(),
        label: "Snow".to_string(),
        source_path: config_path.to_string_lossy().to_string(),
        base_url,
        api_key,
        model,
        request_kind,
        protocols,
        updated_at: file_updated_at(&config_path),
    })
}

fn parse_opencode_profile(home: &Path) -> Option<SystemLlmProfile> {
    let config_path = home.join(".config").join("opencode").join("opencode.json");
    let content = read_if_exists(&config_path)?;
    let root = serde_json::from_str::<Value>(&content).ok()?;
    let providers = root.get("provider")?.as_object()?;
    let first_entry = providers.iter().next()?;
    let provider = first_entry.1.as_object()?;
    let options = provider.get("options")?.as_object()?;
    let models = provider.get("models")?.as_object()?;
    let first_model = models.keys().next()?.to_string();
    let base_url = normalize_json_string(options.get("baseURL"))?;
    let api_key = normalize_json_string(options.get("apiKey"))?;
    let (request_kind, protocols) = if base_url.contains("anthropic") || base_url.contains("claude")
    {
        (LlmRequestKind::Claude, vec!["claude".to_string()])
    } else if base_url.contains("gemini") || base_url.contains("generativelanguage") {
        (LlmRequestKind::Gemini, vec!["gemini".to_string()])
    } else {
        (LlmRequestKind::OpenAiChat, vec!["openai".to_string()])
    };

    Some(SystemLlmProfile {
        tool_id: "opencode".to_string(),
        label: "OpenCode".to_string(),
        source_path: config_path.to_string_lossy().to_string(),
        base_url,
        api_key,
        model: first_model,
        request_kind,
        protocols,
        updated_at: file_updated_at(&config_path),
    })
}

#[tauri::command]
pub async fn resolve_system_llm() -> Result<SystemLlmSnapshot, String> {
    let home = home_dir()?;
    let mut profiles = Vec::new();

    if let Some(profile) = parse_codex_profile(&home) {
        profiles.push(profile);
    }
    if let Some(profile) = parse_claude_profile(&home) {
        profiles.push(profile);
    }
    if let Some(profile) = parse_gemini_profile(&home) {
        profiles.push(profile);
    }
    if let Some(profile) = parse_snow_profile(&home) {
        profiles.push(profile);
    }
    if let Some(profile) = parse_opencode_profile(&home) {
        profiles.push(profile);
    }

    profiles.sort_by(|left, right| {
        right
            .updated_at
            .unwrap_or(0)
            .cmp(&left.updated_at.unwrap_or(0))
            .then_with(|| left.label.cmp(&right.label))
    });

    Ok(SystemLlmSnapshot {
        current: profiles.first().cloned(),
        profiles,
    })
}

fn build_skill_prompt(
    request: &EnrichSkillRequest,
    skill_markdown: &str,
) -> String {
    format!(
        "你是一个本地 AI 助手工具的技能信息整理器。请根据我提供的 skill 元信息与 SKILL.md 内容，只输出一个 JSON 对象，不要输出 Markdown 代码块，不要解释。\n\n\
输出字段要求：\n\
- localizedDescription: 用 1 到 2 句话写中文短描述，适合列表卡片，40 到 90 个中文字符\n\
- fullDescription: 对 skill 的完整中文介绍，120 到 260 个中文字符\n\
- contentSummary: 提炼 skill 的核心内容与边界，80 到 180 个中文字符\n\
- usage: 说明怎么用、在什么触发词下使用，80 到 180 个中文字符\n\
- scenarios: 说明适用场景与不适用场景，80 到 180 个中文字符\n\
- tags: 2 到 10 个中文功能标签，尽量短，聚焦能力，不要重复\n\n\
约束：\n\
- 必须用简体中文\n\
- 保留原 skill 的真实用途，不要夸大\n\
- 如果原描述已经是中文，也要重写得更自然\n\
- tags 不要出现版本号、文件名、仓库名、纯品牌名；优先写功能维度\n\
- JSON 必须合法\n\n\
Skill 目录名: {skill_dir}\n\
现有描述: {description}\n\
现有分类: {categories}\n\n\
SKILL.md 全文:\n{skill_markdown}",
        skill_dir = request.skill_dir,
        description = request.description,
        categories = if request.categories.is_empty() {
            "[]".to_string()
        } else {
            request.categories.join(", ")
        },
        skill_markdown = truncate_chars(skill_markdown, 20_000),
    )
}

#[tauri::command]
pub async fn enrich_single_skill(
    request: EnrichSkillRequest,
) -> Result<SkillEnrichmentRecord, String> {
    let skill_markdown = fs::read_to_string(&request.skill_path)
        .map_err(|error| format!("读取 SKILL.md 失败：{error}"))?;
    let prompt = build_skill_prompt(&request, &skill_markdown);
    let raw_response = router::generate_text(
        &request.base_url,
        &request.api_key,
        &request.model,
        request.request_kind,
        &prompt,
    )
    .await?;

    let json_text = extract_json_object(&raw_response)
        .ok_or_else(|| "模型返回中未找到合法 JSON 对象".to_string())?;
    let payload: EnrichmentPayload =
        serde_json::from_str(&json_text).map_err(|error| format!("解析富化 JSON 失败：{error}"))?;
    let tags = normalize_tags(&payload.tags, &request.categories);

    Ok(SkillEnrichmentRecord {
        skill_dir: request.skill_dir,
        skill_path: request.skill_path,
        source_updated_at: request.updated_at,
        source_description: request.description.clone(),
        localized_description: trim_text(payload.localized_description, &request.description),
        full_description: trim_text(payload.full_description, &request.description),
        content_summary: trim_text(payload.content_summary, "暂无摘要"),
        usage: trim_text(payload.usage, "暂无用法说明"),
        scenarios: trim_text(payload.scenarios, "暂无场景说明"),
        tags,
        status: "success".to_string(),
        provider_label: request.provider_label,
        model: request.model,
        request_kind: request.request_kind,
        raw_response: Some(raw_response),
        error_message: None,
        enriched_at: Some(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis() as u64)
                .unwrap_or(0),
        ),
    })
}
