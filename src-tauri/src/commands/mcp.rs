use reqwest::header::{ACCEPT, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::process::Stdio;
use std::time::{Duration, Instant};
use tokio::process::Command;
use tokio::time::sleep;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfigInput {
    #[serde(rename = "type")]
    pub server_type: Option<String>,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub cwd: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerTestResult {
    pub ok: bool,
    pub status: String,
    pub message: String,
    pub detail: Option<String>,
    pub latency_ms: Option<u64>,
}

fn clip_detail(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    const LIMIT: usize = 220;
    if trimmed.chars().count() <= LIMIT {
        return Some(trimmed.to_string());
    }
    Some(trimmed.chars().take(LIMIT).collect::<String>() + " ...")
}

fn parse_sse_payload(body: &str) -> Option<Value> {
    for line in body.lines() {
        if let Some(raw) = line.strip_prefix("data:") {
            let text = raw.trim();
            if text.is_empty() {
                continue;
            }
            if let Ok(value) = serde_json::from_str::<Value>(text) {
                return Some(value);
            }
        }
    }
    None
}

async fn test_http_server(url: &str) -> McpServerTestResult {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build();
    let client = match client {
        Ok(v) => v,
        Err(error) => {
            return McpServerTestResult {
                ok: false,
                status: "error".to_string(),
                message: format!("构建 HTTP 客户端失败: {error}"),
                detail: None,
                latency_ms: None,
            };
        }
    };

    let body = json!({
      "jsonrpc": "2.0",
      "id": 1,
      "method": "initialize",
      "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {
          "name": "ai-modal",
          "version": "0.6.0"
        }
      }
    });

    let started_at = Instant::now();
    let response = client
        .post(url)
        .header(CONTENT_TYPE, "application/json")
        .header(ACCEPT, "application/json, text/event-stream")
        .json(&body)
        .send()
        .await;

    let response = match response {
        Ok(v) => v,
        Err(error) => {
            return McpServerTestResult {
                ok: false,
                status: "error".to_string(),
                message: format!("请求失败: {error}"),
                detail: None,
                latency_ms: Some(started_at.elapsed().as_millis() as u64),
            };
        }
    };

    let code = response.status().as_u16();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let text = match response.text().await {
        Ok(v) => v,
        Err(error) => {
            return McpServerTestResult {
                ok: false,
                status: "error".to_string(),
                message: format!("读取响应失败: {error}"),
                detail: None,
                latency_ms: Some(started_at.elapsed().as_millis() as u64),
            };
        }
    };

    let latency_ms = Some(started_at.elapsed().as_millis() as u64);
    if code < 200 || code >= 300 {
        return McpServerTestResult {
            ok: false,
            status: format!("HTTP {code}"),
            message: format!("握手失败 HTTP {code}"),
            detail: clip_detail(&text),
            latency_ms,
        };
    }

    let payload = if content_type.contains("text/event-stream") {
        parse_sse_payload(&text)
    } else {
        serde_json::from_str::<Value>(&text).ok()
    };

    if let Some(value) = payload {
        let server_name = value
            .pointer("/result/serverInfo/name")
            .and_then(Value::as_str)
            .unwrap_or("MCP Server");
        let server_version = value
            .pointer("/result/serverInfo/version")
            .and_then(Value::as_str)
            .unwrap_or("");
        let detail = if server_version.is_empty() {
            Some(server_name.to_string())
        } else {
            Some(format!("{server_name} {server_version}"))
        };
        return McpServerTestResult {
            ok: true,
            status: format!("HTTP {code}"),
            message: "初始化握手成功".to_string(),
            detail,
            latency_ms,
        };
    }

    McpServerTestResult {
        ok: true,
        status: format!("HTTP {code}"),
        message: "服务有响应，但未解析到标准 initialize 结果".to_string(),
        detail: clip_detail(&text),
        latency_ms,
    }
}

async fn test_stdio_server(config: &McpServerConfigInput) -> McpServerTestResult {
    let command = config.command.clone().unwrap_or_default();
    if command.trim().is_empty() {
        return McpServerTestResult {
            ok: false,
            status: "error".to_string(),
            message: "缺少 command".to_string(),
            detail: None,
            latency_ms: None,
        };
    }

    let started_at = Instant::now();
    let mut cmd = Command::new(command);
    cmd.args(config.args.clone().unwrap_or_default());
    cmd.kill_on_drop(true);
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::null());
    if let Some(cwd) = config.cwd.clone() {
        if !cwd.trim().is_empty() {
            cmd.current_dir(cwd);
        }
    }
    if let Some(env) = config.env.clone() {
        cmd.envs(env);
    }

    let child = cmd.spawn();
    let mut child = match child {
        Ok(v) => v,
        Err(error) => {
            return McpServerTestResult {
                ok: false,
                status: "spawn-failed".to_string(),
                message: format!("进程启动失败: {error}"),
                detail: None,
                latency_ms: Some(started_at.elapsed().as_millis() as u64),
            };
        }
    };

    sleep(Duration::from_millis(500)).await;
    let check = child.try_wait();
    match check {
        Ok(Some(status)) => McpServerTestResult {
            ok: false,
            status: format!("exit({})", status.code().unwrap_or(-1)),
            message: "进程过早退出，服务可能不可用".to_string(),
            detail: None,
            latency_ms: Some(started_at.elapsed().as_millis() as u64),
        },
        Ok(None) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            McpServerTestResult {
                ok: true,
                status: "spawn-ok".to_string(),
                message: "进程可启动".to_string(),
                detail: Some("通过短时启动检测".to_string()),
                latency_ms: Some(started_at.elapsed().as_millis() as u64),
            }
        }
        Err(error) => McpServerTestResult {
            ok: false,
            status: "error".to_string(),
            message: format!("检测进程状态失败: {error}"),
            detail: None,
            latency_ms: Some(started_at.elapsed().as_millis() as u64),
        },
    }
}

#[tauri::command]
pub async fn test_mcp_server(
    _name: String,
    config: McpServerConfigInput,
) -> Result<McpServerTestResult, String> {
    let server_type = config
        .server_type
        .clone()
        .unwrap_or_else(|| "stdio".to_string());

    if server_type.eq_ignore_ascii_case("http") {
        let url = config.url.clone().unwrap_or_default();
        if url.trim().is_empty() {
            return Ok(McpServerTestResult {
                ok: false,
                status: "error".to_string(),
                message: "缺少 url".to_string(),
                detail: None,
                latency_ms: None,
            });
        }
        return Ok(test_http_server(url.trim()).await);
    }

    Ok(test_stdio_server(&config).await)
}
