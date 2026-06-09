use std::path::PathBuf;

const ZSHRC_PATH: &str = "~/.zshrc";

fn expand_home(path: &str) -> Result<PathBuf, String> {
    if path.starts_with("~/") {
        let home = dirs::home_dir().ok_or("无法获取 home 目录")?;
        Ok(home.join(&path[2..]))
    } else {
        Ok(PathBuf::from(path))
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvConfigResult {
    pub success: bool,
    pub message: String,
    pub current_value: Option<String>,
}
