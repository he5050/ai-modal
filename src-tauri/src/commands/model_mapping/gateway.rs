use std::sync::Arc;
use axum::{
    body::Body,
    extract::State,
    http::{Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use reqwest::Client;
use tokio::net::TcpListener;

use crate::commands::model_mapping::types::{
    GatewayState, MappingProtocol, ModelMappingConfig, ModelMappingLogEntry,
    ModelMappingManager, ModelMappingTestRequest, ModelMappingTestResult,
    AutostartRequest,
};
use crate::commands::model_mapping::config::{
    save_config_file,
    flatten_config, now_time, push_log,
    stringify_json_pretty,
};
use crate::commands::model_mapping::protocol::{
    anthropic_to_openai_chat_request, anthropic_to_openai_responses_request,
    anthropic_to_gemini_request, build_openai_chat_url, build_openai_responses_url,
    normalize_gemini_base, normalize_gemini_model_path, openai_response_to_anthropic_message,
    anthropic_message_to_sse_response, extract_mapping_error_message,
    validate_anthropic_message_response, MappingResponseValidation,
};
use crate::commands::model_mapping::claude::{
    apply_to_claude_desktop, restart_claude_desktop, is_autostart_enabled, set_autostart,
};

pub fn build_anthropic_messages_url(base_url: &str, request_path: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    let path = if request_path.is_empty() {
        "/v1/messages"
    } else {
        request_path
    };
    if base.ends_with("/v1") && path.starts_with("/v1/") {
        format!("{}{}", base, path.trim_start_matches("/v1"))
    } else {
        format!("{}{}", base, path)
    }
}

fn apply_thinking_effort(data: &mut serde_json::Value, effort: &str) -> String {
    match effort {
        "off" => {
            data["thinking"] = serde_json::json!({"type": "disabled"});
            if let Some(object) = data.as_object_mut() {
                object.remove("output_config");
            }
            "off".to_string()
        }
        "high" | "max" => {
            data["thinking"] = serde_json::json!({"type": "enabled", "budget_tokens": 8192});
            data["output_config"] = serde_json::json!({"effort": effort});
            effort.to_string()
        }
        _ => String::new(),
    }
}

pub(crate) fn resolve_model(model: &str, config: &ModelMappingConfig) -> Result<ResolvedModel, String> {
    let (base_model, wants_1m) = model
        .strip_suffix("[1m]")
        .map(|base| (base, true))
        .unwrap_or((model, false));

    for provider in &config.providers {
        for entry in &provider.models {
            if !entry.enabled || entry.target_protocol.trim() != "claude" {
                continue;
            }
            let slots = effective_slots(entry);
            let matched = slots.iter().any(|s| {
                base_model == s.as_str()
                    || s.strip_prefix("anthropic/")
                        .map(|rest| rest == base_model)
                        .unwrap_or(false)
                    || base_model.strip_prefix("anthropic/")
                        .map(|rest| rest == s.as_str())
                        .unwrap_or(false)
            });
            if matched {
                let target_model = if wants_1m && !entry.to_1m.trim().is_empty() {
                    format!("{}[1m]", entry.name.trim())
                } else {
                    entry.name.trim().to_string()
                };
                return Ok(ResolvedModel {
                    requested_model: model.to_string(),
                    target_model,
                    target_url: provider.target_url.clone(),
                    api_key: provider.api_key.clone(),
                    thinking_effort: provider.thinking_effort.clone(),
                    protocol: parse_mapping_protocol(
                        &resolve_effective_upstream_protocol(entry, &provider.target_url),
                        &provider.target_url,
                        &entry.name,
                    ),
                });
            }
        }
    }

    Err(format!(
        "未命中模型映射槽位：{}。请确认该槽位已启用，并重新保存/应用到 Claude。",
        model
    ))
}

use crate::commands::model_mapping::config::{
    effective_slots, legacy_slot, parse_mapping_protocol, resolve_effective_upstream_protocol,
};

#[derive(Debug)]
pub(crate) struct ResolvedModel {
    pub(crate) requested_model: String,
    pub(crate) target_model: String,
    pub(crate) target_url: String,
    pub(crate) api_key: String,
    pub(crate) thinking_effort: String,
    pub(crate) protocol: MappingProtocol,
}

async fn gateway_models_handler(State(state): State<Arc<GatewayState>>) -> Json<serde_json::Value> {
    let config = state
        .manager
        .config
        .read()
        .unwrap_or_else(|err| err.into_inner())
        .clone();
    let models: Vec<serde_json::Value> = flatten_config(&config)
        .iter()
        .flat_map(|entry| {
            let mut values = vec![serde_json::json!({
                "id": entry.slot,
                "display_name": entry.display_name,
                "created": 0
            })];
            if entry.supports_1m {
                values.push(serde_json::json!({
                    "id": format!("{}[1m]", entry.slot),
                    "display_name": format!("{} (1M)", entry.display_name),
                    "created": 0
                }));
            }
            values
        })
        .collect();
    Json(serde_json::json!({ "data": models }))
}

async fn gateway_proxy_handler(
    State(state): State<Arc<GatewayState>>,
    req: axum::http::Request<Body>,
) -> axum::response::Response {
    let (parts, body) = req.into_parts();
    if parts.method != Method::POST {
        return (StatusCode::NOT_FOUND, "Not Found").into_response();
    }

    let body_bytes = match axum::body::to_bytes(body, 10 * 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(err) => return (StatusCode::BAD_REQUEST, err.to_string()).into_response(),
    };
    let mut data: serde_json::Value = match serde_json::from_slice(&body_bytes) {
        Ok(value) => value,
        Err(err) => return (StatusCode::BAD_REQUEST, err.to_string()).into_response(),
    };

    let config = state
        .manager
        .config
        .read()
        .unwrap_or_else(|err| err.into_inner())
        .clone();
    let requested = data
        .get("model")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();
    let resolved = match resolve_model(&requested, &config) {
        Ok(value) => value,
        Err(err) => {
            push_log(
                &state.manager,
                ModelMappingLogEntry {
                    time: now_time(),
                    model: requested.clone(),
                    target_model: String::new(),
                    status: 502,
                    thinking: String::new(),
                    source_protocol: String::new(),
                    target_protocol: "claude".to_string(),
                    request_url: parts.uri.path().to_string(),
                    request_method: "POST".to_string(),
                    request_body: String::from_utf8_lossy(&body_bytes).into_owned(),
                    response_body: String::new(),
                    converted_response_body: String::new(),
                    error_message: err.clone(),
                },
            );
            return (StatusCode::BAD_GATEWAY, err).into_response();
        }
    };
    data["model"] = serde_json::json!(resolved.target_model);

    let thinking = apply_thinking_effort(&mut data, &resolved.thinking_effort);
    let wants_stream = data
        .get("stream")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let request_path = parts.uri.path().to_string();
    let source_protocol = crate::commands::model_mapping::config::protocol_to_string(resolved.protocol);
    let target_protocol = "claude".to_string();
    let (request_url, upstream_body) = match resolved.protocol {
        MappingProtocol::Claude => (
            build_anthropic_messages_url(&resolved.target_url, &request_path),
            data.clone(),
        ),
        MappingProtocol::OpenAiChat | MappingProtocol::OpenRouter => (
            build_openai_chat_url(&resolved.target_url),
            anthropic_to_openai_chat_request(&data),
        ),
        MappingProtocol::OpenAiResponses => (
            build_openai_responses_url(&resolved.target_url),
            anthropic_to_openai_responses_request(&data),
        ),
        MappingProtocol::Gemini => (
            format!(
                "{}/v1beta/{}:generateContent",
                normalize_gemini_base(&resolved.target_url),
                normalize_gemini_model_path(&resolved.target_model)
            ),
            anthropic_to_gemini_request(&data),
        ),
    };
    let request_body = stringify_json_pretty(&upstream_body);
    let response = match resolved.protocol {
        MappingProtocol::Claude => {
            let mut request = state
                .client
                .post(&request_url)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", resolved.api_key))
                .header(
                    "anthropic-version",
                    parts
                        .headers
                        .get("anthropic-version")
                        .and_then(|value| value.to_str().ok())
                        .unwrap_or("2023-06-01"),
                );

            for header in ["anthropic-beta", "x-api-key", "user-agent"] {
                if let Some(value) = parts.headers.get(header) {
                    request = request.header(header, value);
                }
            }
            request.json(&upstream_body).send().await
        }
        MappingProtocol::OpenAiChat | MappingProtocol::OpenRouter => {
            let request = state
                .client
                .post(&request_url)
                .header("content-type", "application/json")
                .bearer_auth(&resolved.api_key)
                .json(&upstream_body);
            let request = if resolved.protocol == MappingProtocol::OpenRouter {
                request.header("X-Title", "AIModal")
            } else {
                request
            };
            request.send().await
        }
        MappingProtocol::OpenAiResponses => {
            state
                .client
                .post(&request_url)
                .header("content-type", "application/json")
                .bearer_auth(&resolved.api_key)
                .json(&upstream_body)
                .send()
                .await
        }
        MappingProtocol::Gemini => {
            state
                .client
                .post(&request_url)
                .header("content-type", "application/json")
                .header("x-goog-api-key", &resolved.api_key)
                .json(&upstream_body)
                .send()
                .await
        }
    };
    match response {
        Ok(resp) => {
            let status = resp.status();
            let headers = resp.headers().clone();
            if resolved.protocol == MappingProtocol::Claude || !status.is_success() {
                let body_bytes = resp.bytes().await.unwrap_or_default();
                let response_body = String::from_utf8_lossy(&body_bytes).into_owned();
                push_log(
                    &state.manager,
                    ModelMappingLogEntry {
                        time: now_time(),
                        model: resolved.requested_model.clone(),
                        target_model: resolved.target_model.clone(),
                        status: status.as_u16(),
                        thinking,
                        source_protocol: source_protocol.clone(),
                        target_protocol: target_protocol.clone(),
                        request_url: request_url.clone(),
                        request_method: "POST".to_string(),
                        request_body: request_body.clone(),
                        response_body: response_body.clone(),
                        converted_response_body: String::new(),
                        error_message: if status.is_success() {
                            String::new()
                        } else {
                            extract_mapping_error_message(&response_body)
                                .unwrap_or_else(|| format!("HTTP {}", status.as_u16()))
                        },
                    },
                );
                let mut builder = axum::http::Response::builder().status(status);
                for (name, value) in headers.iter() {
                    let name_text = name.as_str().to_ascii_lowercase();
                    if name_text != "transfer-encoding" && name_text != "connection" {
                        builder = builder.header(name, value);
                    }
                }
                builder.body(Body::from(body_bytes)).unwrap_or_else(|_| {
                    (StatusCode::BAD_GATEWAY, "Invalid upstream response").into_response()
                })
            } else {
                let raw_text = resp.text().await.unwrap_or_default();
                match openai_response_to_anthropic_message(
                    resolved.protocol,
                    &resolved.target_model,
                    &raw_text,
                ) {
                    Ok(value) => {
                        let converted_response_body = stringify_json_pretty(&value);
                        push_log(
                            &state.manager,
                            ModelMappingLogEntry {
                                time: now_time(),
                                model: resolved.requested_model.clone(),
                                target_model: resolved.target_model.clone(),
                                status: status.as_u16(),
                                thinking,
                                source_protocol: source_protocol.clone(),
                                target_protocol: target_protocol.clone(),
                                request_url: request_url.clone(),
                                request_method: "POST".to_string(),
                                request_body: request_body.clone(),
                                response_body: raw_text.clone(),
                                converted_response_body,
                                error_message: String::new(),
                            },
                        );
                        if wants_stream {
                            anthropic_message_to_sse_response(value)
                        } else {
                            Json(value).into_response()
                        }
                    }
                    Err(err) => {
                        push_log(
                            &state.manager,
                            ModelMappingLogEntry {
                                time: now_time(),
                                model: resolved.requested_model.clone(),
                                target_model: resolved.target_model.clone(),
                                status: 502,
                                thinking,
                                source_protocol: source_protocol.clone(),
                                target_protocol: target_protocol.clone(),
                                request_url: request_url.clone(),
                                request_method: "POST".to_string(),
                                request_body: request_body.clone(),
                                response_body: raw_text,
                                converted_response_body: String::new(),
                                error_message: err.clone(),
                            },
                        );
                        (StatusCode::BAD_GATEWAY, err).into_response()
                    }
                }
            }
        }
        Err(err) => {
            push_log(
                &state.manager,
                ModelMappingLogEntry {
                    time: now_time(),
                    model: resolved.requested_model,
                    target_model: resolved.target_model,
                    status: 502,
                    thinking,
                    source_protocol,
                    target_protocol,
                    request_url,
                    request_method: "POST".to_string(),
                    request_body,
                    response_body: String::new(),
                    converted_response_body: String::new(),
                    error_message: err.to_string(),
                },
            );
            (StatusCode::BAD_GATEWAY, err.to_string()).into_response()
        }
    }
}

async fn api_get_config_handler(
    State(state): State<Arc<GatewayState>>,
) -> Json<ModelMappingConfig> {
    Json(
        state
            .manager
            .config
            .read()
            .unwrap_or_else(|err| err.into_inner())
            .clone(),
    )
}

async fn api_save_config_handler(
    State(state): State<Arc<GatewayState>>,
    Json(config): Json<ModelMappingConfig>,
) -> Json<serde_json::Value> {
    match save_config_file(&config) {
        Ok(()) => {
            *state
                .manager
                .config
                .write()
                .unwrap_or_else(|err| err.into_inner()) = config;
            Json(serde_json::json!({ "ok": true }))
        }
        Err(err) => Json(serde_json::json!({ "ok": false, "message": err })),
    }
}

pub async fn test_model_mapping_provider(
    request: ModelMappingTestRequest,
) -> Result<ModelMappingTestResult, String> {
    if request.target_url.trim().is_empty()
        || request.api_key.trim().is_empty()
        || request.model.trim().is_empty()
    {
        return Ok(ModelMappingTestResult {
            ok: false,
            status: None,
            message: "请填写 API 地址、API Key 和模型名。".to_string(),
        });
    }
    if !request.target_url.starts_with("http://") && !request.target_url.starts_with("https://") {
        return Ok(ModelMappingTestResult {
            ok: false,
            status: None,
            message: "API 地址必须以 http:// 或 https:// 开头。".to_string(),
        });
    }

    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|err| err.to_string())?;
    let protocol = parse_mapping_protocol(
        request.protocol.as_deref().unwrap_or_default(),
        &request.target_url,
        &request.model,
    );

    let (url, body) = build_mapping_test_request(&request, protocol);
    let mut builder = client.post(url).header("content-type", "application/json");
    builder = match protocol {
        MappingProtocol::Claude => builder
            .header("authorization", format!("Bearer {}", request.api_key))
            .header("anthropic-version", "2023-06-01"),
        MappingProtocol::OpenAiChat | MappingProtocol::OpenAiResponses => {
            builder.bearer_auth(&request.api_key)
        }
        MappingProtocol::OpenRouter => builder
            .bearer_auth(&request.api_key)
            .header("X-Title", "AIModal"),
        MappingProtocol::Gemini => builder.header("x-goog-api-key", &request.api_key),
    };
    let response = builder.json(&body).send().await;

    match response {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let text = resp.text().await.unwrap_or_default();
            if status == 200 {
                let validation = validate_mapping_response(protocol, &request.model, &text);
                Ok(ModelMappingTestResult {
                    ok: validation.ok,
                    status: Some(status),
                    message: validation.message,
                })
            } else {
                Ok(ModelMappingTestResult {
                    ok: false,
                    status: Some(status),
                    message: extract_mapping_error_message(&text)
                        .unwrap_or_else(|| format!("HTTP {}", status)),
                })
            }
        }
        Err(err) => Ok(ModelMappingTestResult {
            ok: false,
            status: None,
            message: if err.is_timeout() {
                "连接超时。".to_string()
            } else if err.is_connect() {
                "无法连接，请检查 API 地址。".to_string()
            } else {
                err.to_string()
            },
        }),
    }
}

