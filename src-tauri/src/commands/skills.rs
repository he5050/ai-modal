use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::time::timeout;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRecord {
    pub name: String,
    pub dir: String,
    pub description: String,
    pub version: Option<String>,
    pub updated_at: Option<u64>,
    pub categories: Vec<String>,
    pub internal: bool,
    pub path: String,
    pub has_skill_file: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsCatalogSnapshot {
    pub source_dir: String,
    pub scanned_at: Option<u64>,
    pub total_skills: usize,
    pub skills: Vec<SkillRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillTargetInput {
    pub id: String,
    pub label: String,
    pub path: String,
    pub is_builtin: bool,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillTargetStatus {
    pub id: String,
    pub label: String,
    pub path: String,
    pub exists: bool,
    pub managed_count: usize,
    pub broken_count: usize,
    pub total_entries: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSkillTargetResult {
    pub id: String,
    pub label: String,
    pub path: String,
    pub created_dir: bool,
    pub kept_count: usize,
    pub linked_count: usize,
    pub replaced_count: usize,
    pub backed_up_count: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SkillsCommandAction {
    Add,
    Update,
    Remove,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsCommandRequest {
    pub action: SkillsCommandAction,
    pub source: Option<String>,
    #[serde(default)]
    pub skill_names: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsCommandResult {
    pub action: SkillsCommandAction,
    pub command: Vec<String>,
    pub cwd: String,
    pub success: bool,
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
    pub catalog_refreshed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsCommandProgressEvent {
    pub action: SkillsCommandAction,
    pub stage: String,
    pub message: String,
    pub current: Option<usize>,
    pub total: Option<usize>,
    pub skill_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineSkill {
    pub id: String,
    pub name: String,
    pub installs: i64,
    pub skill_id: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOnlineResult {
    pub count: i64,
    pub duration_ms: i64,
    pub skills: Vec<OnlineSkill>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineSkillDetail {
    pub id: String,
    pub skill_id: String,
    pub source: String,
    pub page_url: String,
    pub install_command: String,
    pub summary: String,
    pub usage_hints: Vec<String>,
    pub skill_doc: String,
}

#[derive(Debug, Clone, Deserialize)]
struct ApiSkill {
    id: String,
    #[serde(rename = "skillId")]
    skill_id: String,
    name: String,
    installs: i64,
    source: String,
}

#[derive(Debug, Clone, Deserialize)]
struct ApiResponse {
    skills: Vec<ApiSkill>,
    count: i64,
    #[serde(rename = "duration_ms")]
    duration_ms: i64,
}

impl ApiSkill {
    fn into_online_skill(self) -> OnlineSkill {
        OnlineSkill {
            id: self.id,
            skill_id: self.skill_id,
            name: self.name,
            installs: self.installs,
            source: self.source,
        }
    }
}

fn online_skill_page_url(source: &str, skill_id: &str) -> String {
    format!(
        "https://skills.sh/{}/{}",
        source.trim_matches('/'),
        skill_id.trim_matches('/')
    )
}

fn online_skill_install_command(source: &str, skill_id: &str) -> String {
    format!(
        "npx skills add https://github.com/{} --skill {}",
        source.trim_matches('/'),
        skill_id.trim()
    )
}

fn extract_between<'a>(text: &'a str, start_marker: &str, end_marker: &str) -> Option<&'a str> {
    let start = text.find(start_marker)? + start_marker.len();
    let tail = &text[start..];
    let end = tail.find(end_marker)?;
    Some(&tail[..end])
}

fn decode_html_entities(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut result = String::with_capacity(value.len());
    let mut index = 0;

    while index < chars.len() {
        if chars[index] == '&' {
            if let Some(relative_end) = chars[index + 1..]
                .iter()
                .position(|ch| *ch == ';')
                .filter(|pos| *pos <= 10)
            {
                let end = index + 1 + relative_end;
                let entity: String = chars[index + 1..end].iter().collect();
                let decoded = match entity.as_str() {
                    "amp" => Some('&'),
                    "lt" => Some('<'),
                    "gt" => Some('>'),
                    "quot" => Some('"'),
                    "apos" => Some('\''),
                    "nbsp" => Some(' '),
                    "#39" | "#x27" | "#X27" => Some('\''),
                    "#47" | "#x2F" | "#x2f" => Some('/'),
                    _ if entity.starts_with("#x") || entity.starts_with("#X") => {
                        u32::from_str_radix(&entity[2..], 16)
                            .ok()
                            .and_then(char::from_u32)
                    }
                    _ if entity.starts_with('#') => {
                        entity[1..].parse::<u32>().ok().and_then(char::from_u32)
                    }
                    _ => None,
                };

                if let Some(decoded_char) = decoded {
                    result.push(decoded_char);
                    index = end + 1;
                    continue;
                }
            }
        }

        result.push(chars[index]);
        index += 1;
    }

    result
}

fn html_fragment_to_text(fragment: &str) -> String {
    let chars: Vec<char> = fragment.chars().collect();
    let mut result = String::with_capacity(fragment.len());
    let mut index = 0;

    while index < chars.len() {
        if chars[index] == '<' {
            let Some(relative_end) = chars[index + 1..].iter().position(|ch| *ch == '>') else {
                break;
            };
            let end = index + 1 + relative_end;
            let raw_tag: String = chars[index + 1..end].iter().collect();
            let trimmed = raw_tag.trim();
            let is_closing = trimmed.starts_with('/');
            let name = trimmed
                .trim_start_matches('/')
                .split_whitespace()
                .next()
                .unwrap_or("")
                .to_ascii_lowercase();

            match name.as_str() {
                "br" => result.push('\n'),
                "p" | "div" | "section" | "ul" | "ol" | "h1" | "h2" | "h3" | "h4" | "pre"
                    if is_closing =>
                {
                    result.push('\n');
                }
                "li" if !is_closing => {
                    if !result.ends_with('\n') {
                        result.push('\n');
                    }
                    result.push_str("- ");
                }
                "li" => result.push('\n'),
                _ => {}
            }

            index = end + 1;
            continue;
        }

        result.push(chars[index]);
        index += 1;
    }

    let decoded = decode_html_entities(&result);
    decoded
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn extract_usage_hints(summary: &str, skill_doc: &str) -> Vec<String> {
    let mut hints = Vec::new();
    let trigger_keywords = [
        "use this skill when",
        "use when",
        "triggers",
        "trigger when",
        "use for",
        "user asks",
    ];

    for line in skill_doc
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        let lower = line.to_ascii_lowercase();
        if trigger_keywords
            .iter()
            .any(|keyword| lower.contains(keyword))
        {
            hints.push(line.to_string());
        }
        if hints.len() >= 4 {
            break;
        }
    }

    if hints.is_empty() {
        hints.extend(
            summary
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .take(3)
                .map(ToString::to_string),
        );
    }

    hints
}

fn home_dir() -> Result<PathBuf, String> {
    env::var("HOME")
        .map(PathBuf::from)
        .map_err(|_| "无法读取 HOME 目录".to_string())
}

fn skills_source_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".agents").join("skills"))
}

fn update_catalogs_path() -> Result<PathBuf, String> {
    Ok(home_dir()?
        .join(".agents")
        .join("bin")
        .join("update-catalogs"))
}

fn now_epoch_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn sanitize_update_catalogs_stderr(stderr: &str) -> String {
    stderr
        .lines()
        .filter(|line| !line.contains("未配置 API Key，跳过 AI 丰富处理"))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn strip_ansi_sequences(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let mut chars = value.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            if matches!(chars.peek(), Some('[')) {
                chars.next();
                while let Some(next) = chars.next() {
                    if ('@'..='~').contains(&next) {
                        break;
                    }
                }
                continue;
            }
        }
        result.push(ch);
    }

    result
}

fn parse_skills_progress_line(line: &str) -> Option<(usize, usize, String)> {
    let prefix = "Checking global skill ";
    let suffix = ": ";
    let body = line.trim();
    let rest = body.strip_prefix(prefix)?;
    let (counts, skill_name) = rest.split_once(suffix)?;
    let (current, total) = counts.split_once('/')?;

    Some((
        current.trim().parse().ok()?,
        total.trim().parse().ok()?,
        skill_name.trim().to_string(),
    ))
}

fn emit_skills_progress(
    app: &AppHandle,
    payload: SkillsCommandProgressEvent,
) -> Result<(), String> {
    app.emit("skills-command-progress", payload)
        .map_err(|error| format!("发送技能进度事件失败：{error}"))
}

fn is_hidden_name(name: &str) -> bool {
    name.starts_with('.')
}

fn normalize_source_input(source: &str, home: &Path) -> String {
    let trimmed = source.trim();
    if let Some(stripped) = trimmed.strip_prefix("~/") {
        return home.join(stripped).to_string_lossy().to_string();
    }
    trimmed.to_string()
}

fn source_is_single_skill(source: &str, home: &Path) -> bool {
    let normalized = normalize_source_input(source, home);
    let path = PathBuf::from(&normalized);
    if path.is_absolute() {
        // 如果路径本身有 SKILL.md，视为单技能
        if path.join("SKILL.md").exists() {
            return true;
        }
        // 检查是否包含多个子技能目录
        return count_skill_subdirs(&path) <= 1;
    }

    normalized.contains("/tree/") && normalized.contains("/skills/")
}

/// 统计路径下包含 SKILL.md 的子目录数量
fn count_skill_subdirs(path: &Path) -> usize {
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                let dir_name = entry.file_name().to_string_lossy().to_string();
                if dir_name.starts_with('.') {
                    continue;
                }
                if entry_path.join("SKILL.md").exists() {
                    count += 1;
                }
            }
        }
    }
    count
}

fn source_needs_wildcard(source: &str, home: &Path) -> bool {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return false;
    }
    // GitHub URL 需要通配符（除非是单技能 tree 链接）
    if !trimmed.starts_with('/') && !trimmed.starts_with("~/") {
        return !trimmed.contains("/tree/") || !trimmed.contains("/skills/");
    }
    // 本地路径：检查是否为多技能目录
    let normalized = normalize_source_input(trimmed, home);
    let path = PathBuf::from(&normalized);
    if path.exists() && path.is_dir() {
        // 如果目录本身没有 SKILL.md 但有多个子技能，需要通配符
        if !path.join("SKILL.md").exists() && count_skill_subdirs(&path) > 1 {
            return true;
        }
    }
    false
}

fn build_skills_command(
    request: &SkillsCommandRequest,
    home: &Path,
) -> Result<Vec<String>, String> {
    let mut command = vec!["npx".to_string(), "-y".to_string(), "skills".to_string()];

    match request.action {
        SkillsCommandAction::Add => {
            let source = request
                .source
                .as_ref()
                .map(|value| normalize_source_input(value, home))
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "缺少安装来源".to_string())?;
            command.push("add".to_string());
            command.push(source.clone());
            command.push("--agent".to_string());
            command.push("*".to_string());
            command.push("-g".to_string());

            let names = request.skill_names.clone().unwrap_or_default();
            if names.is_empty() {
                if source_needs_wildcard(&source, home) && !source_is_single_skill(&source, home) {
                    command.push("--skill".to_string());
                    command.push("*".to_string());
                }
            } else {
                for name in names {
                    command.push("--skill".to_string());
                    command.push(name);
                }
            }
            command.push("-y".to_string());
        }
        SkillsCommandAction::Update => {
            command.push("update".to_string());
            let names = request.skill_names.clone().unwrap_or_default();
            for name in names {
                command.push(name);
            }
            command.push("-g".to_string());
            command.push("-y".to_string());
        }
        SkillsCommandAction::Remove => {
            let names = request.skill_names.clone().unwrap_or_default();
            if names.is_empty() {
                return Err("缺少要移除的技能名".to_string());
            }
            command.push("remove".to_string());
            for name in names {
                command.push(name);
            }
            command.push("-g".to_string());
            command.push("-y".to_string());
        }
    }

    Ok(command)
}

