use reqwest::Client;
use serde::Deserialize;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Semaphore;

use crate::commands::model::ModelResult;

#[derive(Debug, Deserialize)]
struct ModelsResponse {
    data: Vec<ModelData>,
}

#[derive(Debug, Deserialize)]
struct ModelData {
    id: String,
}

pub struct OpenAIProvider {
    pub base_url: String,
    pub api_key: String,
}

impl OpenAIProvider {
    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            api_key: api_key.into(),
        }
    }

    fn client() -> Result<Client, String> {
        Client::builder()
            .timeout(Duration::from_secs(10))
            .use_rustls_tls()
            .build()
            .map_err(|e| e.to_string())
    }

    pub async fn list_models(&self) -> Result<Vec<String>, String> {
        let client = Self::client()?;
        let url = if self.base_url.ends_with("/v1") {
            format!("{}/models", self.base_url)
        } else {
            format!("{}/v1/models", self.base_url)
        };

        let resp = client
            .get(&url)
            .bearer_auth(&self.api_key)
            .send()
            .await
            .map_err(|e| classify_error(None, &e.to_string()))?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(classify_error(Some(status), &body));
        }

        let data: ModelsResponse = resp
            .json()
            .await
            .map_err(|e| format!("解析响应失败：{}", e))?;

        Ok(data.data.into_iter().map(|m| m.id).collect())
    }

    pub async fn test_models(&self, models: Vec<String>) -> Vec<ModelResult> {
        let client = Arc::new(Self::client().unwrap());
        let semaphore = Arc::new(Semaphore::new(5));
        let base_url = Arc::new(self.base_url.clone());
        let api_key = Arc::new(self.api_key.clone());

        let mut handles = Vec::new();
        for model_id in models {
            let client = client.clone();
            let sem = semaphore.clone();
            let base = base_url.clone();
            let key = api_key.clone();
            handles.push(tokio::spawn(async move {
                let _permit = sem.acquire().await.unwrap();
                test_single(&client, &base, &key, &model_id).await
            }));
        }

        let mut results = Vec::new();
        for h in handles {
            match h.await {
                Ok(r) => results.push(r),
                Err(e) => results.push(ModelResult {
                    model: "unknown".to_string(),
                    available: false,
                    latency_ms: None,
                    error: Some(format!("任务异常：{}", e)),
                    response_text: Some(format!("任务异常：{}", e)),
                }),
            }
        }
        results
    }
}

async fn test_single(client: &Client, base_url: &str, api_key: &str, model_id: &str) -> ModelResult {
    let url = if base_url.ends_with("/v1") {
        format!("{}/chat/completions", base_url)
    } else {
        format!("{}/v1/chat/completions", base_url)
    };
    let body = serde_json::json!({
        "model": model_id,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 1,
        "stream": false
    });
    let start = Instant::now();
    let resp = match client.post(&url).bearer_auth(api_key).json(&body).send().await {
        Ok(r) => r,
        Err(e) => return ModelResult {
            model: model_id.to_string(),
            available: false,
            latency_ms: None,
            error: Some(classify_error(None, &e.to_string())),
            response_text: Some(e.to_string()),
        },
    };
    let latency_ms = start.elapsed().as_millis() as u64;
    let status = resp.status().as_u16();
    if resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        ModelResult {
            model: model_id.to_string(),
            available: true,
            latency_ms: Some(latency_ms),
            error: None,
            response_text: Some(body),
        }
    } else {
        let body = resp.text().await.unwrap_or_default();
        ModelResult {
            model: model_id.to_string(),
            available: false,
            latency_ms: Some(latency_ms),
            error: Some(classify_error(Some(status), &body)),
            response_text: Some(body),
        }
    }
}

fn classify_error(status: Option<u16>, msg: &str) -> String {
    match status {
        Some(401) => "认证失败（401）：API Key 无效".to_string(),
        Some(403) => "权限不足（403）".to_string(),
        Some(404) => "模型不存在（404）".to_string(),
        Some(429) => "请求过于频繁（429）：触发限流".to_string(),
        Some(c) if c >= 500 => format!("服务端错误（{}）", c),
        _ => {
            if msg.contains("timed out") || msg.contains("timeout") {
                "请求超时（>10s）".to_string()
            } else {
                format!("未知错误：{}", &msg[..msg.len().min(100)])
            }
        }
    }
}
