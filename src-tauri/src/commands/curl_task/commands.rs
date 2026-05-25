use crate::commands::curl_task::config::{
    delete_curl_task_file, load_all_curl_tasks, save_curl_task_file,
};
use crate::commands::curl_task::types::{
    CurlTask, CurlTaskExecuteResult, ParsedCurl, RequestDebugInfo,
};
use std::process::Stdio;

#[tauri::command]
pub fn load_curl_tasks() -> Result<Vec<CurlTask>, String> {
    Ok(load_all_curl_tasks())
}

#[tauri::command]
pub fn save_curl_task(task: CurlTask) -> Result<(), String> {
    save_curl_task_file(&task)
}

#[tauri::command]
pub fn delete_curl_task(id: String) -> Result<(), String> {
    delete_curl_task_file(&id)
}

async fn execute_parsed_curl(parsed: &ParsedCurl) -> Result<CurlTaskExecuteResult, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let method = parsed.method.to_uppercase();
    let mut request_builder = match method.as_str() {
        "GET" => client.get(&parsed.url),
        "POST" => client.post(&parsed.url),
        "PUT" => client.put(&parsed.url),
        "DELETE" => client.delete(&parsed.url),
        "PATCH" => client.patch(&parsed.url),
        _ => client.request(
            reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::GET),
            &parsed.url,
        ),
    };

    for (key, value) in &parsed.headers {
        request_builder = request_builder.header(key, value);
    }

    if let Some(body) = &parsed.body {
        request_builder = request_builder.body(body.clone());
    }

    // 构建调试信息
    let debug_headers: Vec<(String, String)> = parsed
        .headers
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    let request_debug = RequestDebugInfo {
        url: parsed.url.clone(),
        method: parsed.method.clone(),
        headers: debug_headers,
    };

    match request_builder.send().await {
        Ok(response) => {
            let status = response.status().as_u16();
            match response.json::<serde_json::Value>().await {
                Ok(data) => Ok(CurlTaskExecuteResult {
                    ok: status >= 200 && status < 300,
                    status,
                    data: Some(data),
                    error: None,
                    request_debug: Some(request_debug),
                }),
                Err(_) => Ok(CurlTaskExecuteResult {
                    ok: status >= 200 && status < 300,
                    status,
                    data: None,
                    error: Some("无法解析响应为 JSON".to_string()),
                    request_debug: Some(request_debug),
                }),
            }
        }
        Err(err) => Ok(CurlTaskExecuteResult {
            ok: false,
            status: 0,
            data: None,
            error: Some(if err.is_timeout() {
                "请求超时".to_string()
            } else if err.is_connect() {
                "无法连接".to_string()
            } else {
                err.to_string()
            }),
            request_debug: Some(request_debug),
        }),
    }
}

#[tauri::command]
pub async fn execute_curl_task(id: String) -> Result<CurlTaskExecuteResult, String> {
    let tasks = load_all_curl_tasks();
    let task = tasks
        .into_iter()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("未找到任务：{}", id))?;

    execute_parsed_curl(&task.parsed_curl).await
}

#[tauri::command]
pub async fn execute_curl_direct(parsed: ParsedCurl) -> Result<CurlTaskExecuteResult, String> {
    execute_parsed_curl(&parsed).await
}

