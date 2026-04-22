use reqwest::{Client, RequestBuilder};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Semaphore;

use crate::commands::model::{ModelResult, ProtocolTestResult};

const ANTHROPIC_VERSION: &str = "2023-06-01";
const OPENROUTER_TITLE: &str = "AIModal";
const TEST_PROMPT: &str = "现在的梵蒂冈的教皇是谁,你能为我做什么,别都叫你啥?我打算去洗车,我这边有两家一家离我有50米,另外一家离我200米,我是否应该开车去";

fn mask_secret(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.len() <= 4 {
        return "*".repeat(trimmed.len());
    }
    format!("{}******{}", &trimmed[..2], &trimmed[trimmed.len() - 2..])
}

fn build_debug_request_headers(
    protocol: ModelProtocol,
    api_key: &str,
) -> BTreeMap<String, String> {
    let mut headers = BTreeMap::new();
    headers.insert("Accept".to_string(), "application/json".to_string());

    match protocol {
        ModelProtocol::OpenAi => {
            headers.insert(
                "Authorization".to_string(),
                format!("Bearer {}", mask_secret(api_key)),
            );
        }
        ModelProtocol::OpenRouter => {
            headers.insert(
                "Authorization".to_string(),
                format!("Bearer {}", mask_secret(api_key)),
            );
            headers.insert("X-Title".to_string(), OPENROUTER_TITLE.to_string());
        }
        ModelProtocol::Claude => {
            headers.insert("x-api-key".to_string(), mask_secret(api_key));
            headers.insert(
                "anthropic-version".to_string(),
                ANTHROPIC_VERSION.to_string(),
            );
        }
        ModelProtocol::Gemini => {
            headers.insert("x-goog-api-key".to_string(), mask_secret(api_key));
        }
    }

    headers
}

fn collect_response_headers(headers: &reqwest::header::HeaderMap) -> BTreeMap<String, String> {
    let mut collected = BTreeMap::new();
    for (key, value) in headers.iter() {
        collected.insert(
            key.as_str().to_string(),
            value.to_str().unwrap_or("<non-utf8>").to_string(),
        );
    }
    collected
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelProtocol {
    OpenAi,
    OpenRouter,
    Claude,
    Gemini,
}

pub async fn list_models(base_url: &str, api_key: &str) -> Result<Vec<String>, String> {
    let protocol = infer_protocol_from_base_url(base_url);
    let client = client()?;
    let url = build_models_url(base_url, protocol);

    let resp = apply_auth(client.get(&url), protocol, api_key)
        .send()
        .await
        .map_err(|e| classify_error(None, &e.to_string()))?;

    let status = resp.status().as_u16();
    let body = resp.text().await.unwrap_or_default();
    if !(200..300).contains(&status) {
        return Err(classify_error(Some(status), &body));
    }

    parse_models_response(protocol, &body)
}

pub async fn test_models(
    base_url: &str,
    api_key: &str,
    models: Vec<String>,
) -> Result<Vec<ModelResult>, String> {
    let client = Arc::new(client()?);
    let semaphore = Arc::new(Semaphore::new(5));
    let base_url = Arc::new(base_url.to_string());
    let api_key = Arc::new(api_key.to_string());

    let mut handles = Vec::new();
    for model_id in models {
        let client = client.clone();
        let sem = semaphore.clone();
        let base = base_url.clone();
        let key = api_key.clone();
        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire().await.unwrap();
            test_single_model_with_client(&client, &base, &key, &model_id, None).await
        }));
    }

    let mut results = Vec::new();
    for handle in handles {
        match handle.await {
            Ok(result) => results.push(result),
            Err(e) => results.push(ModelResult {
                model: "unknown".to_string(),
                available: false,
                latency_ms: None,
                error: Some(format!("任务异常：{}", e)),
                response_text: Some(format!("任务异常：{}", e)),
                supported_protocols: Vec::new(),
                protocol_results: Vec::new(),
            }),
        }
    }

    Ok(results)
}

