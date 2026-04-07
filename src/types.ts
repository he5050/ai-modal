export type AppPage =
  | "detect"
  | "models"
  | "skills"
  | "provider-detail"
  | "rules"
  | "configs"
  | "settings";

export type ConfigFormat = "json" | "toml" | "yaml" | "xml";

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

export interface ModelResult {
  model: string;
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
