use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ParsedCurl {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CurlTask {
    pub id: String,
    pub label: String,
    pub curl: String,
    pub parsed_curl: ParsedCurl,
    #[serde(default)]
    pub selected_fields: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_run_at: Option<u64>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CurlTaskExecuteResult {
    pub ok: bool,
    pub status: u16,
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_debug: Option<RequestDebugInfo>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RequestDebugInfo {
    pub url: String,
    pub method: String,
    pub headers: Vec<(String, String)>,
}
