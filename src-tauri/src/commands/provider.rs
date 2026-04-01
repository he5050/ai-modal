use crate::commands::model::ModelResult;
use crate::providers::router;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
}

/// 获取指定 Provider 的模型列表
#[tauri::command]
pub async fn list_models_by_provider(
    base_url: String,
    api_key: String,
) -> Result<Vec<String>, String> {
    router::list_models(&base_url, &api_key).await
}

/// 并发检测指定 Provider 的所有模型
#[tauri::command]
pub async fn test_models_by_provider(
    base_url: String,
    api_key: String,
    models: Vec<String>,
) -> Result<Vec<ModelResult>, String> {
    router::test_models(&base_url, &api_key, models).await
}

/// 检测单个模型
#[tauri::command]
pub async fn test_single_model_by_provider(
    base_url: String,
    api_key: String,
    model: String,
) -> Result<ModelResult, String> {
    router::test_single_model(&base_url, &api_key, &model).await
}
