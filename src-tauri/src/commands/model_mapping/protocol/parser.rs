use crate::commands::model_mapping::types::MappingProtocol;

pub fn extract_openai_chat_text(value: &serde_json::Value) -> Option<String> {
    value
        .get("choices")
        .and_then(|choices| choices.as_array())
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(|content| {
            if let Some(text) = content.as_str() {
                Some(text.to_string())
            } else {
                content.as_array().map(|items| {
                    items
                        .iter()
                        .filter_map(|item| {
                            item.get("text")
                                .and_then(|text| text.as_str())
                                .map(ToString::to_string)
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                })
            }
        })
}

pub fn extract_openai_responses_text(value: &serde_json::Value) -> Option<String> {
    value
        .get("output_text")
        .and_then(|text| text.as_str())
        .map(ToString::to_string)
        .or_else(|| {
            value
                .get("output")
                .and_then(|output| output.as_array())
                .map(|items| {
                    items
                        .iter()
                        .flat_map(|item| {
                            item.get("content")
                                .and_then(|content| content.as_array())
                                .cloned()
                                .unwrap_or_default()
                        })
                        .filter_map(|part| {
                            part.get("text")
                                .and_then(|text| text.as_str())
                                .map(ToString::to_string)
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                })
        })
}

pub fn extract_gemini_text(value: &serde_json::Value) -> Option<String> {
    value
        .get("candidates")
        .and_then(|candidates| candidates.as_array())
        .and_then(|candidates| candidates.first())
        .and_then(|candidate| candidate.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(|parts| parts.as_array())
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| {
                    part.get("text")
                        .and_then(|text| text.as_str())
                        .map(ToString::to_string)
                })
                .collect::<Vec<_>>()
                .join("\n")
        })
}

pub fn openai_response_to_anthropic_message(
    protocol: MappingProtocol,
    model: &str,
    raw_text: &str,
) -> Result<serde_json::Value, String> {
    let value: serde_json::Value =
        serde_json::from_str(raw_text).map_err(|err| format!("上游响应不是有效 JSON：{err}"))?;
    if let Some(message) = extract_mapping_error_message(raw_text) {
        return Err(message);
    }
    let text = match protocol {
        MappingProtocol::OpenAiChat | MappingProtocol::OpenRouter => {
            extract_openai_chat_text(&value)
        }
        MappingProtocol::OpenAiResponses => extract_openai_responses_text(&value),
        MappingProtocol::Gemini => extract_gemini_text(&value),
        _ => None,
    }
    .map(|text| text.trim().to_string())
    .filter(|text| !text.is_empty())
    .ok_or_else(|| {
        let snippet = raw_text.trim().chars().take(240).collect::<String>();
        if snippet.is_empty() {
            "上游响应中没有可转换的模型输出。".to_string()
        } else {
            format!("上游响应中没有可转换的模型输出。原始响应：{}", snippet)
        }
    })?;

    Ok(serde_json::json!({
        "id": value
            .get("id")
            .and_then(|id| id.as_str())
            .unwrap_or("msg_model_mapping"),
        "type": "message",
        "role": "assistant",
        "model": model,
        "content": [{"type": "text", "text": text}],
        "stop_reason": "end_turn",
        "stop_sequence": null,
        "usage": {
            "input_tokens": 0,
            "output_tokens": 0
        }
    }))
}

pub fn anthropic_message_text(value: &serde_json::Value) -> String {
    value
        .get("content")
        .and_then(|content| content.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("text").and_then(|text| text.as_str()))
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default()
}

pub fn anthropic_message_to_sse_response(value: serde_json::Value) -> axum::response::Response {
    use axum::response::IntoResponse;
    use axum::{body::Body, http::StatusCode};
    
    let text = anthropic_message_text(&value);
    let message_start = serde_json::json!({
        "type": "message_start",
        "message": {
            "id": value.get("id").cloned().unwrap_or_else(|| serde_json::json!("msg_model_mapping")),
            "type": "message",
            "role": "assistant",
            "model": value.get("model").cloned().unwrap_or_else(|| serde_json::json!("")),
            "content": [],
            "stop_reason": null,
            "stop_sequence": null,
            "usage": {"input_tokens": 0, "output_tokens": 0}
        }
    });
    let content_start = serde_json::json!({
        "type": "content_block_start",
        "index": 0,
        "content_block": {"type": "text", "text": ""}
    });
    let content_delta = serde_json::json!({
        "type": "content_block_delta",
        "index": 0,
        "delta": {"type": "text_delta", "text": text}
    });
    let content_stop = serde_json::json!({"type": "content_block_stop", "index": 0});
    let message_delta = serde_json::json!({
        "type": "message_delta",
        "delta": {"stop_reason": "end_turn", "stop_sequence": null},
        "usage": {"output_tokens": 0}
    });
    let message_stop = serde_json::json!({"type": "message_stop"});
    let body = [
        ("message_start", message_start),
        ("content_block_start", content_start),
        ("content_block_delta", content_delta),
        ("content_block_stop", content_stop),
        ("message_delta", message_delta),
        ("message_stop", message_stop),
    ]
    .into_iter()
    .map(|(event, data)| format!("event: {event}\ndata: {data}\n\n"))
    .collect::<String>();

    axum::http::Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "text/event-stream")
        .header("cache-control", "no-cache")
        .body(Body::from(body))
        .unwrap_or_else(|_| (StatusCode::BAD_GATEWAY, "Invalid stream response").into_response())
}

pub fn extract_mapping_error_message(text: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(text)
        .ok()
        .and_then(|value| {
            value
                .get("error")
                .and_then(|error| error.get("message").or_else(|| error.get("error")))
                .or_else(|| value.get("message"))
                .and_then(|message| message.as_str())
                .map(ToString::to_string)
        })
}

pub fn validate_anthropic_message_response(text: &str) -> MappingResponseValidation {
    let value = match serde_json::from_str::<serde_json::Value>(text) {
        Ok(value) => value,
        Err(_) => {
            return MappingResponseValidation {
                ok: false,
                message: "接口返回 HTTP 200，但响应不是有效 JSON，不能确认模型可用。".to_string(),
            };
        }
    };

    if let Some(message) = extract_mapping_error_message(text) {
        return MappingResponseValidation { ok: false, message };
    }

    let has_message_shape = value
        .get("type")
        .and_then(|item| item.as_str())
        .map(|item| item == "message")
        .unwrap_or(false)
        || value.get("id").and_then(|item| item.as_str()).is_some()
        || value.get("model").and_then(|item| item.as_str()).is_some();
    let content_text = value
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
    let has_stop_reason = value
        .get("stop_reason")
        .and_then(|item| item.as_str())
        .map(|item| !item.trim().is_empty())
        .unwrap_or(false);

    if has_message_shape && (!content_text.trim().is_empty() || has_stop_reason) {
        let preview = content_text.trim();
        let suffix = if preview.is_empty() {
            String::new()
        } else {
            format!("，响应：{}", preview.chars().take(40).collect::<String>())
        };
        return MappingResponseValidation {
            ok: true,
            message: format!("模型可用 HTTP 200{}", suffix),
        };
    }

    MappingResponseValidation {
        ok: false,
        message: "接口返回 HTTP 200，但没有有效的模型生成结果。".to_string(),
    }
}

pub struct MappingResponseValidation {
    pub ok: bool,
    pub message: String,
}
