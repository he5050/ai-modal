use std::sync::Arc;

use axum::{
    body::Body,
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use reqwest::Client;
use tokio::net::TcpListener;

use crate::commands::cli_proxy::types::{CliGatewayState, CliToolConfig};

async fn cli_gateway_root_handler(
    State(state): State<Arc<CliGatewayState>>,
) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "ok": true,
        "name": format!("AIModal CLI Proxy - {}", state.tool_config.tool_type.as_str()),
        "port": state.port,
        "upstream": state.tool_config.api_url,
    }))
}

async fn cli_gateway_health_handler(
    State(state): State<Arc<CliGatewayState>>,
) -> Json<serde_json::Value> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    Json(serde_json::json!({
        "ok": true,
        "status": "healthy",
        "tool_type": state.tool_config.tool_type.as_str(),
        "port": state.port,
        "upstream": state.tool_config.api_url,
        "model": state.tool_config.model,
        "timestamp": now,
    }))
}

async fn cli_gateway_models_handler(
    State(state): State<Arc<CliGatewayState>>,
) -> Json<serde_json::Value> {
    let model = state.tool_config.model.trim().to_string();
    if model.is_empty() {
        return Json(serde_json::json!({ "data": [] }));
    }
    Json(serde_json::json!({
        "data": [{
            "id": model,
            "object": "model",
            "created": 0,
        }]
    }))
}

async fn cli_gateway_proxy_handler(
    State(state): State<Arc<CliGatewayState>>,
    req: axum::http::Request<Body>,
) -> axum::response::Response {
    let (parts, body) = req.into_parts();

    let body_bytes = match axum::body::to_bytes(body, 50 * 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(err) => return (StatusCode::BAD_REQUEST, err.to_string()).into_response(),
    };

    let tool = &state.tool_config;
    let protocol = tool.effective_protocol();
    let upstream_base = tool.api_url.trim().trim_end_matches('/');
    let request_path = parts.uri.path().to_string();

    let mut data: serde_json::Value = if body_bytes.is_empty() {
        serde_json::Value::Null
    } else {
        match serde_json::from_slice(&body_bytes) {
            Ok(value) => value,
            Err(err) => return (StatusCode::BAD_REQUEST, err.to_string()).into_response(),
        }
    };

    if !tool.model.trim().is_empty() && data.is_object() {
        data["model"] = serde_json::json!(tool.model.trim());
    }

    let upstream_url = build_upstream_url(upstream_base, &request_path, protocol, &tool.model);

    let mut builder = state
        .client
        .post(&upstream_url)
        .header("content-type", "application/json");

    builder = apply_auth_header(builder, protocol, &tool.api_key);

    for header in ["anthropic-version", "anthropic-beta", "user-agent"] {
        if let Some(value) = parts.headers.get(header) {
            builder = builder.header(header, value);
        }
    }

    let wants_stream = data
        .get("stream")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let response = builder.json(&data).send().await;

    match response {
        Ok(resp) => {
            let status = resp.status();
            let headers = resp.headers().clone();

            if wants_stream && status.is_success() {
                let content_type = headers
                    .get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("")
                    .to_string();

                if content_type.contains("text/event-stream") {
                    let mut response_builder =
                        axum::http::Response::builder().status(status);
                    for (name, value) in headers.iter() {
                        let name_text = name.as_str().to_ascii_lowercase();
                        if name_text != "transfer-encoding"
                            && name_text != "connection"
                            && name_text != "content-length"
                        {
                            response_builder = response_builder.header(name, value);
                        }
                    }
                    let stream = resp.bytes_stream();
                    let body_stream = Body::from_stream(stream);
                    return response_builder
                        .body(body_stream)
                        .unwrap_or_else(|_| {
                            (StatusCode::BAD_GATEWAY, "Stream error").into_response()
                        });
                }
            }

            let body_bytes = resp.bytes().await.unwrap_or_default();
            let mut response_builder = axum::http::Response::builder().status(status);
            for (name, value) in headers.iter() {
                let name_text = name.as_str().to_ascii_lowercase();
                if name_text != "transfer-encoding" && name_text != "connection" {
                    response_builder = response_builder.header(name, value);
                }
            }
            response_builder.body(Body::from(body_bytes)).unwrap_or_else(|_| {
                (StatusCode::BAD_GATEWAY, "Invalid upstream response").into_response()
            })
        }
        Err(err) => {
            let message = if err.is_timeout() {
                "上游请求超时".to_string()
            } else if err.is_connect() {
                "无法连接上游 API".to_string()
            } else {
                err.to_string()
            };
            (StatusCode::BAD_GATEWAY, message).into_response()
        }
    }
}

