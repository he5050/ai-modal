use crate::commands::skill_enrichment::{enrich_single_skill, EnrichSkillRequest, SkillEnrichmentRecord};
use crate::providers::router::LlmRequestKind;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

const SKILL_ENRICHMENT_EVENT: &str = "skill-enrichment-progress";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SkillAnnotationMode {
    Full,
    Incremental,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SkillEnrichmentJobStatus {
    Idle,
    Waiting,
    Running,
    Stopped,
    Done,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillEnrichmentJobItem {
    pub skill_dir: String,
    pub skill_path: String,
    pub description: String,
    pub categories: Vec<String>,
    pub updated_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillEnrichmentJobRequest {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub request_kind: LlmRequestKind,
    pub provider_label: Option<String>,
    pub mode: SkillAnnotationMode,
    pub delay_ms: Option<u64>,
    pub skills: Vec<SkillEnrichmentJobItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillEnrichmentJobSnapshot {
    pub run_id: u64,
    pub mode: SkillAnnotationMode,
    pub status: SkillEnrichmentJobStatus,
    pub total: usize,
    pub completed: usize,
    pub current_skill_dir: Option<String>,
    pub current_skill_name: Option<String>,
    pub next_run_at: Option<u64>,
    pub message: String,
    pub error_message: Option<String>,
    pub provider_label: Option<String>,
    pub model: String,
    pub request_kind: LlmRequestKind,
    pub started_at: u64,
    pub updated_at: u64,
    pub records: BTreeMap<String, SkillEnrichmentRecord>,
}

#[derive(Debug, Default)]
struct SkillEnrichmentJobRuntime {
    snapshot: Option<SkillEnrichmentJobSnapshot>,
    active_run_id: Option<u64>,
    stop_requested: bool,
}

#[derive(Clone, Default)]
pub struct SkillEnrichmentJobManager {
    inner: Arc<Mutex<SkillEnrichmentJobRuntime>>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn emit_snapshot(app: &AppHandle, snapshot: &SkillEnrichmentJobSnapshot) {
    let _ = app.emit(SKILL_ENRICHMENT_EVENT, snapshot.clone());
}

fn build_running_record(
    item: &SkillEnrichmentJobItem,
    request: &SkillEnrichmentJobRequest,
    previous: Option<&SkillEnrichmentRecord>,
) -> SkillEnrichmentRecord {
    SkillEnrichmentRecord {
        skill_dir: item.skill_dir.clone(),
        skill_path: item.skill_path.clone(),
        source_updated_at: item.updated_at,
        source_description: item.description.clone(),
        localized_description: previous
            .map(|record| record.localized_description.clone())
            .unwrap_or_default(),
        full_description: previous
            .map(|record| record.full_description.clone())
            .unwrap_or_default(),
        content_summary: previous
            .map(|record| record.content_summary.clone())
            .unwrap_or_default(),
        usage: previous.map(|record| record.usage.clone()).unwrap_or_default(),
        scenarios: previous
            .map(|record| record.scenarios.clone())
            .unwrap_or_default(),
        tags: previous
            .map(|record| record.tags.clone())
            .unwrap_or_default(),
        status: "running".to_string(),
        provider_label: request.provider_label.clone(),
        model: request.model.clone(),
        request_kind: request.request_kind,
        raw_response: previous.and_then(|record| record.raw_response.clone()),
        error_message: None,
        enriched_at: previous.and_then(|record| record.enriched_at),
    }
}

fn build_error_record(
    item: &SkillEnrichmentJobItem,
    request: &SkillEnrichmentJobRequest,
    error_message: &str,
) -> SkillEnrichmentRecord {
    SkillEnrichmentRecord {
        skill_dir: item.skill_dir.clone(),
        skill_path: item.skill_path.clone(),
        source_updated_at: item.updated_at,
        source_description: item.description.clone(),
        localized_description: String::new(),
        full_description: String::new(),
        content_summary: String::new(),
        usage: String::new(),
        scenarios: String::new(),
        tags: item.categories.clone(),
        status: "error".to_string(),
        provider_label: request.provider_label.clone(),
        model: request.model.clone(),
        request_kind: request.request_kind,
        raw_response: None,
        error_message: Some(error_message.to_string()),
        enriched_at: Some(now_ms()),
    }
}

async fn current_snapshot(
    manager: &Arc<Mutex<SkillEnrichmentJobRuntime>>,
) -> Option<SkillEnrichmentJobSnapshot> {
    manager.lock().await.snapshot.clone()
}

async fn stop_requested(
    manager: &Arc<Mutex<SkillEnrichmentJobRuntime>>,
    run_id: u64,
) -> bool {
    let runtime = manager.lock().await;
    runtime.active_run_id != Some(run_id) || runtime.stop_requested
}

async fn update_snapshot<F>(
    app: &AppHandle,
    manager: &Arc<Mutex<SkillEnrichmentJobRuntime>>,
    run_id: u64,
    update: F,
) -> Option<SkillEnrichmentJobSnapshot>
where
    F: FnOnce(&mut SkillEnrichmentJobSnapshot),
{
    let snapshot = {
        let mut runtime = manager.lock().await;
        if runtime.active_run_id != Some(run_id) {
            return None;
        }
        let snapshot = runtime.snapshot.as_mut()?;
        update(snapshot);
        snapshot.updated_at = now_ms();
        snapshot.clone()
    };
    emit_snapshot(app, &snapshot);
    Some(snapshot)
}

async fn finish_snapshot(
    app: &AppHandle,
    manager: &Arc<Mutex<SkillEnrichmentJobRuntime>>,
    run_id: u64,
    status: SkillEnrichmentJobStatus,
    message: String,
    error_message: Option<String>,
    current_skill_dir: Option<String>,
    current_skill_name: Option<String>,
) -> Option<SkillEnrichmentJobSnapshot> {
    let snapshot = {
        let mut runtime = manager.lock().await;
        if runtime.active_run_id != Some(run_id) {
            return runtime.snapshot.clone();
        }
        runtime.stop_requested = false;
        runtime.active_run_id = None;
        let snapshot = runtime.snapshot.as_mut()?;
        snapshot.status = status;
        snapshot.message = message;
        snapshot.error_message = error_message;
        snapshot.current_skill_dir = current_skill_dir;
        snapshot.current_skill_name = current_skill_name;
        snapshot.next_run_at = None;
        snapshot.updated_at = now_ms();
        snapshot.clone()
    };
    emit_snapshot(app, &snapshot);
    Some(snapshot)
}

async fn run_skill_enrichment_job(
    app: AppHandle,
    manager: Arc<Mutex<SkillEnrichmentJobRuntime>>,
    request: SkillEnrichmentJobRequest,
    run_id: u64,
) {
    let delay_ms = request.delay_ms.unwrap_or(5_000);

    for (index, item) in request.skills.iter().enumerate() {
        if stop_requested(&manager, run_id).await {
            let _ = finish_snapshot(
                &app,
                &manager,
                run_id,
                SkillEnrichmentJobStatus::Stopped,
                "技能注解已中断".to_string(),
                None,
                None,
                None,
            )
            .await;
            return;
        }

        let item_name = item.skill_dir.clone();
        let _ = update_snapshot(&app, &manager, run_id, |snapshot| {
            let previous = snapshot.records.get(&item.skill_dir).cloned();
            snapshot.status = SkillEnrichmentJobStatus::Running;
            snapshot.message = format!("正在注解 {}", item_name);
            snapshot.error_message = None;
            snapshot.current_skill_dir = Some(item.skill_dir.clone());
            snapshot.current_skill_name = Some(item_name.clone());
            snapshot.next_run_at = None;
            snapshot.records.insert(
                item.skill_dir.clone(),
                build_running_record(item, &request, previous.as_ref()),
            );
        })
        .await;

        let item_request = EnrichSkillRequest {
            base_url: request.base_url.clone(),
            api_key: request.api_key.clone(),
            model: request.model.clone(),
            request_kind: request.request_kind,
            skill_dir: item.skill_dir.clone(),
            skill_path: item.skill_path.clone(),
            description: item.description.clone(),
            categories: item.categories.clone(),
            updated_at: item.updated_at,
            provider_label: request.provider_label.clone(),
        };

        match enrich_single_skill(item_request).await {
            Ok(record) => {
                let _ = update_snapshot(&app, &manager, run_id, |snapshot| {
                    snapshot.completed = index + 1;
                    snapshot.records.insert(item.skill_dir.clone(), record);
                })
                .await;
            }
            Err(error) => {
                let message = format!("技能 {} 注解失败", item.skill_dir);
                let error_record = build_error_record(item, &request, &error);
                let snapshot = {
                    let mut runtime = manager.lock().await;
                    if runtime.active_run_id != Some(run_id) {
                        return;
                    }
                    runtime.stop_requested = false;
                    runtime.active_run_id = None;
                    let Some(snapshot) = runtime.snapshot.as_mut() else {
                        return;
                    };
                    snapshot.status = SkillEnrichmentJobStatus::Error;
                    snapshot.message = message;
                    snapshot.error_message = Some(error.clone());
                    snapshot.current_skill_dir = Some(item.skill_dir.clone());
                    snapshot.current_skill_name = Some(item.skill_dir.clone());
                    snapshot.next_run_at = None;
                    snapshot.records.insert(item.skill_dir.clone(), error_record);
                    snapshot.updated_at = now_ms();
                    snapshot.clone()
                };
                emit_snapshot(&app, &snapshot);
                return;
            }
        }

        if index >= request.skills.len().saturating_sub(1) {
            continue;
        }

        let next_run_at = now_ms().saturating_add(delay_ms);
        let _ = update_snapshot(&app, &manager, run_id, |snapshot| {
            snapshot.status = SkillEnrichmentJobStatus::Waiting;
            snapshot.message = format!("等待后继续处理下一个技能");
            snapshot.next_run_at = Some(next_run_at);
        })
        .await;

        while now_ms() < next_run_at {
            if stop_requested(&manager, run_id).await {
                let _ = finish_snapshot(
                    &app,
                    &manager,
                    run_id,
                    SkillEnrichmentJobStatus::Stopped,
                    "技能注解已中断".to_string(),
                    None,
                    None,
                    None,
                )
                .await;
                return;
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    }

    let _ = finish_snapshot(
        &app,
        &manager,
        run_id,
        SkillEnrichmentJobStatus::Done,
        "技能注解队列已完成".to_string(),
        None,
        None,
        None,
    )
    .await;
}

#[tauri::command]
pub async fn start_skill_enrichment_job(
    app: AppHandle,
    manager: State<'_, SkillEnrichmentJobManager>,
    request: SkillEnrichmentJobRequest,
) -> Result<SkillEnrichmentJobSnapshot, String> {
    if request.skills.is_empty() {
        return Err("没有可执行的技能注解任务".to_string());
    }

    let run_id = now_ms();
    let snapshot = {
        let mut runtime = manager.inner.lock().await;
        if let Some(snapshot) = runtime.snapshot.as_ref() {
            if matches!(
                snapshot.status,
                SkillEnrichmentJobStatus::Running | SkillEnrichmentJobStatus::Waiting
            ) {
                return Err("已有技能注解任务正在运行".to_string());
            }
        }

        runtime.stop_requested = false;
        runtime.active_run_id = Some(run_id);
        let snapshot = SkillEnrichmentJobSnapshot {
            run_id,
            mode: request.mode.clone(),
            status: SkillEnrichmentJobStatus::Running,
            total: request.skills.len(),
            completed: 0,
            current_skill_dir: None,
            current_skill_name: None,
            next_run_at: None,
            message: format!(
                "准备使用 {} 执行技能注解",
                request
                    .provider_label
                    .clone()
                    .unwrap_or_else(|| request.model.clone())
            ),
            error_message: None,
            provider_label: request.provider_label.clone(),
            model: request.model.clone(),
            request_kind: request.request_kind,
            started_at: now_ms(),
            updated_at: now_ms(),
            records: BTreeMap::new(),
        };
        runtime.snapshot = Some(snapshot.clone());
        snapshot
    };

    emit_snapshot(&app, &snapshot);

    let manager_handle = manager.inner.clone();
    let app_handle = app.clone();
    tokio::spawn(async move {
        run_skill_enrichment_job(app_handle, manager_handle, request, run_id).await;
    });

    Ok(snapshot)
}

#[tauri::command]
pub async fn get_skill_enrichment_job_status(
    manager: State<'_, SkillEnrichmentJobManager>,
) -> Result<Option<SkillEnrichmentJobSnapshot>, String> {
    Ok(current_snapshot(&manager.inner).await)
}

#[tauri::command]
pub async fn stop_skill_enrichment_job(
    app: AppHandle,
    manager: State<'_, SkillEnrichmentJobManager>,
) -> Result<Option<SkillEnrichmentJobSnapshot>, String> {
    let snapshot = {
        let mut runtime = manager.inner.lock().await;
        if runtime.active_run_id.is_none() {
            runtime.snapshot.clone()
        } else {
            runtime.stop_requested = true;
            if let Some(snapshot) = runtime.snapshot.as_mut() {
                snapshot.message = "已请求停止，等待当前技能完成".to_string();
                snapshot.updated_at = now_ms();
                Some(snapshot.clone())
            } else {
                None
            }
        }
    };

    if let Some(snapshot) = snapshot.as_ref() {
        emit_snapshot(&app, snapshot);
    }

    Ok(snapshot)
}