fn build_mapping_test_request(
    request: &ModelMappingTestRequest,
    protocol: MappingProtocol,
) -> (String, serde_json::Value) {
    let anthropic_body = serde_json::json!({
        "model": request.model,
        "max_tokens": 16,
        "messages": [{"role": "user", "content": "只回复 ok"}]
    });
    match protocol {
        MappingProtocol::Claude => (
            build_anthropic_messages_url(&request.target_url, "/v1/messages"),
            anthropic_body,
        ),
        MappingProtocol::OpenAiChat | MappingProtocol::OpenRouter => (
            build_openai_chat_url(&request.target_url),
            anthropic_to_openai_chat_request(&anthropic_body),
        ),
        MappingProtocol::OpenAiResponses => (
            build_openai_responses_url(&request.target_url),
            anthropic_to_openai_responses_request(&anthropic_body),
        ),
        MappingProtocol::Gemini => (
            format!(
                "{}/v1beta/{}:generateContent",
                normalize_gemini_base(&request.target_url),
                normalize_gemini_model_path(&request.model)
            ),
            anthropic_to_gemini_request(&anthropic_body),
        ),
    }
}

fn validate_mapping_response(
    protocol: MappingProtocol,
    model: &str,
    text: &str,
) -> MappingResponseValidation {
    match protocol {
        MappingProtocol::Claude => validate_anthropic_message_response(text),
        MappingProtocol::OpenAiChat
        | MappingProtocol::OpenAiResponses
        | MappingProtocol::OpenRouter => {
            match openai_response_to_anthropic_message(protocol, model, text) {
                Ok(value) => {
                    let preview = value
                        .get("content")
                        .and_then(|content| content.as_array())
                        .map(|items| {
                            items
                                .iter()
                                .filter_map(|item| item.get("text").and_then(|text| text.as_str()))
                                .collect::<Vec<_>>()
                                .join("")
                        })
                        .unwrap_or_default();
                    let suffix = if preview.trim().is_empty() {
                        String::new()
                    } else {
                        format!(
                            "，响应：{}",
                            preview.trim().chars().take(40).collect::<String>()
                        )
                    };
                    MappingResponseValidation {
                        ok: true,
                        message: format!("模型可用 HTTP 200{}", suffix),
                    }
                }
                Err(err) => MappingResponseValidation {
                    ok: false,
                    message: err,
                },
            }
        }
        MappingProtocol::Gemini => {
            match openai_response_to_anthropic_message(protocol, model, text) {
                Ok(value) => {
                    let preview = value
                        .get("content")
                        .and_then(|content| content.as_array())
                        .map(|items| {
                            items
                                .iter()
                                .filter_map(|item| item.get("text").and_then(|text| text.as_str()))
                                .collect::<Vec<_>>()
                                .join("")
                        })
                        .unwrap_or_default();
                    let suffix = if preview.trim().is_empty() {
                        String::new()
                    } else {
                        format!(
                            "，响应：{}",
                            preview.trim().chars().take(40).collect::<String>()
                        )
                    };
                    MappingResponseValidation {
                        ok: true,
                        message: format!("模型可用 HTTP 200{}", suffix),
                    }
                }
                Err(err) => MappingResponseValidation {
                    ok: false,
                    message: err,
                },
            }
        }
    }
}