fn parse_frontmatter(path: &Path) -> (String, String, Option<String>, Vec<String>, bool) {
    let text = fs::read_to_string(path).unwrap_or_default();

    // Find YAML frontmatter between --- markers
    let mut lines = text.lines();
    if lines.next().map(str::trim) != Some("---") {
        return (
            path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default(),
            String::new(),
            None,
            Vec::new(),
            false,
        );
    }

    let mut frontmatter_lines = Vec::new();
    for line in lines {
        let trimmed = line.trim();
        if trimmed == "---" {
            break;
        }
        frontmatter_lines.push(line.to_string());
    }

    if frontmatter_lines.is_empty() {
        return (
            path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default(),
            String::new(),
            None,
            Vec::new(),
            false,
        );
    }

    let yaml_content = frontmatter_lines.join("\n");

    // Parse YAML using serde_yaml
    match serde_yaml::from_str::<serde_yaml::Value>(&yaml_content) {
        Ok(value) => {
            let name = value
                .get("name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| {
                    path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default()
                });

            let description = value
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_default();

            let version = value
                .get("version")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .filter(|s| !s.is_empty());

            let mut categories = Vec::new();

            // Parse category/tags
            if let Some(cat) = value.get("category") {
                if let Some(s) = cat.as_str() {
                    categories.extend(
                        s.split(',')
                            .map(|x| x.trim().to_string())
                            .filter(|x| !x.is_empty()),
                    );
                } else if let Some(arr) = cat.as_sequence() {
                    categories.extend(arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())));
                }
            }

            if let Some(tags) = value.get("tags") {
                if let Some(arr) = tags.as_sequence() {
                    categories.extend(arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())));
                }
            }

            // Check for internal flag
            let internal = value
                .get("metadata")
                .and_then(|v| v.as_str())
                .map(|s| s.contains("internal"))
                .unwrap_or(false)
                || value
                    .get("user-invokable")
                    .and_then(|v| v.as_bool())
                    .map(|b| !b)
                    .unwrap_or(false);

            categories.sort();
            categories.dedup();

            (name, description, version, categories, internal)
        }
        Err(_) => {
            // Fallback: use directory name if YAML parsing fails
            (
                path.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
                String::new(),
                None,
                Vec::new(),
                false,
            )
        }
    }
}

