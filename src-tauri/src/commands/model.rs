use serde::Serialize;
use std::collections::BTreeMap;

use crate::providers::router;

#[derive(Debug, Serialize, Clone)]
pub struct ProtocolTestResult {
    pub protocol: String,
    pub available: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
    pub response_text: Option<String>,
    pub request_url: Option<String>,
    pub request_method: Option<String>,
    pub request_headers: Option<BTreeMap<String, String>>,
    pub request_body: Option<String>,
    pub response_status: Option<u16>,
    pub response_headers: Option<BTreeMap<String, String>>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ModelResult {
    pub model: String,
    pub available: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
    pub response_text: Option<String>,
    /// 该模型支持的协议列表，按优先级排序
    pub supported_protocols: Vec<String>,
    /// 每个协议各自的测试结果
    pub protocol_results: Vec<ProtocolTestResult>,
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