pub async fn test_single_model(
    base_url: &str,
    api_key: &str,
    model: &str,
    protocols: Option<&[String]>,
) -> Result<ModelResult, String> {
    let client = client()?;
    let requested_protocols = protocols.map(parse_requested_protocols);
    Ok(test_single_model_with_client(
        &client,
        base_url,
        api_key,
        model,
        requested_protocols.as_deref(),
    )
    .await)
}

pub fn infer_protocol_from_model(model: &str) -> ModelProtocol {
    let normalized = model
        .trim()
        .trim_start_matches("models/")
        .to_ascii_lowercase();

    if normalized.starts_with("claude") {
        ModelProtocol::Claude
    } else if normalized.starts_with("gemini") {
        ModelProtocol::Gemini
    } else {
        ModelProtocol::OpenAi
    }
}

pub fn infer_protocol_from_base_url(base_url: &str) -> ModelProtocol {
    let normalized = base_url.trim().to_ascii_lowercase();

    if normalized.contains("openrouter.ai") {
        ModelProtocol::OpenRouter
    } else if normalized.contains("anthropic") || normalized.contains("claude") {
        ModelProtocol::Claude
    } else if normalized.contains("generativelanguage.googleapis.com")
        || normalized.contains("gemini")
    {
        ModelProtocol::Gemini
    } else {
        ModelProtocol::OpenAi
    }
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(10))
        .use_rustls_tls()
        .build()
        .map_err(|e| e.to_string())
}

async fn test_single_model_with_client(
    client: &Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    requested_protocols: Option<&[ModelProtocol]>,
) -> ModelResult {
    let protocols = requested_protocols
        .filter(|protocols| !protocols.is_empty())
        .map(|protocols| protocols.to_vec())
        .unwrap_or_else(|| determine_test_protocols(base_url, model));
    let mut supported_protocols = Vec::new();
    let mut protocol_results = Vec::new();
    let mut last_error = None;
    let mut last_response_text = None;
    let mut total_latency_ms = 0u64;
    let mut any_success = false;

    for protocol in protocols {
        let url = build_test_url(base_url, protocol, model);
        let body = build_test_body(protocol, model);
        let request_method = "POST".to_string();
        let request_headers = build_debug_request_headers(protocol, api_key);
        let request_body = serde_json::to_string_pretty(&body)
            .unwrap_or_else(|_| body.to_string());
        let start = Instant::now();

        let resp = match apply_auth(client.post(&url), protocol, api_key)
            .json(&body)
            .send()
            .await
        {
            Ok(response) => response,
            Err(e) => {
                let err_msg = classify_error(None, &e.to_string());
                last_error = Some(err_msg.clone());
                last_response_text = Some(e.to_string());
                protocol_results.push(ProtocolTestResult {
                    protocol: protocol_to_string(protocol),
                    available: false,
                    latency_ms: None,
                    error: Some(err_msg),
                    response_text: Some(e.to_string()),
                    request_url: Some(url.clone()),
                    request_method: Some(request_method.clone()),
                    request_headers: Some(request_headers.clone()),
                    request_body: Some(request_body.clone()),
                    response_status: None,
                    response_headers: None,
                });
                continue;
            }
        };

        let latency_ms = start.elapsed().as_millis() as u64;
        total_latency_ms += latency_ms;
        let status = resp.status().as_u16();
        let response_headers = collect_response_headers(resp.headers());

        // 尝试读取响应文本，如果失败则使用空字符串
        let response_text = match resp.text().await {
            Ok(text) => text,
            Err(e) => format!("读取响应失败: {}", e),
        };

        if (200..300).contains(&status) {
            let protocol_name = protocol_to_string(protocol);
            supported_protocols.push(protocol_name.clone());
            any_success = true;
            protocol_results.push(ProtocolTestResult {
                protocol: protocol_name,
                available: true,
                latency_ms: Some(latency_ms),
                error: None,
                response_text: Some(response_text),
                request_url: Some(url.clone()),
                request_method: Some(request_method.clone()),
                request_headers: Some(request_headers.clone()),
                request_body: Some(request_body.clone()),
                response_status: Some(status),
                response_headers: Some(response_headers.clone()),
            });
            // 继续测试下一个协议，不提前返回
        } else {
            let err_msg = classify_error(Some(status), &response_text);
            let protocol_name = protocol_to_string(protocol);
            last_error = Some(err_msg.clone());
            last_response_text = Some(response_text);
            protocol_results.push(ProtocolTestResult {
                protocol: protocol_name,
                available: false,
                latency_ms: Some(latency_ms),
                error: Some(err_msg),
                response_text: last_response_text.clone(),
                request_url: Some(url.clone()),
                request_method: Some(request_method.clone()),
                request_headers: Some(request_headers.clone()),
                request_body: Some(request_body.clone()),
                response_status: Some(status),
                response_headers: Some(response_headers),
            });
            // 401/403 表示当前 key/鉴权方式不可用；429 表示当前 provider 已触发限流。
            // 这三类错误继续尝试后续协议的价值很低，直接终止本次模型检测。
            if status == 401 || status == 403 || status == 429 {
                break;
            }
        }
    }

    ModelResult {
        model: model.to_string(),
        available: any_success,
        latency_ms: if total_latency_ms > 0 {
            Some(total_latency_ms)
        } else {
            None
        },
        error: if any_success { None } else { last_error },
        response_text: if any_success {
            None
        } else {
            last_response_text
        },
        supported_protocols,
        protocol_results,
    }
}

