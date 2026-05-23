use crate::commands::curl_task::config::{
    delete_curl_task_file, load_all_curl_tasks, save_curl_task_file,
};
use crate::commands::curl_task::types::{
    CurlTask, CurlTaskExecuteResult, ParsedCurl,
};

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

#[tauri::command]
pub async fn execute_curl_task(id: String) -> Result<CurlTaskExecuteResult, String> {
    let tasks = load_all_curl_tasks();
    let task = tasks
        .into_iter()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("未找到任务：{}", id))?;

    let parsed = &task.parsed_curl;
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

    match request_builder.send().await {
        Ok(response) => {
            let status = response.status().as_u16();
            match response.json::<serde_json::Value>().await {
                Ok(data) => Ok(CurlTaskExecuteResult {
                    ok: status >= 200 && status < 300,
                    status,
                    data: Some(data),
                    error: None,
                }),
                Err(_) => Ok(CurlTaskExecuteResult {
                    ok: status >= 200 && status < 300,
                    status,
                    data: None,
                    error: Some("无法解析响应为 JSON".to_string()),
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

    // 解析 URL
    if let Some(url_start) = remaining.find('\'') {
        if let Some(url_end) = remaining[url_start + 1..].find('\'') {
            result.url = remaining[url_start + 1..url_start + 1 + url_end].to_string();
            remaining = &remaining[url_start + 1 + url_end + 1..];
        }
    }

    if result.url.is_empty() {
        // 尝试不带引号的 URL
        let parts: Vec<&str> = remaining.split_whitespace().collect();
        if let Some(first) = parts.first() {
            let url = first.trim_matches('\'').trim_matches('"');
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
