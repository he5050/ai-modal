use std::path::PathBuf;

use crate::commands::model_mapping::types::{
    ModelMappingConfig, CLAUDE_CONFIG_ID,
};
use crate::commands::model_mapping::config::{
    current_port, flatten_config, home_dir, load_config_file,
    validate_config, write_with_retry,
};

fn claude_3p_dir() -> Option<PathBuf> {
    let home = home_dir();

    #[cfg(target_os = "macos")]
    let dir = home.join("Library/Application Support/Claude-3p");

    #[cfg(target_os = "windows")]
    let dir = {
        let localappdata = std::env::var("LOCALAPPDATA")
            .ok()
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData/Local"));
        let packages = localappdata.join("Packages");
        let store_dir = std::fs::read_dir(&packages).ok().and_then(|entries| {
            entries.flatten().find_map(|entry| {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("Claude_") || name.starts_with("Claude_pzs8sxrjxfjjc") {
                    Some(entry.path().join("LocalCache/Roaming/Claude-3p"))
                } else {
                    None
                }
            })
        });
        store_dir.unwrap_or_else(|| {
            let appdata = std::env::var("APPDATA")
                .ok()
                .map(PathBuf::from)
                .unwrap_or_else(|| home.join("AppData/Roaming"));
            appdata.join("Claude-3p")
        })
    };

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let dir = home.join(".config/Claude-3p");

    Some(dir)
}

fn windows_claude_fallback_dirs(primary_3p: &PathBuf) -> Vec<(PathBuf, PathBuf)> {
    #[cfg(target_os = "windows")]
    {
        let appdata = PathBuf::from(std::env::var("APPDATA").unwrap_or_default());
        let localappdata = PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default());
        let candidates = [
            (appdata.join("Claude-3p"), appdata.join("Claude")),
            (localappdata.join("Claude-3p"), localappdata.join("Claude")),
        ];
        candidates
            .into_iter()
            .filter(|(three_p, _)| three_p != primary_3p)
            .collect()
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = primary_3p;
        Vec::new()
    }
}

fn write_json_atomic(path: &PathBuf, value: &serde_json::Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("无法创建目录 {}: {}", parent.display(), err))?;
    }
    let data = serde_json::to_string_pretty(value).map_err(|err| err.to_string())?;
    let tmp = path.with_extension("json.tmp");
    write_with_retry(&tmp, &data)?;
    std::fs::rename(&tmp, path).map_err(|err| format!("无法更新 {}: {}", path.display(), err))
}

fn write_claude_gateway_config(
    config: &ModelMappingConfig,
    validate: bool,
) -> Result<String, String> {
    if validate {
        validate_config(config)?;
    }
    let port = current_port();
    let claude_dir = claude_3p_dir().ok_or_else(|| "无法定位 Claude-3p 目录。".to_string())?;
    let config_lib = claude_dir.join("configLibrary");
    std::fs::create_dir_all(&config_lib)
        .map_err(|err| format!("无法创建目录 {}: {}", config_lib.display(), err))?;

    let flat = flatten_config(config);
    let models: Vec<serde_json::Value> = flat
        .iter()
        .map(|entry| {
            serde_json::json!({
                "name": entry.slot,
                "supports1m": entry.supports_1m
            })
        })
        .collect();

    let meta_path = config_lib.join("_meta.json");
    let mut meta = read_json_or_empty(&meta_path);
    let applied_id = meta
        .get("appliedId")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let target_id =
        if !applied_id.is_empty() && config_lib.join(format!("{}.json", applied_id)).exists() {
            applied_id
        } else {
            CLAUDE_CONFIG_ID.to_string()
        };

    let config_file = config_lib.join(format!("{}.json", target_id));
    let mut gateway = read_json_or_empty(&config_file);
    gateway["coworkEgressAllowedHosts"] = serde_json::json!(["*"]);
    gateway["inferenceProvider"] = serde_json::json!("gateway");
    gateway["inferenceGatewayBaseUrl"] = serde_json::json!(format!("http://127.0.0.1:{}", port));
    gateway["inferenceGatewayApiKey"] = serde_json::json!("proxy");
    gateway["inferenceGatewayAuthScheme"] = serde_json::json!("bearer");
    gateway["inferenceModels"] = serde_json::json!(models);
    write_json_atomic(&config_file, &gateway)?;

    if target_id == CLAUDE_CONFIG_ID {
        meta["appliedId"] = serde_json::json!(CLAUDE_CONFIG_ID);
        let entries = meta
            .get("entries")
            .and_then(|value| value.as_array())
            .cloned()
            .unwrap_or_default();
        let mut next_entries: Vec<serde_json::Value> = entries
            .into_iter()
            .filter(|entry| {
                entry
                    .get("id")
                    .and_then(|value| value.as_str())
                    .map(|id| {
                        id == CLAUDE_CONFIG_ID || config_lib.join(format!("{}.json", id)).exists()
                    })
                    .unwrap_or(false)
            })
            .collect();
        if !next_entries
            .iter()
            .any(|entry| entry.get("id").and_then(|value| value.as_str()) == Some(CLAUDE_CONFIG_ID))
        {
            next_entries
                .push(serde_json::json!({"id": CLAUDE_CONFIG_ID, "name": "AIModal Model Mapping"}));
        }
        meta["entries"] = serde_json::json!(next_entries);
        write_json_atomic(&meta_path, &meta)?;
    }

    let desktop_config_path = claude_dir.join("claude_desktop_config.json");
    let mut desktop_config = read_json_or_empty(&desktop_config_path);
    desktop_config["deploymentMode"] = serde_json::json!("3p");
    write_json_atomic(&desktop_config_path, &desktop_config)?;

    for (three_p_dir, claude_normal_dir) in windows_claude_fallback_dirs(&claude_dir) {
        let _ = write_deployment_mode(&three_p_dir.join("claude_desktop_config.json"));
        let _ = write_deployment_mode(&claude_normal_dir.join("claude_desktop_config.json"));
        let normal_dev = claude_normal_dir.join("developer_settings.json");
        if !normal_dev.exists() {
            let _ = write_json_atomic(&normal_dev, &serde_json::json!({"allowDevTools": true}));
        }
        let three_p_dev = three_p_dir.join("developer_settings.json");
        if !three_p_dev.exists() {
            let _ = write_json_atomic(&three_p_dev, &serde_json::json!({"allowDevTools": true}));
        }
    }

    Ok(format!("已写入 {}", config_file.display()))
}