fn protocol_to_string(protocol: ModelProtocol) -> String {
    match protocol {
        ModelProtocol::OpenAi => "openApi".to_string(),
        ModelProtocol::OpenRouter => "openrouter".to_string(),
        ModelProtocol::Claude => "claude".to_string(),
        ModelProtocol::Gemini => "gemini".to_string(),
    }
}

fn parse_requested_protocols(protocols: &[String]) -> Vec<ModelProtocol> {
    let mut parsed = Vec::new();

    for protocol in protocols {
        let normalized = protocol.trim().to_ascii_lowercase();
        let next = match normalized.as_str() {
            "openapi" | "openai" => Some(ModelProtocol::OpenAi),
            "claude" => Some(ModelProtocol::Claude),
            "gemini" => Some(ModelProtocol::Gemini),
            "openrouter" => Some(ModelProtocol::OpenRouter),
            _ => None,
        };

        if let Some(protocol) = next {
            if !parsed.contains(&protocol) {
                parsed.push(protocol);
            }
        }
    }

    parsed
}

fn determine_test_protocols(base_url: &str, model: &str) -> Vec<ModelProtocol> {
    let base_protocol = infer_protocol_from_base_url(base_url);
    let model_protocol = infer_protocol_from_model(model);

    match base_protocol {
        // OpenRouter 统一走 OpenRouter 协议，不 fallback
        ModelProtocol::OpenRouter => vec![ModelProtocol::OpenRouter],
        // 对于 Claude/Gemini 专用 base_url，优先走对应协议，然后尝试 OpenAI
        ModelProtocol::Claude => {
            if model_protocol == ModelProtocol::Claude {
                vec![ModelProtocol::Claude, ModelProtocol::OpenAi]
            } else {
                vec![
                    ModelProtocol::Claude,
                    ModelProtocol::OpenAi,
                    ModelProtocol::Gemini,
                ]
            }
        }
        ModelProtocol::Gemini => {
            if model_protocol == ModelProtocol::Gemini {
                vec![ModelProtocol::Gemini, ModelProtocol::OpenAi]
            } else {
                vec![
                    ModelProtocol::Gemini,
                    ModelProtocol::OpenAi,
                    ModelProtocol::Claude,
                ]
            }
        }
        // 通用 OpenAI 兼容地址：按模型名推断优先，然后 fallback 其他协议
        ModelProtocol::OpenAi => {
            let mut protocols = Vec::new();
            // 优先使用模型推断的协议
            protocols.push(model_protocol);
            // 然后尝试 OpenAI
            if !protocols.contains(&ModelProtocol::OpenAi) {
                protocols.push(ModelProtocol::OpenAi);
            }
            // 再尝试 Claude 和 Gemini
            if !protocols.contains(&ModelProtocol::Claude) {
                protocols.push(ModelProtocol::Claude);
            }
            if !protocols.contains(&ModelProtocol::Gemini) {
                protocols.push(ModelProtocol::Gemini);
            }
            protocols
        }
    }
}

