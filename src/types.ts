export type AppPage =
  | "detect"
  | "models"
  | "skills"
  | "prompts"
  | "prompt-detail"
  | "provider-detail"
  | "rules"
  | "configs"
  | "settings";

export type ConfigFormat = "json" | "toml" | "yaml" | "xml";

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