fn build_upstream_url(base: &str, request_path: &str, protocol: &str, model: &str) -> String {
    match protocol {
        "claude" => {
            if request_path.contains("/v1/messages") || request_path.contains("/messages") {
                format!("{}/v1/messages", base.trim_end_matches("/v1"))
            } else {
                format!("{}{}", base, request_path)
            }
        }
        "gemini" => {
            if request_path.contains(":generateContent") || request_path.contains(":streamGenerateContent") {
                format!("{}{}", base, request_path)
            } else {
                let model_name = if model.is_empty() {
                    "models/gemini-2.0-flash"
                } else if model.contains("/") {
                    model
                } else {
                    &format!("models/{}", model)
                };
                format!(
                    "{}/v1beta/{}:generateContent",
                    base.trim_end_matches("/v1beta"),
                    model_name
                )
            }
        }
        _ => {
            if request_path.starts_with("/v1/") {
                format!("{}{}", base, request_path)
            } else if base.ends_with("/v1") {
                format!("{}{}", base, request_path)
            } else {
                format!("{}/v1{}", base, request_path.trim_start_matches("/v1"))
            }
        }
    }
}

fn apply_auth_header(
    builder: reqwest::RequestBuilder,
    protocol: &str,
    api_key: &str,
) -> reqwest::RequestBuilder {
    match protocol {
        "claude" => builder
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01"),
        "gemini" => builder.header("x-goog-api-key", api_key),
        _ => builder.bearer_auth(api_key),
    }
}

pub async fn run_cli_gateway_until_shutdown(
    tool_config: CliToolConfig,
    port: u16,
    shutdown: tokio::sync::oneshot::Receiver<()>,
) -> Result<(), String> {
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|err| err.to_string())?;

    let state = Arc::new(CliGatewayState {
        client,
        tool_config,
        port,
    });

    let app = Router::new()
        .route("/", get(cli_gateway_root_handler))
        .route("/health", get(cli_gateway_health_handler))
        .route("/v1/models", get(cli_gateway_models_handler))
        .route("/*path", post(cli_gateway_proxy_handler))
        .with_state(state);

    let listener = TcpListener::bind(("127.0.0.1", port))
        .await
        .map_err(|err| format!("无法监听 127.0.0.1:{}: {}", port, err))?;

    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = shutdown.await;
        })
        .await
        .map_err(|err| err.to_string())
}

pub async fn test_cli_proxy_upstream(
    tool_config: &CliToolConfig,
) -> Result<crate::commands::cli_proxy::types::CliProxyTestResult, String> {
    if tool_config.api_url.trim().is_empty() || tool_config.api_key.trim().is_empty() {
        return Ok(crate::commands::cli_proxy::types::CliProxyTestResult {
            ok: false,
            status: None,
            message: "请填写 API 地址和 API Key。".to_string(),
        });
    }

    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|err| err.to_string())?;

    let protocol = tool_config.effective_protocol();
    let model = if tool_config.model.trim().is_empty() {
        "test-model".to_string()
    } else {
        tool_config.model.trim().to_string()
    };

    let (url, body) = build_test_request(&tool_config.api_url, protocol, &model);
    let mut builder = client
        .post(&url)
        .header("content-type", "application/json");
    builder = apply_auth_header(builder, protocol, &tool_config.api_key);

    let response = builder.json(&body).send().await;

    match response {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let text = resp.text().await.unwrap_or_default();
            if status >= 200 && status < 300 {
                Ok(crate::commands::cli_proxy::types::CliProxyTestResult {
                    ok: true,
                    status: Some(status),
                    message: format!("连接成功 HTTP {}", status),
                })
            } else {
                let error_msg = extract_error_message(&text)
                    .unwrap_or_else(|| format!("HTTP {}", status));
                Ok(crate::commands::cli_proxy::types::CliProxyTestResult {
                    ok: false,
                    status: Some(status),
                    message: error_msg,
                })
            }
        }
        Err(err) => Ok(crate::commands::cli_proxy::types::CliProxyTestResult {
            ok: false,
            status: None,
            message: if err.is_timeout() {
                "连接超时，请检查 API 地址。".to_string()
            } else if err.is_connect() {
                "无法连接，请检查 API 地址。".to_string()
            } else {
                err.to_string()
            },
        }),
    }
}

fn build_test_request(
    api_url: &str,
    protocol: &str,
    model: &str,
) -> (String, serde_json::Value) {
    let base = api_url.trim().trim_end_matches('/');
    match protocol {
        "claude" => (
            format!("{}/v1/messages", base.trim_end_matches("/v1")),
            serde_json::json!({
                "model": model,
                "max_tokens": 16,
                "messages": [{"role": "user", "content": "只回复 ok"}]
            }),
        ),
        "gemini" => {
            let model_path = if model.contains("/") {
                model.to_string()
            } else {
                format!("models/{}", model)
            };
            (
                format!("{}/v1beta/{}:generateContent", base.trim_end_matches("/v1beta"), model_path),
                serde_json::json!({
                    "contents": [{"parts": [{"text": "只回复 ok"}]}],
                    "generationConfig": {"maxOutputTokens": 16}
                }),
            )
        }
        _ => (
            format!("{}/v1/chat/completions", base.trim_end_matches("/v1")),
            serde_json::json!({
                "model": model,
                "max_tokens": 16,
                "messages": [{"role": "user", "content": "只回复 ok"}]
            }),
        ),
    }
}

fn extract_error_message(text: &str) -> Option<String> {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(text) {
        if let Some(msg) = value
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
        {
            return Some(msg.to_string());
        }
        if let Some(msg) = value.get("message").and_then(|m| m.as_str()) {
            return Some(msg.to_string());
        }
    }
    None
}
