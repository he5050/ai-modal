use std::path::PathBuf;

use crate::commands::curl_task::types::CurlTask;

pub fn curl_task_config_dir() -> PathBuf {
    home_dir().join(".aimodal-curl-tasks")
}

pub fn curl_task_file_path(id: &str) -> PathBuf {
    curl_task_config_dir().join(format!("{}.json", id))
}

pub fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

pub fn load_all_curl_tasks() -> Vec<CurlTask> {
    let dir = curl_task_config_dir();
    if !dir.exists() {
        return Vec::new();
    }
    let mut tasks = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(data) = std::fs::read_to_string(&path) {
                    if let Ok(task) = serde_json::from_str::<CurlTask>(&data) {
                        tasks.push(task);
                    }
                }
            }
        }
    }
    tasks.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    tasks
}

pub fn save_curl_task_file(task: &CurlTask) -> Result<(), String> {
    let dir = curl_task_config_dir();
    std::fs::create_dir_all(&dir).map_err(|err| format!("创建配置目录失败：{}", err))?;
    let data = serde_json::to_string_pretty(task).map_err(|err| format!("序列化配置失败：{}", err))?;
    std::fs::write(curl_task_file_path(&task.id), data)
        .map_err(|err| format!("写入配置失败：{}", err))
}

pub fn delete_curl_task_file(id: &str) -> Result<(), String> {
    let path = curl_task_file_path(id);
    if path.exists() {
        std::fs::remove_file(path).map_err(|err| format!("删除配置失败：{}", err))
    } else {
        Ok(())
    }
}