#[tauri::command]
pub async fn execute_curl_raw(curl: String) -> Result<CurlTaskExecuteResult, String> {
    let trimmed = curl.trim();
    if trimmed.is_empty() {
        return Err("cURL 命令为空".to_string());
    }

    // 把多行反斜杠续行合并为单行
    let normalized = trimmed
        .lines()
        .map(|line| {
            let l = line.trim_end();
            if l.ends_with('\\') {
                l[..l.len() - 1].to_string()
            } else {
                l.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ");

    let args_part = if normalized.starts_with("curl ") {
        &normalized[5..]
    } else {
        &normalized
    };

    // 写入临时脚本文件，避免 shell 引号嵌套问题
    let tmp_dir = std::env::temp_dir();
    let tmp_script = tmp_dir.join(format!("ai_modal_curl_{}.sh", std::process::id()));
    let script_content = format!(
        "#!/bin/sh\nexec curl -s -o /dev/stdout -w '{{\"__status\":%{{http_code}}}}' {}",
        args_part
    );
    std::fs::write(&tmp_script, &script_content)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;

    let output = tokio::process::Command::new("sh")
        .arg(&tmp_script)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;

    // 清理临时文件
    let _ = std::fs::remove_file(&tmp_script);

    let output = output.map_err(|e| format!("执行 curl 失败: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // 调试：如果出错，返回脚本内容和错误
    if !stdout.trim().is_empty() || !stderr.trim().is_empty() {
        // 正常或可解析的错误
    } else {
        return Ok(CurlTaskExecuteResult {
            ok: false,
            status: 0,
            data: None,
            error: Some(format!("空响应. stderr: {} | script: {}", stderr.trim(), &script_content[..script_content.len().min(200)])),
            request_debug: None,
        });
    }

    if !stderr.trim().is_empty() && stdout.trim().is_empty() {
        return Ok(CurlTaskExecuteResult {
            ok: false,
            status: 0,
            data: None,
            error: Some(stderr.trim().to_string()),
            request_debug: None,
        });
    }

    let stdout_trimmed = stdout.trim();

    // 尝试从尾部提取状态码 JSON
    let (body, status) = if let Some(idx) = stdout_trimmed.rfind("{\"__status\":") {
        let body_part = &stdout_trimmed[..idx];
        let tail = &stdout_trimmed[idx..];
        if let Some(colon_idx) = tail.find(':') {
            let after_colon = &tail[colon_idx + 1..];
            let status_str = after_colon.trim_end_matches('}').trim();
            let status_code = status_str.parse::<u16>().unwrap_or(0);
            (body_part.to_string(), status_code)
        } else {
            (stdout_trimmed.to_string(), 0)
        }
    } else {
        // 没找到状态码标记，检查输出末尾是否有 3 位数字
        let trimmed_end = stdout_trimmed.trim_end();
        if trimmed_end.len() > 4 {
            let last_part = &trimmed_end[trimmed_end.len().saturating_sub(5)..];
            if last_part.len() > 3 && last_part[..3].chars().all(|c| c.is_ascii_digit()) {
                let status_code = last_part[..3].parse::<u16>().unwrap_or(0);
                (stdout_trimmed[..stdout_trimmed.len().saturating_sub(last_part.trim_start_matches(|c: char| !c.is_ascii_digit()).len())].to_string(), status_code)
            } else {
                (stdout_trimmed.to_string(), 0)
            }
        } else {
            (stdout_trimmed.to_string(), 0)
        }
    };

    let ok = status >= 200 && status < 300;
    let body_trimmed = body.trim();

    match serde_json::from_str::<serde_json::Value>(body_trimmed) {
        Ok(data) => Ok(CurlTaskExecuteResult {
            ok,
            status,
            data: Some(data),
            error: None,
            request_debug: None,
        }),
        Err(e) => Ok(CurlTaskExecuteResult {
            ok,
            status,
            data: None,
            error: Some(format!("JSON 解析失败 (HTTP {}): {} (前100字符: {})", status, e, &body_trimmed[..body_trimmed.len().min(100)])),
            request_debug: None,
        }),
    }
}

#[tauri::command]
pub fn parse_curl_command(curl: String) -> Result<ParsedCurl, String> {
    let mut result = ParsedCurl {
        url: String::new(),
        method: "GET".to_string(),
        headers: std::collections::HashMap::new(),
        body: None,
    };

    let trimmed = curl.trim();
    if !trimmed.starts_with("curl ") {
        return Err("无效的 cURL 命令".to_string());
    }

    let mut remaining = &trimmed[5..];

    // 解析 URL (支持单引号、双引号、反引号)
    if let Some(url_start) = remaining.find('\'') {
        if let Some(url_end) = remaining[url_start + 1..].find('\'') {
            result.url = remaining[url_start + 1..url_start + 1 + url_end].to_string();
            remaining = &remaining[url_start + 1 + url_end + 1..];
        }
    } else if let Some(url_start) = remaining.find('"') {
        if let Some(url_end) = remaining[url_start + 1..].find('"') {
            result.url = remaining[url_start + 1..url_start + 1 + url_end].to_string();
            remaining = &remaining[url_start + 1 + url_end + 1..];
        }
    } else if let Some(url_start) = remaining.find('`') {
        if let Some(url_end) = remaining[url_start + 1..].find('`') {
            result.url = remaining[url_start + 1..url_start + 1 + url_end].to_string();
            remaining = &remaining[url_start + 1 + url_end + 1..];
        }
    }

    if result.url.is_empty() {
        // 尝试不带引号的 URL
        let parts: Vec<&str> = remaining.split_whitespace().collect();
        if let Some(first) = parts.first() {
            let url = first.trim_matches('\'').trim_matches('"').trim_matches('`');
            if url.starts_with("http") {
                result.url = url.to_string();
                remaining = &remaining[first.len()..];
            }
        }
    }

    if result.url.is_empty() {
        return Err("无法解析 URL".to_string());
    }

    // 解析 -X 方法
    if let Some(method_idx) = remaining.find("-X ") {
        let after = &remaining[method_idx + 3..];
        let method = after.split_whitespace().next().unwrap_or("GET");
        result.method = method.to_string();
    }

    // 解析 -H headers
    let mut header_remaining = remaining;
    while let Some(header_idx) = header_remaining.find("-H ") {
        let after = &header_remaining[header_idx + 3..];
        if let Some(quote_start) = after.find('"') {
            if let Some(quote_end) = after[quote_start + 1..].find('"') {
                let header_str = &after[quote_start + 1..quote_start + 1 + quote_end];
                if let Some(colon_idx) = header_str.find(':') {
                    let key = header_str[..colon_idx].trim().to_string();
                    let value = header_str[colon_idx + 1..].trim().to_string();
                    result.headers.insert(key, value);
                }
            }
        }
        header_remaining = &after[1..];
    }

    // 解析 -b cookie (支持单引号、双引号、反引号)
    let mut cookie_remaining = remaining;
    while let Some(cookie_idx) = cookie_remaining.find("-b ") {
        let after = &cookie_remaining[cookie_idx + 3..];
        let cookie_str = if let Some(quote_start) = after.find('"') {
            if let Some(quote_end) = after[quote_start + 1..].find('"') {
                Some(&after[quote_start + 1..quote_start + 1 + quote_end])
            } else {
                None
            }
        } else if let Some(quote_start) = after.find('\'') {
            if let Some(quote_end) = after[quote_start + 1..].find('\'') {
                Some(&after[quote_start + 1..quote_start + 1 + quote_end])
            } else {
                None
            }
        } else if let Some(quote_start) = after.find('`') {
            if let Some(quote_end) = after[quote_start + 1..].find('`') {
                Some(&after[quote_start + 1..quote_start + 1 + quote_end])
            } else {
                None
            }
        } else {
            None
        };
        if let Some(cookie) = cookie_str {
            result.headers.insert("Cookie".to_string(), cookie.to_string());
        }
        cookie_remaining = &after[1..];
    }

    // 解析 --data-raw body
    for prefix in &["-d ", "--data ", "--data-raw "] {
        if let Some(data_idx) = remaining.find(prefix) {
            let after = &remaining[data_idx + prefix.len()..];
            if let Some(quote_start) = after.find('"') {
                if let Some(quote_end) = after[quote_start + 1..].find('"') {
                    result.body = Some(after[quote_start + 1..quote_start + 1 + quote_end].to_string());
                    break;
                }
            }
            if let Some(quote_start) = after.find('\'') {
                if let Some(quote_end) = after[quote_start + 1..].find('\'') {
                    result.body = Some(after[quote_start + 1..quote_start + 1 + quote_end].to_string());
                    break;
                }
            }
        }
    }

    // 如果有 body 且没有指定方法，默认使用 POST
    if result.body.is_some() && result.method == "GET" {
        result.method = "POST".to_string();
    }

    Ok(result)
}