fn apply_auth(builder: RequestBuilder, protocol: ModelProtocol, api_key: &str) -> RequestBuilder {
    let builder = builder.header("Accept", "application/json");
    match protocol {
        ModelProtocol::OpenAi => builder.bearer_auth(api_key),
        ModelProtocol::OpenRouter => builder
            .bearer_auth(api_key)
            .header("X-Title", OPENROUTER_TITLE),
        ModelProtocol::Claude => builder
            .header("x-api-key", api_key)
            .header("anthropic-version", ANTHROPIC_VERSION),
        ModelProtocol::Gemini => builder.header("x-goog-api-key", api_key),
    }
}

fn build_models_url(base_url: &str, protocol: ModelProtocol) -> String {
    match protocol {
        ModelProtocol::OpenAi | ModelProtocol::OpenRouter => {
            build_openai_style_url(base_url, "models")
        }
        ModelProtocol::Claude => build_claude_url(base_url, "models"),
        ModelProtocol::Gemini => {
            let base = normalize_gemini_base(base_url);
            format!("{}/v1beta/models", base)
        }
    }
}

fn build_test_url(base_url: &str, protocol: ModelProtocol, model: &str) -> String {
    match protocol {
        ModelProtocol::OpenAi | ModelProtocol::OpenRouter => {
            build_openai_style_url(base_url, "chat/completions")
        }
        ModelProtocol::Claude => build_claude_url(base_url, "messages"),
        ModelProtocol::Gemini => {
            let base = normalize_gemini_base(base_url);
            let model_path = normalize_gemini_model_path(model);
            format!("{}/v1beta/{}:generateContent", base, model_path)
        }
    }
}

fn build_openai_style_url(base_url: &str, leaf: &str) -> String {
    let normalized = strip_trailing_suffixes(base_url, &["/chat/completions", "/models"]);

    if normalized.ends_with("/v1")
        || normalized.ends_with("/v1beta/openai")
        || normalized.ends_with("/openai")
    {
        format!("{}/{}", normalized, leaf)
    } else {
        format!("{}/v1/{}", normalized, leaf)
    }
}

