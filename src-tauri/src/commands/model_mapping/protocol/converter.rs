
pub fn anthropic_content_to_text(value: &serde_json::Value) -> String {
    if let Some(text) = value.as_str() {
        return text.to_string();
    }
    value
        .as_array()
        .map(|items| {
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
        .unwrap_or_default()
}

/// 提取最后一条 user 消息作为纯字符串（用于 Responses API input）
pub fn extract_last_user_message_as_string(data: &serde_json::Value) -> String {
    if let Some(messages) = data.get("messages").and_then(|v| v.as_array()) {
        // 从后往前找第一条 user 消息
        for message in messages.iter().rev() {
            let role = message.get("role").and_then(|r| r.as_str()).unwrap_or("");
            if role == "user" {
                let content = message
                    .get("content")
                    .map(anthropic_content_to_text)
                    .unwrap_or_default();
                if !content.trim().is_empty() {
                    return content;
                }
            }
        }
    }
    // 如果没找到，返回默认值
    "Hello".to_string()
}

pub fn anthropic_to_openai_messages(data: &serde_json::Value) -> Vec<serde_json::Value> {
    let mut messages = Vec::new();
    if let Some(system) = data.get("system") {
        let content = anthropic_content_to_text(system);
        if !content.trim().is_empty() {
            messages.push(serde_json::json!({"role": "system", "content": content}));
        }
    }
    if let Some(items) = data.get("messages").and_then(|value| value.as_array()) {
        for item in items {
            let role = item
                .get("role")
                .and_then(|role| role.as_str())
                .unwrap_or("user");
            let role = if role == "assistant" {
                "assistant"
            } else {
                "user"
            };
            let content = item
                .get("content")
                .map(anthropic_content_to_text)
                .unwrap_or_default();
            messages.push(serde_json::json!({"role": role, "content": content}));
        }
    }
    if messages.is_empty() {
        messages.push(serde_json::json!({"role": "user", "content": "Hello"}));
    }
    messages
}

pub fn anthropic_to_openai_chat_request(data: &serde_json::Value) -> serde_json::Value {
    let max_tokens = data
        .get("max_tokens")
        .and_then(|value| value.as_u64())
        .unwrap_or(1024);

    let mut body = serde_json::json!({
        "model": data.get("model").cloned().unwrap_or_else(|| serde_json::json!("")),
        "messages": anthropic_to_openai_messages(data),
        "max_completion_tokens": max_tokens,
    });

    // 传递 temperature 参数
    if let Some(temperature) = data.get("temperature") {
        body["temperature"] = temperature.clone();
    }

    // 传递 top_p 参数
    if let Some(top_p) = data.get("top_p") {
        body["top_p"] = top_p.clone();
    }

    // 转换 stop_sequences -> stop
    if let Some(stop_sequences) = data.get("stop_sequences").and_then(|v| v.as_array()) {
        body["stop"] = serde_json::json!(stop_sequences);
    }

    // 继承 stream 参数
    if let Some(stream) = data.get("stream").and_then(|v| v.as_bool()) {
        body["stream"] = serde_json::json!(stream);
    } else {
        body["stream"] = serde_json::json!(false);
    }

    body
}

pub fn anthropic_to_openai_responses_request(data: &serde_json::Value) -> serde_json::Value {
    let max_tokens = data
        .get("max_tokens")
        .and_then(|value| value.as_u64())
        .unwrap_or(1024);

    // Responses API 的 input 应该是纯字符串，取最后一条 user 消息
    let input = extract_last_user_message_as_string(data);

    let mut body = serde_json::json!({
        "model": data.get("model").cloned().unwrap_or_else(|| serde_json::json!("")),
        "input": input,
        "max_output_tokens": max_tokens
    });

    // 传递 temperature 参数
    if let Some(temperature) = data.get("temperature") {
        body["temperature"] = temperature.clone();
    }

    // 传递 top_p 参数
    if let Some(top_p) = data.get("top_p") {
        body["top_p"] = top_p.clone();
    }

    // 转换 stop_sequences
    if let Some(stop_sequences) = data.get("stop_sequences").and_then(|v| v.as_array()) {
        body["stop"] = serde_json::json!(stop_sequences);
    }

    body
}

pub fn anthropic_to_gemini_request(data: &serde_json::Value) -> serde_json::Value {
    let max_tokens = data
        .get("max_tokens")
        .and_then(|value| value.as_u64())
        .unwrap_or(1024);

    let contents = data
        .get("messages")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .map(|item| {
                    let role = item
                        .get("role")
                        .and_then(|role| role.as_str())
                        .unwrap_or("user");
                    let gemini_role = if role == "assistant" { "model" } else { "user" };
                    let text = item
                        .get("content")
                        .map(anthropic_content_to_text)
                        .unwrap_or_default();
                    serde_json::json!({
                        "role": gemini_role,
                        "parts": [{"text": text}]
                    })
                })
                .collect::<Vec<_>>()
        })
        .filter(|items| !items.is_empty())
        .unwrap_or_else(|| {
            vec![serde_json::json!({
                "role": "user",
                "parts": [{"text": "Hello"}]
            })]
        });

    let mut body = serde_json::json!({
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": max_tokens
        }
    });

    if let Some(system) = data.get("system") {
        let text = anthropic_content_to_text(system);
        if !text.trim().is_empty() {
            body["systemInstruction"] = serde_json::json!({
                "parts": [{"text": text}]
            });
        }
    }

    if let Some(temperature) = data.get("temperature").and_then(|value| value.as_f64()) {
        body["generationConfig"]["temperature"] = serde_json::json!(temperature);
    }

    // 传递 top_p 参数
    if let Some(top_p) = data.get("top_p").and_then(|value| value.as_f64()) {
        body["generationConfig"]["topP"] = serde_json::json!(top_p);
    }

    // 转换 stop_sequences
    if let Some(stop_sequences) = data.get("stop_sequences").and_then(|v| v.as_array()) {
        let stops: Vec<_> = stop_sequences
            .iter()
            .filter_map(|s| s.as_str().map(String::from))
            .collect();
        if !stops.is_empty() {
            body["generationConfig"]["stopSequences"] = serde_json::json!(stops);
        }
    }

    body
}

pub fn strip_trailing_suffixes(base_url: &str, suffixes: &[&str]) -> String {
    let mut normalized = base_url.trim().trim_end_matches('/').to_string();
    loop {
        let mut changed = false;
        for suffix in suffixes {
            if normalized.ends_with(suffix) {
                normalized = normalized[..normalized.len() - suffix.len()]
                    .trim_end_matches('/')
                    .to_string();
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    normalized
}

pub fn build_openai_style_url(base_url: &str, leaf: &str) -> String {
    let normalized =
        strip_trailing_suffixes(base_url, &["/chat/completions", "/responses", "/models"]);
    if normalized.ends_with("/v1")
        || normalized.ends_with("/v1beta/openai")
        || normalized.ends_with("/openai")
    {
        format!("{}/{}", normalized, leaf)
    } else {
        format!("{}/v1/{}", normalized, leaf)
    }
}

pub fn build_openai_chat_url(base_url: &str) -> String {
    build_openai_style_url(base_url, "chat/completions")
}

pub fn build_openai_responses_url(base_url: &str) -> String {
    build_openai_style_url(base_url, "responses")
}

pub fn normalize_gemini_base(base_url: &str) -> String {
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

pub fn normalize_gemini_model_name(model_name: &str) -> String {
    model_name.trim().trim_start_matches("models/").to_string()
}

pub fn normalize_gemini_model_path(model_name: &str) -> String {
    format!("models/{}", normalize_gemini_model_name(model_name))
}
