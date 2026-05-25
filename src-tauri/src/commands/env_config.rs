use std::path::PathBuf;

const ZSHRC_PATH: &str = "~/.zshrc";
const CODEX_API_KEY_VAR: &str = "CODEX_API_KEY";

fn expand_home(path: &str) -> Result<PathBuf, String> {
    if path.starts_with("~/") {
        let home = dirs::home_dir().ok_or("无法获取 home 目录")?;
        Ok(home.join(&path[2..]))
    } else {
        Ok(PathBuf::from(path))
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvConfigResult {
    pub success: bool,
    pub message: String,
    pub current_value: Option<String>,
}

#[tauri::command]
pub async fn get_codex_api_key() -> Result<Option<String>, String> {
    let zshrc_path = expand_home(ZSHRC_PATH)?;

    if !zshrc_path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&zshrc_path)
        .map_err(|e| format!("读取 ~/.zshrc 失败: {}", e))?;

    // 查找 export CODEX_API_KEY="..." 或 export CODEX_API_KEY='...'
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with(&format!("export {}=", CODEX_API_KEY_VAR)) {
            let value_part = &trimmed[format!("export {}=", CODEX_API_KEY_VAR).len()..];
            // 去掉引号
            let value = value_part
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .to_string();
            if !value.is_empty() {
                return Ok(Some(value));
            }
        }
    }

    Ok(None)
}

#[tauri::command]
pub async fn set_codex_api_key(api_key: String) -> Result<EnvConfigResult, String> {
    if api_key.trim().is_empty() {
        return Ok(EnvConfigResult {
            success: false,
            message: "API Key 不能为空".to_string(),
            current_value: None,
        });
    }

    let zshrc_path = expand_home(ZSHRC_PATH)?;
    let new_line = format!("export {}=\"{}\"", CODEX_API_KEY_VAR, api_key.trim());

    let content = if zshrc_path.exists() {
        std::fs::read_to_string(&zshrc_path)
            .map_err(|e| format!("读取 ~/.zshrc 失败: {}", e))?
    } else {
        String::new()
    };

    // 查找是否已存在 CODEX_API_KEY 配置
    let mut found = false;
    let lines: Vec<&str> = content.lines().collect();
    let mut new_lines: Vec<String> = Vec::new();

    for line in lines {
        let trimmed = line.trim();
        if trimmed.starts_with(&format!("export {}=", CODEX_API_KEY_VAR))
            || trimmed.starts_with(&format!("{}=", CODEX_API_KEY_VAR))
        {
            // 替换已存在的行
            new_lines.push(new_line.clone());
            found = true;
        } else {
            new_lines.push(line.to_string());
        }
    }

    if !found {
        // 添加新行（在文件末尾添加注释和配置）
        if !content.is_empty() && !content.ends_with('\n') {
            new_lines.push(String::new());
        }
        new_lines.push(format!("# AI Modal - Codex API Key"));
        new_lines.push(new_line);
    }

    let new_content = new_lines.join("\n");
    std::fs::write(&zshrc_path, new_content)
        .map_err(|e| format!("写入 ~/.zshrc 失败: {}", e))?;

    // 执行 source ~/.zshrc
    let output = std::process::Command::new("sh")
        .arg("-c")
        .arg(format!("source {} && echo 'source_ok'", zshrc_path.display()))
        .output();

    let source_msg = match output {
        Ok(out) if out.status.success() => "，已执行 source ~/.zshrc".to_string(),
        _ => "，请手动执行 source ~/.zshrc 使配置生效".to_string(),
    };

    Ok(EnvConfigResult {
        success: true,
        message: format!("{} 已写入 ~/.zshrc{}", CODEX_API_KEY_VAR, source_msg),
        current_value: Some(api_key.trim().to_string()),
    })
}

#[tauri::command]
pub async fn remove_codex_api_key() -> Result<EnvConfigResult, String> {
    let zshrc_path = expand_home(ZSHRC_PATH)?;

    if !zshrc_path.exists() {
        return Ok(EnvConfigResult {
            success: false,
            message: "~/.zshrc 不存在".to_string(),
            current_value: None,
        });
    }

    let content = std::fs::read_to_string(&zshrc_path)
        .map_err(|e| format!("读取 ~/.zshrc 失败: {}", e))?;

    let lines: Vec<&str> = content.lines().collect();
    let mut new_lines: Vec<String> = Vec::new();
    let mut found = false;
    let mut skip_next = false;

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();

        // 跳过标记的行
        if skip_next {
            skip_next = false;
            continue;
        }

        // 检查是否是 CODEX_API_KEY 配置行
        if trimmed.starts_with(&format!("export {}=", CODEX_API_KEY_VAR))
            || trimmed.starts_with(&format!("{}=", CODEX_API_KEY_VAR))
        {
            found = true;
            // 检查前一行是否是注释
            if i > 0 && lines[i - 1].trim() == "# AI Modal - Codex API Key" {
                // 移除前一行注释
                new_lines.pop();
            }
            continue;
        }

        new_lines.push(line.to_string());
    }

    if !found {
        return Ok(EnvConfigResult {
            success: false,
            message: format!("{} 不存在于 ~/.zshrc", CODEX_API_KEY_VAR),
            current_value: None,
        });
    }

    let new_content = new_lines.join("\n");
    std::fs::write(&zshrc_path, new_content)
        .map_err(|e| format!("写入 ~/.zshrc 失败: {}", e))?;

    Ok(EnvConfigResult {
        success: true,
        message: format!("{} 已从 ~/.zshrc 移除，请手动执行 source ~/.zshrc 使更改生效", CODEX_API_KEY_VAR),
        current_value: None,
    })
}