fn system_time_to_epoch_ms(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

fn latest_modified_in_tree(path: &Path) -> Option<u64> {
    let mut latest = fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(system_time_to_epoch_ms);

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let entry_latest = if entry_path.is_dir() {
                latest_modified_in_tree(&entry_path)
            } else {
                fs::metadata(&entry_path)
                    .ok()
                    .and_then(|metadata| metadata.modified().ok())
                    .and_then(system_time_to_epoch_ms)
            };

            if let Some(value) = entry_latest {
                latest = Some(latest.map_or(value, |current| current.max(value)));
            }
        }
    }

    latest
}

fn collect_local_skills() -> Result<SkillsCatalogSnapshot, String> {
    let source_dir = skills_source_dir()?;
    if !source_dir.exists() {
        return Ok(SkillsCatalogSnapshot {
            source_dir: source_dir.to_string_lossy().to_string(),
            scanned_at: Some(now_epoch_ms() as u64),
            total_skills: 0,
            skills: vec![],
        });
    }

    let mut skills = vec![];
    let entries =
        fs::read_dir(&source_dir).map_err(|error| format!("读取技能目录失败：{error}"))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("读取技能目录条目失败：{error}"))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dir_name = entry.file_name().to_string_lossy().to_string();
        if is_hidden_name(&dir_name) {
            continue;
        }

        let skill_file = path.join("SKILL.md");
        if !skill_file.exists() {
            continue;
        }

        let fallback = parse_frontmatter(&skill_file);
        let name = if fallback.0.is_empty() {
            dir_name.clone()
        } else {
            fallback.0.clone()
        };
        let description = fallback.1.clone();
        let version = fallback.2.clone();
        let categories = fallback.3.clone();
        let internal = fallback.4;
        let updated_at = latest_modified_in_tree(&path);

        skills.push(SkillRecord {
            name,
            dir: dir_name,
            description,
            version,
            updated_at,
            categories,
            internal,
            path: path.to_string_lossy().to_string(),
            has_skill_file: true,
        });
    }

    skills.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(SkillsCatalogSnapshot {
        source_dir: source_dir.to_string_lossy().to_string(),
        scanned_at: Some(now_epoch_ms() as u64),
        total_skills: skills.len(),
        skills,
    })
}

