use crate::commands::model::ModelResult;
use crate::providers::router;

#[tauri::command]
pub async fn test_model_config(
    base_url: String,
    api_key: String,
    model: String,
) -> Result<ModelResult, String> {
    router::test_single_model(&base_url, &api_key, &model).await
}
