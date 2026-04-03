use reqwest::{Client, RequestBuilder};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Semaphore;

use crate::commands::model::ModelResult;

const ANTHROPIC_VERSION: &str = "2023-06-01";
const OPENROUTER_TITLE: &str = "AIModal";
const TEST_PROMPT: &str = "现在的梵蒂冈的教皇是谁,你能为我做什么,别都叫你啥?我打算去洗车,我这边有两家一家离我有50米,另外一家我200米,我是否应该开车去";

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
            test_single_model_with_client(&client, &base, &key, &model_id).await
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
            }),
        }
    }

    Ok(results)
}

pub async fn test_single_model(
    base_url: &str,
    api_key: &str,
    model: &str,
) -> Result<ModelResult, String> {
    let client = client()?;
    Ok(test_single_model_with_client(&client, base_url, api_key, model).await)
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

fn infer_request_protocol(base_url: &str, model: &str) -> ModelProtocol {
    let base_protocol = infer_protocol_from_base_url(base_url);
    match base_protocol {
        ModelProtocol::OpenRouter | ModelProtocol::Claude | ModelProtocol::Gemini => base_protocol,
        ModelProtocol::OpenAi => infer_protocol_from_model(model),
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
) -> ModelResult {
    let protocol = infer_request_protocol(base_url, model);
    let url = build_test_url(base_url, protocol, model);
    let body = build_test_body(protocol, model);
    let start = Instant::now();

    let resp = match apply_auth(client.post(&url), protocol, api_key)
        .json(&body)
        .send()
        .await
    {
        Ok(response) => response,
        Err(e) => {
            return ModelResult {
                model: model.to_string(),
                available: false,
                latency_ms: None,
                error: Some(classify_error(None, &e.to_string())),
                response_text: Some(e.to_string()),
            };
        }
    };

    let latency_ms = start.elapsed().as_millis() as u64;
    let status = resp.status().as_u16();
    let response_text = resp.text().await.unwrap_or_default();

    if (200..300).contains(&status) {
        ModelResult {
            model: model.to_string(),
            available: true,
            latency_ms: Some(latency_ms),
            error: None,
            response_text: Some(response_text),
        }
    } else {
        ModelResult {
            model: model.to_string(),
            available: false,
            latency_ms: Some(latency_ms),
            error: Some(classify_error(Some(status), &response_text)),
            response_text: Some(response_text),
        }
    }
}

fn apply_auth(builder: RequestBuilder, protocol: ModelProtocol, api_key: &str) -> RequestBuilder {
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
            "max_tokens": 1,
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

fn classify_error(status: Option<u16>, msg: &str) -> String {
    match status {
        Some(400) => "请求无效（400）：参数或协议不匹配".to_string(),
        Some(401) => "认证失败（401）：API Key 无效".to_string(),
        Some(403) => "权限不足（403）".to_string(),
        Some(404) => "模型不存在或 endpoint 不存在（404）".to_string(),
        Some(429) => "请求过于频繁（429）：触发限流".to_string(),
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
        build_openai_style_url, build_test_url, infer_protocol_from_base_url,
        infer_protocol_from_model, infer_request_protocol, normalize_gemini_model_name,
        ModelProtocol,
    };

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
            infer_request_protocol("https://openrouter.ai/api", "openai/gpt-5.2"),
            ModelProtocol::OpenRouter
        );
        assert_eq!(
            infer_request_protocol("https://openrouter.ai/api", "anthropic/claude-3.7-sonnet"),
            ModelProtocol::OpenRouter
        );
    }
}