fn resolve_symlink_target(path: &Path) -> Result<PathBuf, String> {
    let raw = fs::read_link(path).map_err(|error| format!("读取软连接失败：{error}"))?;
    if raw.is_absolute() {
        return Ok(raw);
    }

    Ok(path.parent().unwrap_or_else(|| Path::new("/")).join(raw))
}

fn paths_equal(left: &Path, right: &Path) -> bool {
    left == right
        || left
            .canonicalize()
            .ok()
            .zip(right.canonicalize().ok())
            .map(|(a, b)| a == b)
            .unwrap_or(false)
}

fn create_dir_symlink(source: &Path, target: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(source, target)
            .map_err(|error| format!("创建软连接失败：{error}"))
    }

    #[cfg(windows)]
    {
        std::os::windows::fs::symlink_dir(source, target)
            .map_err(|error| format!("创建软连接失败：{error}"))
    }
}

fn unique_backup_path(base_dir: &Path, name: &str) -> PathBuf {
    let mut candidate = base_dir.join(name);
    let mut index = 1usize;
    while candidate.exists() {
        candidate = base_dir.join(format!("{name}-{index}"));
        index += 1;
    }
    candidate
}

async fn refresh_catalog_files() -> Result<(String, String, i32), String> {
    let script = update_catalogs_path()?;
    if !script.exists() {
        return Err("未找到 update-catalogs 脚本".to_string());
    }

    let home = home_dir()?;
    let output = timeout(
        Duration::from_secs(120),
        Command::new(&script)
            .arg("--force")
            .current_dir(&home)
            .output(),
    )
    .await
    .map_err(|_| "刷新 skills.md 超时".to_string())?
    .map_err(|error| format!("执行 update-catalogs 失败：{error}"))?;

    Ok((
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
        output.status.code().unwrap_or(-1),
    ))
}

#[tauri::command]
pub async fn scan_local_skills() -> Result<SkillsCatalogSnapshot, String> {
    collect_local_skills()
}

