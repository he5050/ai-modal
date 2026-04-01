use serde::Serialize;

use crate::providers::router;

#[derive(Debug, Serialize, Clone)]
pub struct ModelResult {
    pub model: String,
    pub available: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
    pub response_text: Option<String>,
}

#[tauri::command]
pub async fn list_models(base_url: String, api_key: String) -> Result<Vec<String>, String> {
    router::list_models(&base_url, &api_key).await
}

#[tauri::command]
pub async fn test_models(
    base_url: String,
    api_key: String,
    models: Vec<String>,
) -> Result<Vec<ModelResult>, String> {
    router::test_models(&base_url, &api_key, models).await
}