async fn api_test_handler(Json(request): Json<ModelMappingTestRequest>) -> Json<serde_json::Value> {
    match test_model_mapping_provider(request).await {
        Ok(result) => Json(serde_json::json!({
            "ok": result.ok,
            "message": result.message,
            "status": result.status
        })),
        Err(err) => Json(serde_json::json!({ "ok": false, "message": err })),
    }
}

async fn api_apply_handler(State(state): State<Arc<GatewayState>>) -> Json<serde_json::Value> {
    let config = state
        .manager
        .config
        .read()
        .unwrap_or_else(|err| err.into_inner())
        .clone();
    match apply_to_claude_desktop(&config) {
        Ok(_) => {
            restart_claude_desktop();
            Json(
                serde_json::json!({ "ok": true, "message": "Applied! Claude Desktop is restarting..." }),
            )
        }
        Err(err) => Json(serde_json::json!({ "ok": false, "message": err })),
    }
}

async fn api_logs_handler(
    State(state): State<Arc<GatewayState>>,
) -> Json<Vec<ModelMappingLogEntry>> {
    Json(
        state
            .manager
            .logs
            .read()
            .unwrap_or_else(|err| err.into_inner())
            .clone(),
    )
}

async fn api_autostart_get_handler() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "enabled": is_autostart_enabled() }))
}

