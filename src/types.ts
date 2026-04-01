export type AppPage =
  | "detect"
  | "models"
  | "provider-detail"
  | "rules"
  | "configs"
  | "settings";

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
  format?: "json" | "toml" | "yaml";
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
