import { invoke } from "@tauri-apps/api/core";

/**
 * 带超时的 invoke 包装器。
 * 默认 30 秒超时，防止网络请求无限挂起。
 */
const DEFAULT_TIMEOUT_MS = 30_000;

function invokeWithTimeout<T>(
  cmd: string,
  args?: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return invoke<T>(cmd, args).finally(() => clearTimeout(timeout));
}
import type {
  EnrichSkillRequest,
  LocalizedOnlineSkillDetail,
  McpServerConfigInput,
  McpServerTestResult,
  ModelscopeDetailResponse,
  ModelscopeRequestProfileInput,
  ModelscopeSearchResponse,
  SkillEnrichmentJobRequest,
  SkillEnrichmentJobSnapshot,
  ModelMappingConfig,
  ModelMappingLogEntry,
  ModelMappingSettings,
  ModelMappingStatus,
  ModelMappingTestResult,
  ModelResult,
  OnlineSkillDetail,
  OnlineSearchResponse,
  SkillEnrichmentRecord,
  SkillTargetConfig,
  SkillTargetStatus,
  SkillsCatalogSnapshot,
  SkillsCommandRequest,
  SkillsCommandResult,
  SystemLlmSnapshot,
  SyncSkillTargetResult,
  CliProxyConfig,
  CliProxyStatus,
  CliProxyTestResult,
} from "./types";

export async function listModels(
  baseUrl: string,
  apiKey: string,
): Promise<string[]> {
  return invokeWithTimeout("list_models", { baseUrl, apiKey });
}

export async function testModels(
  baseUrl: string,
  apiKey: string,
  models: string[],
): Promise<ModelResult[]> {
  return invoke("test_models", { baseUrl, apiKey, models });
}

export async function listModelsByProvider(
  baseUrl: string,
  apiKey: string,
): Promise<string[]> {
  return invokeWithTimeout("list_models_by_provider", { baseUrl, apiKey });
}

export async function testModelsByProvider(
  baseUrl: string,
  apiKey: string,
  models: string[],
): Promise<ModelResult[]> {
  return invoke("test_models_by_provider", { baseUrl, apiKey, models });
}

export async function testSingleModelByProvider(
  baseUrl: string,
  apiKey: string,
  model: string,
  protocols?: string[],
): Promise<ModelResult> {
  return invokeWithTimeout("test_single_model_by_provider", {
    baseUrl,
    apiKey,
    model,
    protocols: protocols ?? null,
  }, 60_000);
}

