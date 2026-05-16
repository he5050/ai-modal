import type {
  McpServerConfigInput,
  ModelscopeDetailResponse,
  ModelscopeRequestProfileInput,
  ModelscopeSearchResponse,
  ModelscopeServerItem,
  ModelscopeServerDetail,
} from "@/types";

export type McpServerConfig = {
  type?: "stdio" | "http" | string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  [key: string]: unknown;
};

export type McpConfig = {
  mcpServers: Record<string, McpServerConfig>;
};

export type SyncMode =
  | "json-replace"
  | "json-merge"
  | "json-mcpServers"
  | "codex-toml"
  | "opencode-json";

export type McpSyncTarget = {
  id: string;
  label: string;
  path: string;
  mode: SyncMode;
  isBuiltin: boolean;
  enabled: boolean;
  accentClass: string;
  syncServerNames: string[] | null;
};

export type McpSyncStatus = {
  exists: boolean;
  syncedAt?: number;
  error?: string;
  backupPath?: string;
};

export type McpServiceTestState = {
  running: boolean;
  ok?: boolean;
  status?: string;
  message?: string;
  detail?: string | null;
  latency_ms?: number | null;
  checkedAt?: number;
};

export type OnlineImportState = {
  detailId: string;
  serverNames: string[];
};