#[tauri::command]
pub async fn inspect_skill_targets(
    targets: Vec<SkillTargetInput>,
) -> Result<Vec<SkillTargetStatus>, String> {
    let source_dir = skills_source_dir()?;
    let skills = collect_local_skills()?.skills;

    let statuses = targets
        .into_iter()
        .map(|target| {
            let target_path = PathBuf::from(&target.path);
            if !target_path.exists() {
                return SkillTargetStatus {
                    id: target.id,
                    label: target.label,
                    path: target.path,
                    exists: false,
                    managed_count: 0,
                    broken_count: 0,
                    total_entries: 0,
                };
            }

            let mut managed_count = 0usize;
            let mut broken_count = 0usize;
            let mut total_entries = 0usize;

            if let Ok(entries) = fs::read_dir(&target_path) {
                for entry in entries.flatten() {
                    total_entries += 1;
                    let entry_path = entry.path();
                    let entry_name = entry.file_name().to_string_lossy().to_string();
                    if !skills.iter().any(|skill| skill.dir == entry_name) {
                        continue;
                    }

                    if let Ok(metadata) = fs::symlink_metadata(&entry_path) {
                        if metadata.file_type().is_symlink() {
                            if let Ok(resolved) = resolve_symlink_target(&entry_path) {
                                // Exact match: resolved path should be source_dir/skill_dir
                                let expected_source = source_dir.join(&entry_name);
                                if paths_equal(&resolved, &expected_source) {
                                    managed_count += 1;
                                    if !resolved.exists() {
                                        broken_count += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            SkillTargetStatus {
                id: target.id,
                label: target.label,
                path: target.path,
                exists: true,
                managed_count,
                broken_count,
                total_entries,
            }
        })
        .collect::<Vec<_>>();

    Ok(statuses)
}

/// 清理旧备份目录，保留最新的 max_keep 个
fn cleanup_old_backups(target_path: &Path, max_keep: usize) {
    let backup_root = target_path.join(".sync-backups");
    if !backup_root.exists() {
        return;
    }

    let mut backups = Vec::new();
    if let Ok(entries) = fs::read_dir(&backup_root) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                // 只清理 skills-<timestamp> 格式的目录
                if name.starts_with("skills-") {
                    if let Ok(metadata) = fs::metadata(&entry_path) {
                        if let Ok(modified) = metadata.modified() {
                            backups.push((entry_path, modified));
                        }
                    }
                }
            }
        }
    }

    // 按修改时间降序排序
    backups.sort_by(|a, b| b.1.cmp(&a.1));

    // 删除超出保留数量的备份
    if backups.len() > max_keep {
        for (path, _) in backups.iter().skip(max_keep) {
            let _ = fs::remove_dir_all(path);
        }
    }
}

#[tauri::command]
pub async fn sync_skill_targets(
    targets: Vec<SkillTargetInput>,
) -> Result<Vec<SyncSkillTargetResult>, String> {
    let source_dir = skills_source_dir()?;
    let skills = collect_local_skills()?.skills;
    if skills.is_empty() {
        return Err("~/.agents/skills 当前没有可分发的技能".to_string());
    }

    let mut summaries = vec![];

    for target in targets.into_iter().filter(|item| item.enabled) {
        let target_path = PathBuf::from(&target.path);
        if paths_equal(&target_path, &source_dir) {
            summaries.push(SyncSkillTargetResult {
                id: target.id,
                label: target.label,
                path: target.path,
                created_dir: false,
                kept_count: 0,
                linked_count: 0,
                replaced_count: 0,
                backed_up_count: 0,
                errors: vec!["目标目录不能与 ~/.agents/skills 相同".to_string()],
            });
            continue;
        }

        let mut created_dir = false;
        let mut kept_count = 0usize;
        let mut linked_count = 0usize;
        let mut replaced_count = 0usize;
        let mut backed_up_count = 0usize;
        let mut errors = vec![];

        if !target_path.exists() {
            if let Err(error) = fs::create_dir_all(&target_path) {
                summaries.push(SyncSkillTargetResult {
                    id: target.id,
                    label: target.label,
                    path: target.path,
                    created_dir: false,
                    kept_count: 0,
                    linked_count: 0,
                    replaced_count: 0,
                    backed_up_count: 0,
                    errors: vec![format!("创建目标目录失败：{error}")],
                });
                continue;
            }
            created_dir = true;
        }

        let backup_root = target_path
            .join(".sync-backups")
            .join(format!("skills-{}", now_epoch_ms()));

        // Clean up old backups (keep only last 5)
        cleanup_old_backups(&target_path, 5);

        for skill in &skills {
            let source_path = source_dir.join(&skill.dir);
            let target_skill_path = target_path.join(&skill.dir);
            let mut had_conflict = false;

            if target_skill_path.exists() {
                match fs::symlink_metadata(&target_skill_path) {
                    Ok(metadata) if metadata.file_type().is_symlink() => {
                        match resolve_symlink_target(&target_skill_path) {
                            Ok(resolved) if paths_equal(&resolved, &source_path) => {
                                kept_count += 1;
                                continue;
                            }
                            Ok(_) | Err(_) => {
                                had_conflict = true;
                            }
                        }
                    }
                    Ok(_) => {
                        had_conflict = true;
                    }
                    Err(error) => {
                        errors.push(format!("读取目标项失败：{} ({error})", skill.dir));
                        continue;
                    }
                }
            }

            if had_conflict {
                if let Err(error) = fs::create_dir_all(&backup_root) {
                    errors.push(format!("创建备份目录失败：{error}"));
                    continue;
                }
                let backup_path = unique_backup_path(&backup_root, &skill.dir);
                if let Err(error) = fs::rename(&target_skill_path, &backup_path) {
                    errors.push(format!("备份冲突目标失败：{} ({error})", skill.dir));
                    continue;
                }
                backed_up_count += 1;
            }

            if let Err(error) = create_dir_symlink(&source_path, &target_skill_path) {
                errors.push(format!("创建软连接失败：{} ({error})", skill.dir));
                continue;
            }

            if had_conflict {
                replaced_count += 1;
            } else {
                linked_count += 1;
            }
        }

        // Clean up orphaned symlinks (skills that no longer exist in source)
        let mut _cleaned_count = 0usize;
        if let Ok(entries) = fs::read_dir(&target_path) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                let entry_name = entry.file_name().to_string_lossy().to_string();

                // Skip hidden files and backup directory
                if entry_name.starts_with('.') {
                    continue;
                }

                // Check if this is a symlink to a skill that no longer exists in source
                if let Ok(metadata) = fs::symlink_metadata(&entry_path) {
                    if metadata.file_type().is_symlink() {
                        // Check if this skill exists in source
                        if !skills.iter().any(|s| s.dir == entry_name) {
                            // This is an orphaned symlink, clean it up
                            if let Err(error) = fs::remove_file(&entry_path) {
                                errors.push(format!("清理孤立链接失败：{} ({error})", entry_name));
                            } else {
                                _cleaned_count += 1;
                            }
                        }
                    }
                }
            }
        }

        summaries.push(SyncSkillTargetResult {
            id: target.id,
            label: target.label,
            path: target.path,
            created_dir,
            kept_count,
            linked_count,
            replaced_count,
            backed_up_count,
            errors,
        });
    }

    Ok(summaries)
}

#[tauri::command]
pub async fn run_skills_command(
    app: AppHandle,
    request: SkillsCommandRequest,
) -> Result<SkillsCommandResult, String> {
    let home = home_dir()?;
    let cwd = home.to_string_lossy().to_string();
    let command = build_skills_command(&request, &home)?;

    let mut child = Command::new(&command[0])
        .args(&command[1..])
        .current_dir(&home)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("执行 npx skills 失败：{error}"))?;

    let mut stdout_reader = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 npx skills stdout".to_string())?;
    let mut stderr_reader = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取 npx skills stderr".to_string())?;

    let stdout_app = app.clone();
    let stdout_action = request.action.clone();
    let stdout_task = tokio::spawn(async move {
        let mut collected = Vec::new();
        let mut chunk = [0u8; 4096];
        let mut pending = String::new();
        let mut last_progress: Option<(usize, usize, String)> = None;
        let mut started = false;

        loop {
            let bytes_read = stdout_reader
                .read(&mut chunk)
                .await
                .map_err(|error| format!("读取 npx skills stdout 失败：{error}"))?;
            if bytes_read == 0 {
                break;
            }

            collected.extend_from_slice(&chunk[..bytes_read]);
            let text = String::from_utf8_lossy(&chunk[..bytes_read]);
            pending.push_str(&text);

            let sanitized = strip_ansi_sequences(&pending);
            if !started && sanitized.contains("Checking for skill updates...") {
                started = true;
                emit_skills_progress(
                    &stdout_app,
                    SkillsCommandProgressEvent {
                        action: stdout_action.clone(),
                        stage: "checking".to_string(),
                        message: "正在检查全局技能更新...".to_string(),
                        current: Some(0),
                        total: None,
                        skill_name: None,
                    },
                )?;
            }

            for segment in sanitized.split(['\r', '\n']) {
                if let Some((current, total, skill_name)) = parse_skills_progress_line(segment) {
                    let next_progress = (current, total, skill_name.clone());
                    if last_progress.as_ref() != Some(&next_progress) {
                        last_progress = Some(next_progress.clone());
                        emit_skills_progress(
                            &stdout_app,
                            SkillsCommandProgressEvent {
                                action: stdout_action.clone(),
                                stage: "checking".to_string(),
                                message: format!("正在检查 {current} / {total}：{skill_name}"),
                                current: Some(current),
                                total: Some(total),
                                skill_name: Some(skill_name),
                            },
                        )?;
                    }
                } else if segment.contains("All global skills are up to date") {
                    emit_skills_progress(
                        &stdout_app,
                        SkillsCommandProgressEvent {
                            action: stdout_action.clone(),
                            stage: "checked".to_string(),
                            message: "全局技能已检查完成，均为最新版本".to_string(),
                            current: last_progress.as_ref().map(|item| item.1),
                            total: last_progress.as_ref().map(|item| item.1),
                            skill_name: None,
                        },
                    )?;
                }
            }

            let tail = sanitized
                .rsplit(['\r', '\n'])
                .next()
                .unwrap_or_default()
                .to_string();
            pending = tail;
        }

        Ok::<String, String>(String::from_utf8_lossy(&collected).to_string())
    });

    let stderr_task = tokio::spawn(async move {
        let mut collected = Vec::new();
        let mut chunk = [0u8; 4096];

        loop {
            let bytes_read = stderr_reader
                .read(&mut chunk)
                .await
                .map_err(|error| format!("读取 npx skills stderr 失败：{error}"))?;
            if bytes_read == 0 {
                break;
            }
            collected.extend_from_slice(&chunk[..bytes_read]);
        }

        Ok::<String, String>(String::from_utf8_lossy(&collected).to_string())
    });

    let status = timeout(Duration::from_secs(120), child.wait())
        .await
        .map_err(|_| "执行 npx skills 超时".to_string())?
        .map_err(|error| format!("执行 npx skills 失败：{error}"))?;

    let mut stdout = stdout_task
        .await
        .map_err(|error| format!("等待 npx skills stdout 失败：{error}"))??;
    let mut stderr = stderr_task
        .await
        .map_err(|error| format!("等待 npx skills stderr 失败：{error}"))??;
    let mut catalog_refreshed = false;
    let code = status.code().unwrap_or(-1);

    if status.success() {
        if let Ok((refresh_stdout, refresh_stderr, refresh_code)) = refresh_catalog_files().await {
            catalog_refreshed = refresh_code == 0;
            if !refresh_stdout.trim().is_empty() {
                if !stdout.trim().is_empty() {
                    stdout.push_str("\n\n");
                }
                stdout.push_str("[update-catalogs]\n");
                stdout.push_str(&refresh_stdout);
            }
            let refresh_stderr = sanitize_update_catalogs_stderr(&refresh_stderr);
            if !refresh_stderr.trim().is_empty() {
                if !stderr.trim().is_empty() {
                    stderr.push_str("\n\n");
                }
                stderr.push_str("[update-catalogs]\n");
                stderr.push_str(&refresh_stderr);
            }
        }
    }

    Ok(SkillsCommandResult {
        action: request.action,
        command,
        cwd,
        success: status.success(),
        code,
        stdout,
        stderr,
        catalog_refreshed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn build_update_command_is_explicitly_global_and_non_interactive() {
        let request = SkillsCommandRequest {
            action: SkillsCommandAction::Update,
            source: None,
            skill_names: None,
        };

        let command = build_skills_command(&request, Path::new("/Users/test")).unwrap();

        assert_eq!(
            command,
            vec![
                "npx".to_string(),
                "-y".to_string(),
                "skills".to_string(),
                "update".to_string(),
                "-g".to_string(),
                "-y".to_string(),
            ]
        );
    }

    #[test]
    fn build_update_command_accepts_explicit_skill_names() {
        let request = SkillsCommandRequest {
            action: SkillsCommandAction::Update,
            source: None,
            skill_names: Some(vec!["demo-skill".to_string(), "docx".to_string()]),
        };

        let command = build_skills_command(&request, Path::new("/Users/test")).unwrap();

        assert_eq!(
            command,
            vec![
                "npx".to_string(),
                "-y".to_string(),
                "skills".to_string(),
                "update".to_string(),
                "demo-skill".to_string(),
                "docx".to_string(),
                "-g".to_string(),
                "-y".to_string(),
            ]
        );
    }

    #[test]
    fn build_add_command_for_single_skill_keeps_explicit_skill_name() {
        let request = SkillsCommandRequest {
            action: SkillsCommandAction::Add,
            source: Some("https://github.com/example/repo".to_string()),
            skill_names: Some(vec!["demo-skill".to_string()]),
        };

        let command = build_skills_command(&request, Path::new("/Users/test")).unwrap();

        assert_eq!(
            command,
            vec![
                "npx".to_string(),
                "-y".to_string(),
                "skills".to_string(),
                "add".to_string(),
                "https://github.com/example/repo".to_string(),
                "--agent".to_string(),
                "*".to_string(),
                "-g".to_string(),
                "--skill".to_string(),
                "demo-skill".to_string(),
                "-y".to_string(),
            ]
        );
    }

    #[test]
    fn build_remove_command_requires_skill_names() {
        let request = SkillsCommandRequest {
            action: SkillsCommandAction::Remove,
            source: None,
            skill_names: None,
        };

        let error = build_skills_command(&request, Path::new("/Users/test")).unwrap_err();

        assert_eq!(error, "缺少要移除的技能名");
    }

    #[test]
    fn build_remove_command_targets_global_scope() {
        let request = SkillsCommandRequest {
            action: SkillsCommandAction::Remove,
            source: None,
            skill_names: Some(vec!["demo-skill".to_string()]),
        };

        let command = build_skills_command(&request, Path::new("/Users/test")).unwrap();

        assert_eq!(
            command,
            vec![
                "npx".to_string(),
                "-y".to_string(),
                "skills".to_string(),
                "remove".to_string(),
                "demo-skill".to_string(),
                "-g".to_string(),
                "-y".to_string(),
            ]
        );
    }

    #[test]
    fn normalize_source_input_expands_tilde_paths() {
        let home = Path::new("/Users/tester");

        let normalized = normalize_source_input("~/skills/demo", home);

        assert_eq!(normalized, "/Users/tester/skills/demo");
    }

    #[test]
    fn source_needs_wildcard_for_multi_skill_local_directory() {
        let temp = tempdir().unwrap();
        let multi_dir = temp.path().join("bundle");
        fs::create_dir_all(multi_dir.join("skill-a")).unwrap();
        fs::create_dir_all(multi_dir.join("skill-b")).unwrap();
        fs::write(
            multi_dir.join("skill-a").join("SKILL.md"),
            "---\nname: A\n---\n",
        )
        .unwrap();
        fs::write(
            multi_dir.join("skill-b").join("SKILL.md"),
            "---\nname: B\n---\n",
        )
        .unwrap();

        assert!(source_needs_wildcard(
            multi_dir.to_string_lossy().as_ref(),
            Path::new("/Users/test")
        ));
        assert!(!source_is_single_skill(
            multi_dir.to_string_lossy().as_ref(),
            Path::new("/Users/test")
        ));
    }

    #[test]
    fn source_does_not_need_wildcard_for_single_skill_local_directory() {
        let temp = tempdir().unwrap();
        let skill_dir = temp.path().join("single-skill");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(skill_dir.join("SKILL.md"), "---\nname: Single\n---\n").unwrap();

        assert!(!source_needs_wildcard(
            skill_dir.to_string_lossy().as_ref(),
            Path::new("/Users/test")
        ));
        assert!(source_is_single_skill(
            skill_dir.to_string_lossy().as_ref(),
            Path::new("/Users/test")
        ));
    }

    #[test]
    fn parse_frontmatter_extracts_name_description_version_and_tags() {
        let temp = tempdir().unwrap();
        let skill_file = temp.path().join("SKILL.md");
        fs::write(
            &skill_file,
            "---\nname: Demo Skill\ndescription: useful skill\nversion: 1.2.3\ntags:\n  - tools\n  - local\n---\ncontent\n",
        )
        .unwrap();

        let parsed = parse_frontmatter(&skill_file);

        assert_eq!(parsed.0, "Demo Skill");
        assert_eq!(parsed.1, "useful skill");
        assert_eq!(parsed.2, Some("1.2.3".to_string()));
        assert_eq!(parsed.3, vec!["local".to_string(), "tools".to_string()]);
        assert!(!parsed.4);
    }

    #[test]
    fn html_fragment_to_text_preserves_summary_lines() {
        let fragment = r#"
        <div class="prose">
          <p><strong>Distinctive interfaces.</strong></p>
          <ul>
            <li>Bold typography</li>
            <li>Memorable motion</li>
          </ul>
        </div>
        "#;

        let parsed = html_fragment_to_text(fragment);

        assert_eq!(
            parsed,
            "Distinctive interfaces.\n- Bold typography\n- Memorable motion"
        );
    }

    #[test]
    fn extract_usage_hints_prefers_trigger_lines() {
        let hints = extract_usage_hints(
            "Summary line",
            "Intro\nUse this skill when building production interfaces.\nTriggers: landing pages, dashboards\nOther line",
        );

        assert_eq!(
            hints,
            vec![
                "Use this skill when building production interfaces.".to_string(),
                "Triggers: landing pages, dashboards".to_string()
            ]
        );
    }
}

#[tauri::command]
pub async fn search_online_skills(
    query: String,
    limit: Option<u32>,
    source: Option<String>,
) -> Result<SearchOnlineResult, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client 创建失败：{e}"))?;

    let limit = limit.unwrap_or(20).min(100);
    let url = {
        let base = format!(
            "https://skills.sh/api/search?q={}&limit={}",
            utf8_percent_encode(&query, NON_ALPHANUMERIC),
            limit
        );
        if let Some(ref src) = source {
            format!(
                "{}&source={}",
                base,
                utf8_percent_encode(src, NON_ALPHANUMERIC)
            )
        } else {
            base
        }
    };

    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("skills.sh API 请求失败：{e}"))?;

    if resp.status() == 401 || resp.status() == 403 {
        return Err("skills.sh API 需要认证，请检查网络".to_string());
    }

    if !resp.status().is_success() {
        return Err(format!("skills.sh API 返回错误：{}", resp.status()));
    }

    let api_resp: ApiResponse = resp
        .json()
        .await
        .map_err(|e| format!("解析 API 响应失败：{e}"))?;

    Ok(SearchOnlineResult {
        skills: api_resp
            .skills
            .into_iter()
            .map(ApiSkill::into_online_skill)
            .collect(),
        count: api_resp.count,
        duration_ms: api_resp.duration_ms,
    })
}

#[tauri::command]
pub async fn inspect_online_skill(
    skill_id: String,
    source: String,
) -> Result<OnlineSkillDetail, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client 创建失败：{e}"))?;

    let page_url = online_skill_page_url(&source, &skill_id);
    let resp = client
        .get(&page_url)
        .header("Accept", "text/html")
        .send()
        .await
        .map_err(|e| format!("skills.sh 详情页请求失败：{e}"))?;

    if !resp.status().is_success() {
        return Err(format!("skills.sh 详情页返回错误：{}", resp.status()));
    }

    let html = resp
        .text()
        .await
        .map_err(|e| format!("读取 skills.sh 详情页失败：{e}"))?;

    let summary_fragment = extract_between(&html, ">Summary</div>", ">SKILL.md</span></div>")
        .ok_or_else(|| "无法解析 skills.sh 详情页中的 Summary".to_string())?;
    let skill_doc_fragment = extract_between(&html, ">SKILL.md</span></div>", ">Weekly Installs<")
        .ok_or_else(|| "无法解析 skills.sh 详情页中的 SKILL.md".to_string())?;

    let summary = html_fragment_to_text(summary_fragment);
    let skill_doc = html_fragment_to_text(skill_doc_fragment);
    let usage_hints = extract_usage_hints(&summary, &skill_doc);

    Ok(OnlineSkillDetail {
        id: format!(
            "{}/{}",
            source.trim_matches('/'),
            skill_id.trim_matches('/')
        ),
        skill_id: skill_id.clone(),
        source: source.clone(),
        page_url,
        install_command: online_skill_install_command(&source, &skill_id),
        summary,
        usage_hints,
        skill_doc,
    })
}