pub fn apply_to_claude_desktop(config: &ModelMappingConfig) -> Result<String, String> {
    write_claude_gateway_config(config, true)
}

fn write_deployment_mode(path: &PathBuf) -> Result<(), String> {
    let mut config = read_json_or_empty(path);
    config["deploymentMode"] = serde_json::json!("3p");
    write_json_atomic(path, &config)
}

pub fn ensure_model_mapping_claude_gateway() {
    let config = load_config_file();
    if let Err(err) = write_claude_gateway_config(&config, false) {
        eprintln!("[model-mapping] auto gateway config failed: {}", err);
    }
}

fn read_json_or_empty(path: &PathBuf) -> serde_json::Value {
    if !path.exists() {
        return serde_json::json!({});
    }
    std::fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

pub fn restart_claude_desktop() {
    std::thread::spawn(|| {
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("osascript")
                .args(["-e", "tell application \"Claude\" to quit"])
                .output();
            for _ in 0..15 {
                std::thread::sleep(std::time::Duration::from_millis(500));
                if let Ok(output) = std::process::Command::new("pgrep")
                    .args(["-x", "Claude"])
                    .output()
                {
                    if output.stdout.is_empty() {
                        break;
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
            let _ = std::process::Command::new("open")
                .args(["-a", "Claude"])
                .output();
        }

        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("powershell")
                .args([
                    "-WindowStyle",
                    "Hidden",
                    "-Command",
                    r#"
                    $proc = Get-Process -Name 'Claude' -ErrorAction SilentlyContinue | Select-Object -First 1
                    $path = if ($proc) { $proc.Path } else { $null }
                    Stop-Process -Name 'Claude' -Force -ErrorAction SilentlyContinue
                    Start-Sleep -Seconds 3
                    if ($path -like '*WindowsApps*') {
                        $pkg = Get-AppxPackage | Where-Object { $path.StartsWith($_.InstallLocation) } | Select-Object -First 1
                        if ($pkg) { explorer.exe "shell:AppsFolder\$($pkg.PackageFamilyName)!Claude" }
                    } elseif ($path) {
                        Start-Process $path
                    }
                    "#,
                ])
                .output();
        }
    });
}

fn autostart_plist_path() -> PathBuf {
    home_dir().join("Library/LaunchAgents/com.ai-modal.model-mapping.plist")
}

pub fn is_autostart_enabled() -> bool {
    #[cfg(target_os = "macos")]
    {
        autostart_plist_path().exists()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

pub fn set_autostart(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let plist_path = autostart_plist_path();
        if enabled {
            let exe = std::env::current_exe().map_err(|err| err.to_string())?;
            let escaped = exe
                .display()
                .to_string()
                .replace('&', "&amp;")
                .replace('<', "&lt;")
                .replace('>', "&gt;")
                .replace('"', "&quot;")
                .replace('\'', "&apos;");
            let content = format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"\>
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ai-modal.model-mapping</string>
    <key>ProgramArguments</key>
    <array>
        <string>{}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>"#,
                escaped
            );
            if let Some(parent) = plist_path.parent() {
                std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
            }
            std::fs::write(&plist_path, content).map_err(|err| err.to_string())?;
        } else {
            let _ = std::fs::remove_file(&plist_path);
        }
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        if enabled {
            Err("当前只支持 macOS 开机自启。".to_string())
        } else {
            Ok(())
        }
    }
}
