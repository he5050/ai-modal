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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineSkillDetailInput {
    pub id: String,
    pub skill_id: String,
    pub source: String,
    pub page_url: String,
    pub install_command: String,
    pub summary: String,
    pub usage_hints: Vec<String>,
    pub skill_doc: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateOnlineSkillDetailRequest {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub request_kind: LlmRequestKind,
    pub provider_label: Option<String>,
    pub skill_dir: String,
    pub skill_name: String,
    pub detail: OnlineSkillDetailInput,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizedOnlineSkillDetail {
    pub skill_dir: String,
    pub skill_name: String,
    pub skill_id: String,
    pub source: String,
    pub page_url: String,
    pub install_command: String,
    pub source_summary: String,
    pub source_usage_hints: Vec<String>,
    pub localized_summary: String,
    pub localized_usage_hints: Vec<String>,
    pub provider_label: Option<String>,
    pub model: String,
    pub request_kind: LlmRequestKind,
    pub translated_at: Option<u64>,
    pub error_message: Option<String>,
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

#[derive(Debug, Clone, Deserialize)]
struct OnlineSkillDetailTranslationPayload {
    #[serde(rename = "localizedSummary")]
    localized_summary: String,
    #[serde(rename = "localizedUsageHints")]
    localized_usage_hints: Vec<String>,
}

#[derive(Debug, Clone)]
struct MarkdownSection {
    heading: String,
    content: String,
}

#[derive(Debug, Clone)]
struct SemanticSection {
    role: &'static str,
    score: usize,
    signals: Vec<&'static str>,
    section: MarkdownSection,
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

fn resolve_skill_markdown_path(path: &Path) -> PathBuf {
    if path.is_dir() {
        return path.join("SKILL.md");
    }
    path.to_path_buf()
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
        if !normalized
            .iter()
            .any(|item: &String| item.eq_ignore_ascii_case(next))
        {
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
            if !normalized
                .iter()
                .any(|item: &String| item.eq_ignore_ascii_case(next))
            {
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

    // Walk from the opening '{' using a depth counter to find the matching '}'.
    // This correctly handles nested braces inside string values or nested objects.
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape_next = false;
    let bytes = fenced.as_bytes();
    for i in start..bytes.len() {
        let ch = bytes[i];
        if escape_next {
            escape_next = false;
            continue;
        }
        if ch == b'\\' && in_string {
            escape_next = true;
            continue;
        }
        if ch == b'"' {
            in_string = !in_string;
            continue;
        }
        if in_string {
            continue;
        }
        if ch == b'{' {
            depth += 1;
        } else if ch == b'}' {
            depth -= 1;
            if depth == 0 {
                return Some(fenced[start..=i].to_string());
            }
        }
    }
    None
}

fn trim_text(value: String, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn normalize_non_empty_lines(lines: &[String], fallback: &[String]) -> Vec<String> {
    let mut normalized = lines
        .iter()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
        .collect::<Vec<_>>();

    if normalized.is_empty() {
        normalized = fallback
            .iter()
            .map(|line| line.trim())
            .filter(|line| !line.is_empty())
            .map(ToString::to_string)
            .collect();
    }

    normalized.truncate(6);
    normalized
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    value.chars().take(max_chars).collect::<String>()
}

fn split_frontmatter(content: &str) -> (Option<String>, String) {
    let normalized = content.replace("\r\n", "\n");
    if !normalized.starts_with("---\n") {
        return (None, normalized);
    }

    let remainder = &normalized[4..];
    if let Some(end) = remainder.find("\n---\n") {
        let frontmatter = remainder[..end].trim().to_string();
        let body = remainder[end + 5..].to_string();
        let frontmatter = if frontmatter.is_empty() {
            None
        } else {
            Some(frontmatter)
        };
        return (frontmatter, body);
    }

    (None, normalized)
}

fn normalize_block(content: &str) -> String {
    content
        .lines()
        .map(|line| line.trim_end())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn extract_intro(body: &str, max_chars: usize) -> String {
    let mut paragraphs = Vec::new();
    let mut current = Vec::new();

    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !current.is_empty() {
                paragraphs.push(current.join("\n"));
                current.clear();
            }
            continue;
        }
        if trimmed.starts_with('#') {
            break;
        }
        current.push(trimmed.to_string());
    }

    if !current.is_empty() {
        paragraphs.push(current.join("\n"));
    }

    truncate_chars(&paragraphs.join("\n\n"), max_chars)
}

fn parse_markdown_sections(body: &str) -> Vec<MarkdownSection> {
    let mut sections = Vec::new();
    let mut current_heading: Option<String> = None;
    let mut current_lines: Vec<String> = Vec::new();

    for line in body.lines() {
        let trimmed = line.trim();
        let is_heading = trimmed.starts_with('#');
        if is_heading {
            if let Some(heading) = current_heading.take() {
                let content = normalize_block(&current_lines.join("\n"));
                if !content.is_empty() {
                    sections.push(MarkdownSection { heading, content });
                }
            }
            current_heading = Some(trimmed.trim_start_matches('#').trim().to_string());
            current_lines.clear();
            continue;
        }

        if current_heading.is_some() {
            current_lines.push(line.to_string());
        }
    }

    if let Some(heading) = current_heading.take() {
        let content = normalize_block(&current_lines.join("\n"));
        if !content.is_empty() {
            sections.push(MarkdownSection { heading, content });
        }
    }

    sections
}

fn semantic_profiles() -> Vec<(&'static str, Vec<&'static str>)> {
    vec![
        (
            "触发与适用",
            vec![
                "trigger",
                "triggers",
                "use when",
                "when to use",
                "should use",
                "invoke",
                "route",
                "适用",
                "触发",
                "入口",
                "调用",
                "路由",
                "使用时机",
            ],
        ),
        (
            "用法与执行",
            vec![
                "usage",
                "how to use",
                "workflow",
                "process",
                "steps",
                "run",
                "execute",
                "command",
                "用法",
                "执行",
                "步骤",
                "流程",
                "命令",
                "如何使用",
            ],
        ),
        (
            "场景与边界",
            vec![
                "scenario",
                "scenarios",
                "do not use",
                "don't use",
                "when not",
                "not use",
                "anti-pattern",
                "scope",
                "limitation",
                "constraint",
                "场景",
                "边界",
                "限制",
                "不适用",
                "不要",
                "约束",
            ],
        ),
        (
            "示例",
            vec![
                "example", "examples", "sample", "demo", "input", "output", "示例", "样例", "演示",
                "输入", "输出",
            ],
        ),
        (
            "实现细节",
            vec![
                "script",
                "scripts",
                "template",
                "templates",
                "asset",
                "assets",
                "reference",
                "references",
                "file",
                "path",
                "脚本",
                "模板",
                "素材",
                "参考",
                "文件",
                "路径",
            ],
        ),
    ]
}

fn semantic_score(
    section: &MarkdownSection,
    role: &'static str,
    keywords: &[&'static str],
) -> SemanticSection {
    let heading = section.heading.to_ascii_lowercase();
    let content = section.content.to_ascii_lowercase();
    let mut score = 0usize;
    let mut signals = Vec::new();

    for keyword in keywords {
        let normalized = keyword.to_ascii_lowercase();
        let in_heading = heading.contains(&normalized);
        let in_content = content.contains(&normalized);
        if in_heading {
            score += 3;
        }
        if in_content {
            score += 1;
        }
        if in_heading || in_content {
            signals.push(*keyword);
        }
    }

    SemanticSection {
        role,
        score,
        signals,
        section: section.clone(),
    }
}

fn semantic_sections(sections: &[MarkdownSection]) -> Vec<SemanticSection> {
    let profiles = semantic_profiles();
    sections
        .iter()
        .filter_map(|section| {
            profiles
                .iter()
                .map(|(role, keywords)| semantic_score(section, role, keywords))
                .max_by(|left, right| {
                    left.score
                        .cmp(&right.score)
                        .then_with(|| right.section.heading.cmp(&left.section.heading))
                })
                .filter(|scored| scored.score > 0)
        })
        .collect()
}

fn pick_priority_sections(sections: &[MarkdownSection]) -> Vec<MarkdownSection> {
    let mut selected = Vec::new();
    let mut used_headings = std::collections::BTreeSet::new();
    let mut scored = semantic_sections(sections);
    scored.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.role.cmp(right.role))
            .then_with(|| left.section.heading.cmp(&right.section.heading))
    });

    for scored_section in scored {
        if used_headings.insert(scored_section.section.heading.clone()) {
            selected.push(scored_section.section);
        }
        if selected.len() >= 6 {
            break;
        }
    }

    if selected.len() < 3 {
        for section in sections.iter() {
            if used_headings.contains(&section.heading) {
                continue;
            }
            selected.push(section.clone());
            used_headings.insert(section.heading.clone());
            if selected.len() >= 3 {
                break;
            }
        }
    }

    selected
}

fn build_semantic_summary(sections: &[MarkdownSection], max_chars: usize) -> String {
    let mut scored = semantic_sections(sections);
    scored.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.role.cmp(right.role))
            .then_with(|| left.section.heading.cmp(&right.section.heading))
    });

    let summary = scored
        .into_iter()
        .take(8)
        .map(|item| {
            let signals = item.signals.join(", ");
            format!(
                "- {} | 角色: {} | 分数: {} | 信号: {}",
                item.section.heading, item.role, item.score, signals
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    truncate_chars(&summary, max_chars)
}

fn section_to_prompt_block(section: &MarkdownSection, max_chars: usize) -> String {
    format!(
        "## {}\n{}",
        section.heading,
        truncate_chars(&section.content, max_chars)
    )
}

fn build_supplemental_excerpt(
    body: &str,
    sections: &[MarkdownSection],
    selected_sections: &[MarkdownSection],
    max_chars: usize,
) -> String {
    let selected_headings = selected_sections
        .iter()
        .map(|section| section.heading.clone())
        .collect::<std::collections::BTreeSet<_>>();

    let mut parts = Vec::new();
    for section in sections {
        if selected_headings.contains(&section.heading) {
            continue;
        }
        let block = section_to_prompt_block(section, 1_600);
        if !block.is_empty() {
            parts.push(block);
        }
        if parts.join("\n\n").chars().count() >= max_chars {
            break;
        }
    }

    if parts.is_empty() {
        return truncate_chars(body.trim(), max_chars);
    }

    truncate_chars(&parts.join("\n\n"), max_chars)
}

fn build_structured_skill_source(skill_markdown: &str) -> String {
    let (frontmatter, body) = split_frontmatter(skill_markdown);
    let intro = extract_intro(&body, 2_000);
    let sections = parse_markdown_sections(&body);
    let selected_sections = pick_priority_sections(&sections);
    let semantic_summary = build_semantic_summary(&sections, 2_000);
    let supplemental = build_supplemental_excerpt(&body, &sections, &selected_sections, 6_000);

    let mut parts = Vec::new();

    if let Some(frontmatter) = frontmatter {
        parts.push(format!(
            "[Frontmatter]\n{}",
            truncate_chars(&frontmatter, 3_000)
        ));
    }

    if !intro.is_empty() {
        parts.push(format!("[简介摘录]\n{}", intro));
    }

    if !selected_sections.is_empty() {
        let selected = selected_sections
            .iter()
            .map(|section| section_to_prompt_block(section, 2_400))
            .collect::<Vec<_>>()
            .join("\n\n");
        parts.push(format!("[重点章节]\n{}", selected));
    }

    if !semantic_summary.is_empty() {
        parts.push(format!("[语义信号摘要]\n{}", semantic_summary));
    }

    if !supplemental.trim().is_empty() {
        parts.push(format!("[补充正文摘录]\n{}", supplemental));
    }

    truncate_chars(&parts.join("\n\n"), 18_000)
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
        updated_at: file_updated_at(&local_settings_path)
            .or_else(|| file_updated_at(&settings_path)),
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
        _ => (LlmRequestKind::OpenAiResponses, vec!["openai".to_string()]),
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

fn build_skill_prompt(request: &EnrichSkillRequest, skill_markdown: &str) -> String {
    let structured_source = build_structured_skill_source(skill_markdown);
    format!(
        "你是一个本地 AI 助手工具的技能信息整理器。请根据我提供的 skill 元信息与结构化摘录后的 SKILL.md 内容，只输出一个 JSON 对象，不要输出 Markdown 代码块，不要解释。\n\n\
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
- 优先依据 frontmatter、触发条件、用法、场景、示例、限制来总结，不要被冗长背景说明带偏\n\
- JSON 必须合法\n\n\
Skill 目录名: {skill_dir}\n\
现有描述: {description}\n\
现有分类: {categories}\n\n\
SKILL.md 结构化摘录:\n{structured_source}",
        skill_dir = request.skill_dir,
        description = request.description,
        categories = if request.categories.is_empty() {
            "[]".to_string()
        } else {
            request.categories.join(", ")
        },
        structured_source = structured_source,
    )
}

fn build_online_skill_detail_prompt(request: &TranslateOnlineSkillDetailRequest) -> String {
    let usage = if request.detail.usage_hints.is_empty() {
        "[]".to_string()
    } else {
        request
            .detail
            .usage_hints
            .iter()
            .map(|hint| format!("- {}", hint.trim()))
            .collect::<Vec<_>>()
            .join("\n")
    };
    let skill_doc_excerpt = truncate_chars(&request.detail.skill_doc, 6000);

    format!(
        "你是一个技能详情本地化助手。请把 skills.sh 上的英文技能详情整理成简体中文，只输出合法 JSON，不要输出 Markdown 代码块或解释。\n\n\
输出字段要求：\n\
- localizedSummary: 120 到 260 个中文字符，准确介绍技能做什么、适合什么场景\n\
- localizedUsageHints: 1 到 6 条中文短句数组，每条 18 到 60 个中文字符，说明何时使用、如何触发或关键限制\n\n\
约束：\n\
- 必须用简体中文\n\
- 不要臆造技能能力\n\
- 保留原始命令、路径、产品名、协议名等技术术语\n\
- 如果原文信息不足，就基于已有内容保守总结\n\
- JSON 必须合法\n\n\
本地技能目录: {skill_dir}\n\
本地技能名称: {skill_name}\n\
线上 skillId: {skill_id}\n\
来源仓库: {source}\n\
详情页: {page_url}\n\
安装命令: {install_command}\n\n\
英文摘要:\n{summary}\n\n\
英文用法提示:\n{usage}\n\n\
SKILL.md 摘录:\n{skill_doc_excerpt}",
        skill_dir = request.skill_dir,
        skill_name = request.skill_name,
        skill_id = request.detail.skill_id,
        source = request.detail.source,
        page_url = request.detail.page_url,
        install_command = request.detail.install_command,
        summary = request.detail.summary.trim(),
        usage = usage,
        skill_doc_excerpt = skill_doc_excerpt,
    )
}

#[tauri::command]
pub async fn enrich_single_skill(
    request: EnrichSkillRequest,
) -> Result<SkillEnrichmentRecord, String> {
    let resolved_skill_path = resolve_skill_markdown_path(Path::new(&request.skill_path));
    let skill_markdown = fs::read_to_string(&resolved_skill_path)
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
        skill_path: resolved_skill_path.to_string_lossy().to_string(),
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

#[tauri::command]
pub async fn translate_online_skill_detail(
    request: TranslateOnlineSkillDetailRequest,
) -> Result<LocalizedOnlineSkillDetail, String> {
    let prompt = build_online_skill_detail_prompt(&request);
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
    let payload: OnlineSkillDetailTranslationPayload = serde_json::from_str(&json_text)
        .map_err(|error| format!("解析在线详情翻译 JSON 失败：{error}"))?;

    Ok(LocalizedOnlineSkillDetail {
        skill_dir: request.skill_dir,
        skill_name: request.skill_name,
        skill_id: request.detail.skill_id,
        source: request.detail.source,
        page_url: request.detail.page_url,
        install_command: request.detail.install_command,
        source_summary: request.detail.summary.clone(),
        source_usage_hints: request.detail.usage_hints.clone(),
        localized_summary: trim_text(payload.localized_summary, &request.detail.summary),
        localized_usage_hints: normalize_non_empty_lines(
            &payload.localized_usage_hints,
            &request.detail.usage_hints,
        ),
        provider_label: request.provider_label,
        model: request.model,
        request_kind: request.request_kind,
        translated_at: Some(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis() as u64)
                .unwrap_or(0),
        ),
        error_message: None,
    })
}

#[cfg(test)]
mod tests {
    use super::{build_skill_prompt, build_structured_skill_source, EnrichSkillRequest};
    use crate::providers::router::LlmRequestKind;

    fn request() -> EnrichSkillRequest {
        EnrichSkillRequest {
            base_url: "https://api.example.com".to_string(),
            api_key: "sk-test".to_string(),
            model: "gpt-5.4".to_string(),
            request_kind: LlmRequestKind::OpenAiChat,
            skill_dir: "demo-skill".to_string(),
            skill_path: "/tmp/demo-skill/SKILL.md".to_string(),
            description: "demo".to_string(),
            categories: vec!["tools".to_string()],
            updated_at: Some(1),
            provider_label: Some("Test".to_string()),
        }
    }

    #[test]
    fn structured_source_keeps_late_priority_sections() {
        let long_prefix = "背景说明".repeat(12_000);
        let markdown = format!(
            "---\nname: Demo Skill\ndescription: useful\n---\n\n{}\n\n## Trigger\nUse when you need exact context routing.\n\n## Usage\nRun the worker with local inputs.\n\n## Scenarios\nUse for precision-first recommendation.\n",
            long_prefix
        );

        let source = build_structured_skill_source(&markdown);
        assert!(source.contains("[Frontmatter]"));
        assert!(source.contains("## Trigger"));
        assert!(source.contains("exact context routing"));
        assert!(source.contains("## Usage"));
        assert!(source.contains("precision-first recommendation"));
    }

    #[test]
    fn prompt_uses_structured_excerpt_not_full_markdown_label() {
        let markdown = "---\nname: Demo Skill\n---\n\n## Usage\nUse this skill.\n";
        let prompt = build_skill_prompt(&request(), markdown);

        assert!(prompt.contains("SKILL.md 结构化摘录"));
        assert!(!prompt.contains("SKILL.md 全文"));
        assert!(prompt.contains("[Frontmatter]"));
        assert!(prompt.contains("## Usage"));
    }

    #[test]
    fn semantic_summary_detects_roles_from_section_content() {
        let markdown = "---\nname: Demo Skill\n---\n\n## Notes\nUse when the task needs repository search.\n\n## Guardrails\nDo not use for destructive shell commands.\n\n## Checklist\nSteps:\n1. inspect files\n2. run command\n3. verify output\n";
        let source = build_structured_skill_source(markdown);

        assert!(source.contains("[语义信号摘要]"));
        assert!(source.contains("Notes | 角色: 触发与适用"));
        assert!(source.contains("Guardrails | 角色: 场景与边界"));
        assert!(source.contains("Checklist | 角色: 用法与执行"));
        assert!(source.contains("do not use"));
        assert!(source.contains("steps"));
    }
}
