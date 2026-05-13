export type AppPage =
  | "detect"
  | "models"
  | "model-mapping"
  | "mcp"
  | "skills"
  | "prompts"
  | "prompt-detail"
  | "provider-detail"
  | "rules"
  | "configs"
  | "settings";

export type ConfigFormat = "json" | "toml" | "yaml" | "xml" | "env";

export type ConfigGroupId =
  | "claude"
  | "codex"
  | "gemini"
  | "opencode"
  | "qwen"
  | "snow";

export interface RulePath {
  id: string;
  label: string; // 显示名称，如 "Claude Code"
  path: string; // 绝对路径
  isBuiltin: boolean; // 是否为内置预设
  kind?: "file" | "directory";
  exists?: boolean; // 运行时检测
}

export interface ConfigPath {
  id: string;
  label: string;
  path: string;
  isBuiltin: boolean;
  kind?: "file";
  format?: ConfigFormat;
}

export interface ConfigGroupFileView {
  id: string;
  groupId: ConfigGroupId;
  label: string;
  fileName: string;
  relativePath: string;
  absolutePath: string;
  format: ConfigFormat;
  isBuiltin: boolean;
}

export interface ConfigGroupView {
  id: ConfigGroupId;
  label: string;
  rootDir: string;
  accentClass: string;
  files: ConfigGroupFileView[];
}

export interface ModelResult {
  model: string;
  available: boolean;
  latency_ms: number | null;
  error: string | null;
  response_text?: string | null;
  /** 该模型支持的协议列表，如 ["openai", "claude", "gemini"] */
  supported_protocols?: string[];
  /** 每个协议各自的测试结果 */
  protocol_results?: ProtocolTestResult[];
}

export interface ProtocolTestResult {
  protocol: string;
  available: boolean;
  latency_ms: number | null;
  error: string | null;
  response_text?: string | null;
  request_url?: string | null;
  request_method?: string | null;
  request_headers?: Record<string, string> | null;
  request_body?: string | null;
  response_status?: number | null;
  response_headers?: Record<string, string> | null;
}

export interface ProviderLastResult {
  timestamp: number;
  results: ModelResult[];
}

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  createdAt: number;
  lastResult?: ProviderLastResult;
}

export type ModelMappingThinkingEffort = "" | "off" | "high" | "max";

export interface ModelMappingEntry {
  id?: string;
  name: string;
  slot?: string;
  display_name?: string;
  to_1m: string;
  enabled?: boolean;
  protocol?: LlmRequestKind | "openrouter" | string;
}

export interface ModelMappingProvider {
  id?: string | null;
  name: string;
  target_url: string;
  api_key: string;
  models: ModelMappingEntry[];
  thinking_effort: ModelMappingThinkingEffort | string;
}

export interface ModelMappingConfig {
  providers: ModelMappingProvider[];
}

export interface ModelMappingSettings {
  port: number;
}

export interface ModelMappingFlatEntry {
  slot: string;
  name: string;
  display_name: string;
  provider_name: string;
  target_url: string;
  supports_1m: boolean;
  thinking_effort: string;
  protocol: string;
}

export interface ModelMappingStatus {
  running: boolean;
  autostart: boolean;
  port: number;
  config_path: string;
  claude_dir?: string | null;
  model_count: number;
  mapped_models: ModelMappingFlatEntry[];
}

export interface ModelMappingTestResult {
  ok: boolean;
  status?: number | null;
  message: string;
}

export interface McpServerConfigInput {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
}

export interface McpServerTestResult {
  ok: boolean;
  status: string;
  message: string;
  detail?: string | null;
  latency_ms?: number | null;
}

export interface ModelscopeServerItem {
  id: string;
  publisher: string;
  name: string;
  chinese_name: string;
  description: string;
  tags: string[];
  logo_url: string;
  view_count: number;
  categories: string[];
  locales?: Record<string, { name?: string; description?: string }>;
}

export interface ModelscopeServerDetail {
  id: string;
  name: string;
  chinese_name: string;
  description: string;
  source_url?: string;
  readme?: string;
  server_config: Array<{ mcpServers: Record<string, McpServerConfigInput> }>;
  env_schema?: { properties?: Record<string, unknown>; required?: string[]; type?: string };
  logo_url?: string;
  categories?: string[];
  is_hosted?: boolean;
  view_count?: number;
}

export interface ModelMappingLogEntry {
  time: string;
  model: string;
  target_model: string;
  status: number;
  thinking: string;
}

export interface SkillRecord {
  name: string;
  dir: string;
  description: string;
  version?: string | null;
  updatedAt?: number | null;
  sourceType?: SkillSourceType | null;
  sourceValue?: string | null;
  categories: string[];
  internal: boolean;
  path: string;
  hasSkillFile: boolean;
}

export type LlmRequestKind =
  | "openai-chat"
  | "openai-responses"
  | "claude"
  | "gemini";

export interface SystemLlmProfile {
  toolId: string;
  label: string;
  sourcePath: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  requestKind: LlmRequestKind;
  protocols: string[];
  updatedAt?: number | null;
}

export interface SystemLlmSnapshot {
  current: SystemLlmProfile | null;
  profiles: SystemLlmProfile[];
}

export type SkillEnrichmentStatus =
  | "idle"
  | "pending"
  | "running"
  | "success"
  | "error"
  | "stale";