export async function testModelConfig(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<ModelResult> {
  return invokeWithTimeout("test_model_config", { baseUrl, apiKey, model }, 60_000);
}

export async function loadModelMappingConfig(): Promise<ModelMappingConfig> {
  return invoke("load_model_mapping_config");
}

export async function loadModelMappingSettings(): Promise<ModelMappingSettings> {
  return invoke("load_model_mapping_settings");
}

export async function saveModelMappingSettings(
  settings: ModelMappingSettings,
): Promise<ModelMappingStatus> {
  return invoke("save_model_mapping_settings", { settings });
}

export async function saveModelMappingConfig(
  config: ModelMappingConfig,
): Promise<ModelMappingStatus> {
  return invoke("save_model_mapping_config", { config });
}

export async function applyModelMappingToClaude(
  config: ModelMappingConfig,
): Promise<string> {
  return invoke("apply_model_mapping_to_claude", { config });
}

export async function startModelMappingGateway(
  config: ModelMappingConfig,
): Promise<ModelMappingStatus> {
  return invoke("start_model_mapping_gateway", { config });
}

export async function stopModelMappingGateway(): Promise<ModelMappingStatus> {
  return invoke("stop_model_mapping_gateway");
}

export async function testMcpServer(
  name: string,
  config: McpServerConfigInput,
): Promise<McpServerTestResult> {
  return invoke("test_mcp_server", { name, config });
}

export async function searchModelscopeMcpServers(
  query: string,
  limit = 20,
  profile?: ModelscopeRequestProfileInput | null,
): Promise<ModelscopeSearchResponse> {
  return invoke("search_modelscope_mcp_servers", {
    query,
    limit,
    profile: profile ?? null,
  });
}

export async function inspectModelscopeMcpServer(
  serverId: string,
  profile?: ModelscopeRequestProfileInput | null,
): Promise<ModelscopeDetailResponse> {
  return invoke("inspect_modelscope_mcp_server", {
    serverId,
    profile: profile ?? null,
  });
}

export async function getModelMappingStatus(): Promise<ModelMappingStatus> {
  return invoke("get_model_mapping_status");
}

export async function getModelMappingLogs(): Promise<ModelMappingLogEntry[]> {
  return invoke("get_model_mapping_logs");
}

export async function testModelMappingProvider(request: {
  target_url: string;
  api_key: string;
  model: string;
  protocol?: string | null;
}): Promise<ModelMappingTestResult> {
  return invoke("test_model_mapping_provider", { request });
}

export async function getModelMappingAutostart(): Promise<boolean> {
  return invoke("get_model_mapping_autostart");
}

export async function setModelMappingAutostart(enabled: boolean): Promise<boolean> {
  return invoke("set_model_mapping_autostart", { enabled });
}

// CLI Proxy APIs
export async function loadCliProxyConfig(): Promise<CliProxyConfig> {
  return invoke("load_cli_proxy_config");
}

export async function saveCliProxyConfig(
  config: CliProxyConfig,
): Promise<CliProxyStatus> {
  return invoke("save_cli_proxy_config", { config });
}

export async function getCliProxyStatus(): Promise<CliProxyStatus> {
  return invoke("get_cli_proxy_status");
}

export async function startCliProxyService(
  toolId: string,
): Promise<CliProxyStatus> {
  return invoke("start_cli_proxy_service", { toolId });
}

export async function stopCliProxyService(
  toolId: string,
): Promise<CliProxyStatus> {
  return invoke("stop_cli_proxy_service", { toolId });
}

export async function testCliProxyConnection(
  toolId: string,
): Promise<CliProxyTestResult> {
  return invoke("test_cli_proxy_connection", { toolId });
}

// ─── Curl Task APIs ───────────────────────────────────────────────

import type {
  CurlTask,
  CurlTaskExecuteResult,
  ParsedCurl,
} from "./types";

export async function loadCurlTasks(): Promise<CurlTask[]> {
  return invoke("load_curl_tasks");
}

export async function saveCurlTask(task: CurlTask): Promise<void> {
  return invoke("save_curl_task", { task });
}

export async function deleteCurlTask(id: string): Promise<void> {
  return invoke("delete_curl_task", { id });
}

export async function executeCurlTask(id: string): Promise<CurlTaskExecuteResult> {
  return invoke("execute_curl_task", { id });
}

export async function executeCurlDirect(parsed: ParsedCurl): Promise<CurlTaskExecuteResult> {
  return invoke("execute_curl_direct", { parsed });
}

export async function executeCurlRaw(curl: string): Promise<CurlTaskExecuteResult> {
  return invoke("execute_curl_raw", { curl });
}

// Codex API Key 管理
export interface EnvConfigResult {
  success: boolean;
  message: string;
  currentValue?: string | null;
}

export async function parseCurlCommand(curl: string): Promise<ParsedCurl> {
  return invoke("parse_curl_command", { curl });
}

export async function scanLocalSkills(): Promise<SkillsCatalogSnapshot> {
  return invoke("scan_local_skills");
}

export async function inspectSkillTargets(
  targets: SkillTargetConfig[],
): Promise<SkillTargetStatus[]> {
  return invoke("inspect_skill_targets", { targets });
}

export async function syncSkillTargets(
  targets: SkillTargetConfig[],
): Promise<SyncSkillTargetResult[]> {
  return invoke("sync_skill_targets", { targets });
}

export async function runSkillsCommand(
  request: SkillsCommandRequest,
): Promise<SkillsCommandResult> {
  return invoke("run_skills_command", { request });
}

export async function searchOnlineSkills(
  query: string,
  limit = 20,
  source?: string,
): Promise<OnlineSearchResponse> {
  return invoke("search_online_skills", {
    query,
    limit,
    source: source ?? null,
  });
}

export async function inspectOnlineSkill(
  skillId: string,
  source: string,
): Promise<OnlineSkillDetail> {
  return invoke("inspect_online_skill", {
    skillId,
    source,
  });
}

export async function translateOnlineSkillDetail(request: {
  baseUrl: string;
  apiKey: string;
  model: string;
  requestKind: SkillEnrichmentRecord["requestKind"];
  providerLabel?: string | null;
  skillDir: string;
  skillName: string;
  detail: OnlineSkillDetail;
}): Promise<LocalizedOnlineSkillDetail> {
  return invoke("translate_online_skill_detail", { request });
}

export async function resolveSystemLlm(): Promise<SystemLlmSnapshot> {
  return invoke("resolve_system_llm");
}

export async function enrichSingleSkill(
  request: EnrichSkillRequest,
): Promise<SkillEnrichmentRecord> {
  return invoke("enrich_single_skill", { request });
}

export async function startSkillEnrichmentJob(
  request: SkillEnrichmentJobRequest,
): Promise<SkillEnrichmentJobSnapshot> {
  return invoke("start_skill_enrichment_job", { request });
}

export async function getSkillEnrichmentJobStatus(): Promise<SkillEnrichmentJobSnapshot | null> {
  return invoke("get_skill_enrichment_job_status");
}

export async function stopSkillEnrichmentJob(): Promise<SkillEnrichmentJobSnapshot | null> {
  return invoke("stop_skill_enrichment_job");
}

// ─── Codex Proxy APIs ───────────────────────────────────────────────

import type {
  CodexProxyConfig,
  CodexProxySettings,
  CodexProxyStatus,
  CodexProxyTestResult,
  CodexProxyLogEntry,
} from "./types";

export async function loadCodexProxyConfig(): Promise<CodexProxyConfig> {
  return invoke("load_codex_proxy_config");
}

export async function saveCodexProxyConfig(config: CodexProxyConfig): Promise<CodexProxyStatus> {
  return invoke("save_codex_proxy_config", { config });
}

export async function loadCodexProxySettings(): Promise<CodexProxySettings> {
  return invoke("load_codex_proxy_settings");
}

export async function saveCodexProxySettings(settings: CodexProxySettings): Promise<void> {
  return invoke("save_codex_proxy_settings", { settings });
}

export async function getCodexProxyStatus(): Promise<CodexProxyStatus> {
  return invoke("get_codex_proxy_status");
}

export async function startCodexProxyGateway(config: CodexProxyConfig): Promise<CodexProxyStatus> {
  return invoke("start_codex_proxy_gateway", { config });
}

export async function stopCodexProxyGateway(): Promise<CodexProxyStatus> {
  return invoke("stop_codex_proxy_gateway");
}

export async function testCodexProxyProvider(
  targetUrl: string,
  apiKey: string,
  model: string
): Promise<CodexProxyTestResult> {
  return invoke("test_codex_proxy_provider", { targetUrl, apiKey, model });
}

export async function getCodexProxyLogs(): Promise<CodexProxyLogEntry[]> {
  return invoke("get_codex_proxy_logs");
}

export async function setCodexProxyAutostart(enabled: boolean): Promise<boolean> {
  return invoke("set_codex_proxy_autostart", { enabled });
}

export async function applyCodexProxyToCodex(config: CodexProxyConfig): Promise<string> {
  return invoke("apply_codex_proxy_to_codex", { config });
}