fn build_claude_url(base_url: &str, leaf: &str) -> String {
    let normalized = strip_trailing_suffixes(base_url, &["/messages", "/models"]);

    if normalized.ends_with("/v1") {
        format!("{}/{}", normalized, leaf)
    } else {
        format!("{}/v1/{}", normalized, leaf)
    }
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

fn strip_trailing_suffixes(base_url: &str, suffixes: &[&str]) -> String {
    let mut normalized = base_url.trim().trim_end_matches('/').to_string();

    loop {
        let mut changed = false;
        for suffix in suffixes {
            if normalized.ends_with(suffix) {
                normalized = normalized[..normalized.len() - suffix.len()].to_string();
                normalized = normalized.trim_end_matches('/').to_string();
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }

    normalized
}

fn normalize_gemini_model_name(model_name: &str) -> String {
    model_name.trim().trim_start_matches("models/").to_string()
}

fn normalize_gemini_model_path(model_name: &str) -> String {
    let normalized = normalize_gemini_model_name(model_name);
    format!("models/{}", normalized)
}

fn build_test_body(protocol: ModelProtocol, model: &str) -> Value {
    match protocol {
        ModelProtocol::OpenAi | ModelProtocol::OpenRouter => json!({
            "model": model,
            "messages": [{"role": "user", "content": TEST_PROMPT}],
            "max_completion_tokens": 1,
            "stream": false
        }),
        ModelProtocol::Claude => json!({
            "model": model,
            "max_tokens": 1,
            "messages": [{"role": "user", "content": TEST_PROMPT}]
        }),
        ModelProtocol::Gemini => json!({
            "contents": [{
                "parts": [{"text": TEST_PROMPT}]
            }],
            "generationConfig": {
                "maxOutputTokens": 1
            }
        }),
    }
}

fn parse_models_response(protocol: ModelProtocol, body: &str) -> Result<Vec<String>, String> {
    let value: Value = serde_json::from_str(body).map_err(|e| format!("解析响应失败：{}", e))?;

    match protocol {
        ModelProtocol::OpenAi | ModelProtocol::OpenRouter | ModelProtocol::Claude => {
            let data = value
                .get("data")
                .and_then(|items| items.as_array())
                .ok_or_else(|| "解析响应失败：缺少 data 数组".to_string())?;

            Ok(data
                .iter()
                .filter_map(|item| item.get("id").and_then(|id| id.as_str()))
                .map(|id| id.to_string())
                .collect())
        }
        ModelProtocol::Gemini => {
            let models = value
                .get("models")
                .and_then(|items| items.as_array())
                .ok_or_else(|| "解析响应失败：缺少 models 数组".to_string())?;

            Ok(models
                .iter()
                .filter_map(|item| item.get("name").and_then(|name| name.as_str()))
                .map(normalize_gemini_model_name)
                .collect())
        }
    }
}

fn extract_error_detail(msg: &str) -> Option<String> {
    let trimmed = msg.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        if let Some(detail) = value
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(|message| message.as_str())
        {
            let detail = detail.trim();
            if !detail.is_empty() {
                return Some(detail.to_string());
            }
        }

        if let Some(detail) = value
            .get("message")
            .and_then(|message| message.as_str())
        {
            let detail = detail.trim();
            if !detail.is_empty() {
                return Some(detail.to_string());
            }
        }
    }

    Some(trimmed.chars().take(160).collect())
}

fn classify_error(status: Option<u16>, msg: &str) -> String {
    let detail = extract_error_detail(msg);

    match status {
        Some(400) => match detail {
            Some(detail) => format!("请求无效（400）：{}", detail),
            None => "请求无效（400）：参数或协议不匹配".to_string(),
        },
        Some(401) => match detail {
            Some(detail) => format!("认证失败（401）：{}", detail),
            None => "认证失败（401）：API Key 无效".to_string(),
        },
        Some(403) => match detail {
            Some(detail) => format!("权限不足（403）：{}", detail),
            None => "权限不足（403）".to_string(),
        },
        Some(404) => match detail {
            Some(detail) => format!("模型不存在或 endpoint 不存在（404）：{}", detail),
            None => "模型不存在或 endpoint 不存在（404）".to_string(),
        },
        Some(429) => match detail {
            Some(detail) => format!("请求过于频繁（429）：{}", detail),
            None => "请求过于频繁（429）：触发限流".to_string(),
        },
        Some(code) if code >= 500 => format!("服务端错误（{}）", code),
        _ => {
            if msg.contains("timed out") || msg.contains("timeout") {
                "请求超时（>10s）".to_string()
            } else {
                format!("未知错误：{}", &msg[..msg.len().min(160)])
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_openai_style_url, build_test_body, build_test_url, classify_error,
        determine_test_protocols, infer_protocol_from_base_url, infer_protocol_from_model,
        normalize_gemini_model_name, ModelProtocol,
    };
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpListener};
    use std::sync::{Arc, Mutex};
    use std::thread;

    #[derive(Clone)]
    struct MockResponse {
        status_line: &'static str,
        body: &'static str,
    }

    struct MockServer {
        addr: SocketAddr,
        requests: Arc<Mutex<Vec<String>>>,
        handle: thread::JoinHandle<()>,
    }

    impl MockServer {
        fn start<F>(expected_requests: usize, handler: F) -> Self
        where
            F: Fn(&str) -> MockResponse + Send + Sync + 'static,
        {
            let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock server");
            let addr = listener.local_addr().expect("read mock server address");
            let requests = Arc::new(Mutex::new(Vec::new()));
            let requests_for_thread = Arc::clone(&requests);
            let handler = Arc::new(handler);
            let handler_for_thread = Arc::clone(&handler);

            let handle = thread::spawn(move || {
                for stream in listener.incoming().take(expected_requests) {
                    let mut stream = stream.expect("accept mock request");
                    let mut buffer = [0_u8; 8192];
                    let size = stream.read(&mut buffer).expect("read mock request");
                    let request = String::from_utf8_lossy(&buffer[..size]).to_string();
                    requests_for_thread
                        .lock()
                        .expect("lock request log")
                        .push(request.clone());

                    let response = handler_for_thread(&request);
                    let body = response.body.as_bytes();
                    let reply = format!(
                        "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        response.status_line,
                        body.len(),
                        response.body
                    );
                    stream
                        .write_all(reply.as_bytes())
                        .expect("write mock response");
                }
            });

            Self {
                addr,
                requests,
                handle,
            }
        }

        fn base_url(&self) -> String {
            format!("http://{}", self.addr)
        }

        fn requests(&self) -> Vec<String> {
            self.requests.lock().expect("lock request log").clone()
        }

        fn join(self) {
            self.handle.join().expect("join mock server");
        }
    }

    #[test]
    fn infers_protocol_from_model_name() {
        assert_eq!(
            infer_protocol_from_model("claude-sonnet-4"),
            ModelProtocol::Claude
        );
        assert_eq!(
            infer_protocol_from_model("gemini-2.0-flash"),
            ModelProtocol::Gemini
        );
        assert_eq!(
            infer_protocol_from_model("models/gemini-2.0-flash"),
            ModelProtocol::Gemini
        );
        assert_eq!(
            infer_protocol_from_model("gpt-4o-mini"),
            ModelProtocol::OpenAi
        );
        assert_eq!(
            infer_protocol_from_model("custom-proxy-model"),
            ModelProtocol::OpenAi
        );
    }

    #[test]
    fn infers_list_protocol_from_base_url() {
        assert_eq!(
            infer_protocol_from_base_url("https://openrouter.ai/api"),
            ModelProtocol::OpenRouter
        );
        assert_eq!(
            infer_protocol_from_base_url("https://api.anthropic.com/v1"),
            ModelProtocol::Claude
        );
        assert_eq!(
            infer_protocol_from_base_url("https://generativelanguage.googleapis.com/v1beta/openai"),
            ModelProtocol::Gemini
        );
        assert_eq!(
            infer_protocol_from_base_url("https://api.openai.com/v1"),
            ModelProtocol::OpenAi
        );
    }

    #[test]
    fn preserves_openai_compatible_base_urls() {
        assert_eq!(
            build_openai_style_url("https://openrouter.ai/api", "chat/completions"),
            "https://openrouter.ai/api/v1/chat/completions"
        );
        assert_eq!(
            build_openai_style_url(
                "https://generativelanguage.googleapis.com/v1beta/openai",
                "chat/completions"
            ),
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        );
        assert_eq!(
            build_openai_style_url("https://api.openai.com/v1", "chat/completions"),
            "https://api.openai.com/v1/chat/completions"
        );
    }

    #[test]
    fn builds_native_gemini_generate_content_url() {
        assert_eq!(
            build_test_url(
                "https://generativelanguage.googleapis.com/v1beta/openai",
                ModelProtocol::Gemini,
                "gemini-2.0-flash"
            ),
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
        );
        assert_eq!(
            build_test_url(
                "https://generativelanguage.googleapis.com",
                ModelProtocol::Gemini,
                "models/gemini-2.0-flash"
            ),
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
        );
    }

    #[test]
    fn normalizes_gemini_model_name() {
        assert_eq!(
            normalize_gemini_model_name("models/gemini-2.0-flash"),
            "gemini-2.0-flash"
        );
    }

    #[test]
    fn openrouter_base_url_overrides_model_prefix_protocol_detection() {
        assert_eq!(
            determine_test_protocols("https://openrouter.ai/api", "openai/gpt-5.2"),
            vec![ModelProtocol::OpenRouter]
        );
        assert_eq!(
            determine_test_protocols("https://openrouter.ai/api", "anthropic/claude-3.7-sonnet"),
            vec![ModelProtocol::OpenRouter]
        );
    }

    #[tokio::test]
    async fn stops_follow_up_protocols_after_auth_failure() {
        let server = MockServer::start(1, |request| {
            if request.starts_with("POST /v1/chat/completions ") {
                return MockResponse {
                    status_line: "401 Unauthorized",
                    body: r#"{"error":"bearer auth rejected"}"#,
                };
            }

            MockResponse {
                status_line: "404 Not Found",
                body: r#"{"error":"unexpected request"}"#,
            }
        });

        let result = super::test_single_model(
            &server.base_url(),
            "demo-key",
            "claude-sonnet-4",
            Some(&["openApi".to_string(), "claude".to_string()]),
        )
        .await
        .expect("test single model");

        let expected_url = format!("{}/v1/chat/completions", server.base_url());
        let requests = server.requests();
        server.join();

        assert!(!result.available);
        assert_eq!(result.supported_protocols, Vec::<String>::new());
        assert_eq!(result.protocol_results.len(), 1);
        assert_eq!(
            result.protocol_results[0].request_url.as_deref(),
            Some(expected_url.as_str())
        );
        assert_eq!(
            result.protocol_results[0].request_method.as_deref(),
            Some("POST")
        );
        assert_eq!(requests.len(), 1);
        assert!(requests[0].starts_with("POST /v1/chat/completions "));
    }

    #[tokio::test]
    async fn stops_follow_up_protocols_after_rate_limit() {
        let server = MockServer::start(1, |request| {
            if request.starts_with("POST /v1/chat/completions ") {
                return MockResponse {
                    status_line: "429 Too Many Requests",
                    body: r#"{"error":"rate limited"}"#,
                };
            }

            MockResponse {
                status_line: "200 OK",
                body: r#"{"ok":true}"#,
            }
        });

        let result = super::test_single_model(
            &server.base_url(),
            "demo-key",
            "gpt-4o-mini",
            Some(&["openApi".to_string(), "claude".to_string()]),
        )
        .await
        .expect("test single model");

        let expected_url = format!("{}/v1/chat/completions", server.base_url());
        let requests = server.requests();
        server.join();

        assert!(!result.available);
        assert_eq!(result.protocol_results.len(), 1);
        assert_eq!(
            result.protocol_results[0].request_url.as_deref(),
            Some(expected_url.as_str())
        );
        assert_eq!(requests.len(), 1);
        assert!(requests[0].starts_with("POST /v1/chat/completions "));
    }

    #[test]
    fn openai_body_uses_chat_completions_fields() {
        let body = build_test_body(ModelProtocol::OpenAi, "gpt-4.1-mini");

        assert_eq!(body.get("model").and_then(|v| v.as_str()), Some("gpt-4.1-mini"));
        assert_eq!(
            body.get("messages")
                .and_then(|v| v.as_array())
                .and_then(|items| items.first())
                .and_then(|item| item.get("role"))
                .and_then(|v| v.as_str()),
            Some("user")
        );
        assert_eq!(
            body.get("max_completion_tokens").and_then(|v| v.as_i64()),
            Some(1)
        );
        assert!(body.get("max_tokens").is_none());
        assert_eq!(body.get("stream").and_then(|v| v.as_bool()), Some(false));
    }

    #[test]
    fn classify_error_keeps_upstream_detail() {
        let message = classify_error(
            Some(400),
            r#"{"error":{"message":"Invalid proxy server token passed.","code":"400"}}"#,
        );

        assert_eq!(message, "请求无效（400）：Invalid proxy server token passed.");
    }
}