async fn api_autostart_set_handler(
    Json(request): Json<AutostartRequest>,
) -> Json<serde_json::Value> {
    match set_autostart(request.enabled) {
        Ok(()) => Json(serde_json::json!({ "ok": true })),
        Err(err) => Json(serde_json::json!({ "ok": false, "message": err })),
    }
}

async fn gateway_root_handler(State(state): State<Arc<GatewayState>>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "ok": true,
        "name": "AIModal Model Mapping",
        "port": state.port,
    }))
}

pub async fn run_gateway_until_shutdown(
    manager: Arc<ModelMappingManager>,
    port: u16,
    shutdown: tokio::sync::oneshot::Receiver<()>,
) -> Result<(), String> {
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|err| err.to_string())?;
    let state = Arc::new(GatewayState {
        client,
        manager,
        port,
    });
    let app = Router::new()
        .route("/", get(gateway_root_handler))
        .route(
            "/api/config",
            get(api_get_config_handler).post(api_save_config_handler),
        )
        .route("/api/test", post(api_test_handler))
        .route("/api/apply", post(api_apply_handler))
        .route("/api/logs", get(api_logs_handler))
        .route(
            "/api/autostart",
            get(api_autostart_get_handler).post(api_autostart_set_handler),
        )
        .route("/v1/models", get(gateway_models_handler))
        .route("/*path", post(gateway_proxy_handler))
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