export interface SkillEnrichmentRecord {
  skillDir: string;
  skillPath: string;
  sourceUpdatedAt?: number | null;
  sourceDescription: string;
  localizedDescription: string;
  fullDescription: string;
  contentSummary: string;
  usage: string;
  scenarios: string;
  tags: string[];
  status: SkillEnrichmentStatus;
  providerLabel?: string | null;
  model: string;
  requestKind: LlmRequestKind;
  rawResponse?: string | null;
  errorMessage?: string | null;
  enrichedAt?: number | null;
}

export interface EnrichSkillRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  requestKind: LlmRequestKind;
  skillDir: string;
  skillPath: string;
  description: string;
  categories: string[];
  updatedAt?: number | null;
  providerLabel?: string | null;
}

export type SkillAnnotationMode = "full" | "incremental";

export interface SkillEnrichmentJobItem {
  skillDir: string;
  skillPath: string;
  description: string;
  categories: string[];
  updatedAt?: number | null;
}

export type SkillEnrichmentJobStatus =
  | "idle"
  | "waiting"
  | "running"
  | "stopped"
  | "done"
  | "error";

export interface SkillEnrichmentJobRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  requestKind: LlmRequestKind;
  providerLabel?: string | null;
  mode: SkillAnnotationMode;
  delayMs?: number | null;
  skills: SkillEnrichmentJobItem[];
}

export interface SkillEnrichmentJobSnapshot {
  runId: number;
  mode: SkillAnnotationMode;
  status: SkillEnrichmentJobStatus;
  total: number;
  completed: number;
  currentSkillDir?: string | null;
  currentSkillName?: string | null;
  nextRunAt?: number | null;
  message: string;
  errorMessage?: string | null;
  providerLabel?: string | null;
  model: string;
  requestKind: LlmRequestKind;
  startedAt: number;
  updatedAt: number;
  records: Record<string, SkillEnrichmentRecord>;
}

export interface InstalledSkillSnapshot {
  skillDir: string;
  skillName: string;
  skillPath: string;
  sourceDescription: string;
  displayDescription: string;
  fullDescription: string;
  contentSummary: string;
  usage: string;
  scenarios: string;
  tags: string[];
  searchText: string;
  updatedAt?: number | null;
  enrichedAt?: number | null;
  status: SkillEnrichmentStatus;
}

export type SkillSourceType = "github" | "npx" | "local" | "manual" | "unknown";

export interface SkillsCatalogSnapshot {
  sourceDir: string;
  scannedAt?: number | null;
  totalSkills: number;
  skills: SkillRecord[];
}

export interface SkillTargetConfig {
  id: string;
  label: string;
  path: string;
  isBuiltin: boolean;
  enabled: boolean;
  syncSkillNames: string[] | null;
}

export interface SkillTargetStatus {
  id: string;
  label: string;
  path: string;
  exists: boolean;
  managedCount: number;
  brokenCount: number;
  totalEntries: number;
}

export interface SyncSkillTargetResult {
  id: string;
  label: string;
  path: string;
  createdDir: boolean;
  keptCount: number;
  linkedCount: number;
  replacedCount: number;
  backedUpCount: number;
  errors: string[];
}

export type SkillsCommandAction = "add" | "update" | "remove";

export interface SkillsCommandRequest {
  action: SkillsCommandAction;
  source?: string;
  skillNames?: string[];
}

export interface SkillsCommandResult {
  action: SkillsCommandAction;
  command: string[];
  cwd: string;
  success: boolean;
  code: number;
  stdout: string;
  stderr: string;
  catalogRefreshed: boolean;
}

export interface SkillsCommandProgressEvent {
  action: SkillsCommandAction;
  stage: string;
  message: string;
  current?: number | null;
  total?: number | null;
  skillName?: string | null;
}

export interface SkillSourceMeta {
  sourceType: SkillSourceType;
  sourceValue?: string | null;
  trackedAt: number;
}

export interface OnlineSkill {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

export interface OnlineSkillDetail {
  id: string;
  skillId: string;
  source: string;
  pageUrl: string;
  installCommand: string;
  summary: string;
  usageHints: string[];
  skillDoc: string;
}

export interface LocalizedOnlineSkillDetail {
  skillDir: string;
  skillName: string;
  skillId: string;
  source: string;
  pageUrl: string;
  installCommand: string;
  sourceSummary: string;
  sourceUsageHints: string[];
  localizedSummary: string;
  localizedUsageHints: string[];
  providerLabel?: string | null;
  model: string;
  requestKind: LlmRequestKind;
  translatedAt?: number | null;
  errorMessage?: string | null;
}

export interface OnlineSearchResponse {
  query: string;
  searchType: string;
  skills: OnlineSkill[];
  count: number;
  durationMs: number;
}

export interface PopularSkillRepo {
  owner: string;
  repo: string;
  label: string;
  accentClass: string;
  websiteUrl?: string;
}

export interface PromptRecord {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PromptCategorySummary {
  key: string;
  label: string;
  count: number;
  updatedAt: number | null;
}

export interface PromptImportParseResult {
  valid: PromptRecord[];
  skipped: number;
}

export interface PromptImportSummary {
  added: number;
  overwritten: number;
  skipped: number;
}
