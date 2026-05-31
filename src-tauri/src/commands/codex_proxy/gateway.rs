use axum::{
    body::Body,
    extract::State,
    http::{Request, Response, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde_json::Value;
use std::sync::Arc;

use crate::commands::codex_proxy::{
    types::*,
    config::{effective_slots, load_config_file, now_time},
};

/// 创建路由
pub fn create_router(state: Arc<CodexGatewayState>) -> Router {
    Router::new()
        .route("/v1/models", get(list_models))
        .route("/v1/chat/completions", post(chat_completions))
        .route("/health", get(health_check))
        .with_state(state)
}

/// 健康检查
async fn health_check() -> Json<Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "codex-proxy"
    }))
}

/// 列出模型
async fn list_models(State(state): State<Arc<CodexGatewayState>>) -> Json<Value> {
    let config = load_config_file();
    let mut models = Vec::new();

    for provider in &config.providers {
        for model in &provider.models {
            if !model.enabled || model.name.trim().is_empty() {
                continue;
            }

            let slots = effective_slots(model);
            for slot in slots {
                if slot.is_empty() {
                    continue;
                }

                models.push(serde_json::json!({
                    "id": slot,
                    "object": "model",
                    "created": 1677610602,
                    "owned_by": "openai",
                }));
            }
        }
    }

    Json(serde_json::json!({
        "object": "list",
        "data": models,
    }))
}

/// 聊天完成
async fn chat_completions(
    State(state): State<Arc<CodexGatewayState>>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let model_id = body
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or("openai/gpt-5.4");

    // 查找对应的模型配置
    let config = load_config_file();
    let mut target_model = None;
    let mut target_provider = None;

    'outer: for provider in &config.providers {
        for model in &provider.models {
            if !model.enabled {
                continue;
            }

            let slots = effective_slots(model);
            if slots.iter().any(|s| s == model_id) {
                target_model = Some(model);
                target_provider = Some(provider);
                break 'outer;
            }
        }
    }

    let (model, provider) = match (target_model, target_provider) {
        (Some(m), Some(p)) => (m, p),
        _ => {
            return Err(StatusCode::NOT_FOUND);
        }
    };

    // 转发请求到目标 API
    let client = &state.client;
    let target_url = format!("{}/v1/chat/completions", provider.target_url.trim_end_matches('/'));

    let mut request_body = body.clone();
    request_body["model"] = serde_json::Value::String(model.name.clone());

    let response = client
        .post(&target_url)
        .header("Authorization", format!("Bearer {}", provider.api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await;

    match response {
        Ok(resp) => {
            let status = resp.status();
            if status.is_success() {
                match resp.json::<Value>().await {
                    Ok(json) => Ok(Json(json)),
                    Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
                }
            } else {
                Err(StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR))
            }
        }
        Err(_) => Err(StatusCode::BAD_GATEWAY),
    }
}

/// 启动网关
pub async fn start_gateway(port: u16) -> Result<tokio::task::JoinHandle<()>, String> {
    let state = Arc::new(CodexGatewayState {
        client: reqwest::Client::new(),
        config: load_config_file(),
        port,
    });

    let app = create_router(state);
    let addr = format!("127.0.0.1:{}", port);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("无法绑定端口 {}: {}", port, e))?;

    let handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    Ok(handle)
}
