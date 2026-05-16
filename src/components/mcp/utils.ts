import { homeDir } from "@tauri-apps/api/path";
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { dirname } from "@tauri-apps/api/path";
import type {
  McpConfig,
  McpServerConfig,
  McpSyncTarget,
  SyncMode,
} from "./types";
import type {
  ModelscopeDetailResponse,
  ModelscopeRequestProfileInput,
  ModelscopeSearchResponse,
  ModelscopeServerDetail,
  ModelscopeServerItem,
} from "@/types";
import { logger } from "@/lib/devlog";

export const MCP_SYNC_TARGETS_KEY = "ai-modal-mcp-sync-targets";
export const MCP_SYNC_TARGETS_DB_KEY = "mcp_sync_targets";
export const MCP_BATCH_TEST_CONCURRENCY = 4;
export const MCP_BACKUP_KEEP_COUNT = 3;
export const MODELSCOPE_API_KEY = "ai-modal-modelscope-api-key";
export const MODELSCOPE_API_DB_KEY = "modelscope_api_key";
export const MCP_ONLINE_IMPORT_ENABLED = false;

export function normalizeHomePath(path: string) {
  return path.replace(/\/$/, "");
}

export function buildSourcePath(homePath: string) {
  return `${homePath}/.agents/mcp.config.json`;
}

function getModelscopeBaseName(server: Pick<ModelscopeServerItem, "id" | "name">) {
  const rawName = server.name.trim();
  if (rawName && !/^mcp$/i.test(rawName)) return rawName;
  const pathLeaf = server.id
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean)
    .at(-1);
  return pathLeaf || rawName || "modelscope-mcp";
}

export function getModelscopeSearchItems(response: ModelscopeSearchResponse | null) {
  return response?.data?.mcp_server_list ?? [];
}

export function getModelscopeSearchTotal(response: ModelscopeSearchResponse | null) {
  return response?.data?.total_count ?? 0;
}

export function getModelscopeDetailData(response: ModelscopeDetailResponse | null) {
  return response?.data ?? null;
}

export function buildImportedServerEntries(detail: ModelscopeServerDetail): Array<[string, McpServerConfig]> {
  const entries = Object.entries(extractTransportConfigs(detail));
  const baseName = getModelscopeBaseName(detail);
  if (entries.length <= 1) {
    return entries.map(([, config]) => [baseName, config as McpServerConfig]);
  }
  return entries.map(([transport, config]) => [
    `${baseName}-${transport}`,
    config as McpServerConfig,
  ]);
}

export function hasImportedServerPrefix(baseName: string, servers: Record<string, McpServerConfig>) {
  const trimmedBase = baseName.trim() || "modelscope-mcp";
  return Object.keys(servers).some(
    (name) => name === trimmedBase || name.startsWith(`${trimmedBase}-`),
  );
}

export function toModelscopeDetailFallback(server: ModelscopeServerItem): ModelscopeServerDetail {
  return {
    ...server,
    readme: null,
    source_url: null,
    operational_urls: [],
    server_config: [],
  };
}

export function getModelscopeDisplayName(server: Pick<ModelscopeServerItem, "chinese_name" | "name" | "id">) {
  const chinese = server.chinese_name?.trim();
  if (chinese) return chinese;

  const rawName = server.name.trim();
  if (rawName && !/^mcp$/i.test(rawName)) return rawName;

  const pathLeaf = server.id
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean)
    .at(-1);
  return pathLeaf || rawName || "mcp";
}

export function buildBuiltinTargets(homePath: string): McpSyncTarget[] {
  return [
    {
      id: "claude",
      label: "Claude",
      path: `${homePath}/.claude.json`,
      mode: "json-mcpServers",
      isBuiltin: true,
      enabled: true,
      accentClass: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
      syncServerNames: null,
    },
    {
      id: "codex",
      label: "Codex",
      path: `${homePath}/.codex/config.toml`,
      mode: "codex-toml",
      isBuiltin: true,
      enabled: true,
      accentClass: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
      syncServerNames: null,
    },
    {
      id: "gemini",
      label: "Gemini",
      path: `${homePath}/.gemini/settings.json`,
      mode: "json-mcpServers",
      isBuiltin: true,
      enabled: true,
      accentClass: "border-amber-500/30 bg-amber-500/10 text-amber-100",
      syncServerNames: null,
    },
    {
      id: "qwen",
      label: "Qwen",
      path: `${homePath}/.qwen/settings.json`,
      mode: "json-mcpServers",
      isBuiltin: true,
      enabled: true,
      accentClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      syncServerNames: null,
    },
    {
      id: "opencode",
      label: "OpenCode",
      path: `${homePath}/.config/opencode/opencode.json`,
      mode: "opencode-json",
      isBuiltin: true,
      enabled: true,
      accentClass: "border-sky-500/30 bg-sky-500/10 text-sky-100",
      syncServerNames: null,
    },
  ];
}

export function toAbsolutePath(path: string, homePath: string) {
  const trimmed = path.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("~/")) return `${homePath}/${trimmed.slice(2)}`;
  return trimmed;
}

export function createEmptyConfig(): McpConfig {
  return { mcpServers: {} };
}

export function buildModelscopeProfile(apiKey: string): ModelscopeRequestProfileInput | null {
  const trimmed = apiKey.trim();
  if (!trimmed) return null;
  return {
    extra_headers: {
      Authorization: `Bearer ${trimmed}`,
    },
  };
}

export function maskAuthorizationHeader(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  const prefix = "Bearer ";
  if (!trimmed.startsWith(prefix)) return "***";
  const token = trimmed.slice(prefix.length);
  if (token.length <= 10) return `${prefix}***`;
  return `${prefix}${token.slice(0, 6)}...${token.slice(-4)}`;
}

export function getModelscopeDetailMarkdown(detail: ModelscopeServerDetail | null) {
  if (!detail) return "暂无介绍内容。";
  const readme = detail.readme?.trim();
  if (readme) return readme;
  const description = detail.description?.trim();
  if (description) return description;
  return "暂无介绍内容。";
}

export function extractTransportConfigs(detail: ModelscopeServerDetail): Record<string, McpServerConfigInput> {
  const configs: Record<string, McpServerConfigInput> = {};
  for (const item of detail.server_config ?? []) {
    for (const [name, config] of Object.entries(item.mcpServers ?? {})) {
      configs[name] = config;
    }
  }
  for (const item of detail.operational_urls ?? []) {
    if (!item.url) continue;
    const transport = item.transport_type || "sse";
    configs[transport] = {
      type: transport,
      url: item.url,
    };
  }
  return configs;
}

export function parseMcpConfig(value: unknown): McpConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptyConfig();
  }
  const root = value as Record<string, unknown>;
  const serversRoot = root.mcpServers;
  const mcpServers: Record<string, McpServerConfig> = {};
  if (serversRoot && typeof serversRoot === "object" && !Array.isArray(serversRoot)) {
    for (const [name, config] of Object.entries(serversRoot)) {
      if (!name.trim()) continue;
      if (!config || typeof config !== "object" || Array.isArray(config)) continue;
      mcpServers[name] = config as McpServerConfig;
    }
  }
  return { mcpServers };
}

export function stringifyConfig(config: McpConfig) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function removeJsonTrailingCommas(text: string) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      result += char;
      continue;
    }

    if (char === ",") {
      let nextIndex = index + 1;
      while (nextIndex < text.length && /\s/.test(text[nextIndex])) {
        nextIndex += 1;
      }
      if (text[nextIndex] === "}" || text[nextIndex] === "]") {
        continue;
      }
    }

    result += char;
  }
  return result;
}

export function parseJsonObject(content: string, options?: { relaxed?: boolean }) {
  const parsed = JSON.parse(options?.relaxed ? removeJsonTrailingCommas(content) : content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("配置根节点必须是 JSON 对象");
  }
  return parsed as Record<string, unknown>;
}

export function defaultServerDraft(): McpServerConfig {
  return {
    type: "stdio",
    command: "npx",
    args: ["-y", "your-mcp-package"],
    env: {},
  };
}

async function ensureParent(path: string) {
  const folder = await dirname(path);
  await mkdir(folder, { recursive: true });
}

function backupPathFor(path: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${path}.bak-ai-modal-mcp-${stamp}`;
}

function fileNameOf(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

async function cleanupOldBackups(path: string) {
  const folder = await dirname(path);
  const fileName = fileNameOf(path);
  const prefix = `${fileName}.bak-ai-modal-mcp-`;
  const entries = await readDir(folder);
  const backups = entries
    .filter((entry) => entry.isFile && entry.name.startsWith(prefix))
    .map((entry) => `${folder}/${entry.name}`)
    .sort()
    .reverse();

  for (const oldBackup of backups.slice(MCP_BACKUP_KEEP_COUNT)) {
    await remove(oldBackup);
  }
}

export async function backupIfExists(path: string) {
  if (!(await exists(path))) return null;
  const content = await readTextFile(path);
  const backupPath = backupPathFor(path);
  await ensureParent(backupPath);
  await writeTextFile(backupPath, content);
  try {
    await cleanupOldBackups(path);
  } catch (error) {
    logger.warn(`[MCP] 清理旧备份失败：${error instanceof Error ? error.message : String(error)}`);
  }
  return backupPath;
}

export async function ensureParentDir(path: string) {
  await ensureParent(path);
}

export function normalizeSyncTargets(
  homePath: string,
  raw: unknown,
): McpSyncTarget[] {
  const builtins = buildBuiltinTargets(homePath);
  const stored =
    Array.isArray(raw)
      ? raw.filter(
          (item): item is Partial<McpSyncTarget> & Pick<McpSyncTarget, "id"> =>
            typeof item === "object" &&
            item != null &&
            typeof (item as { id?: unknown }).id === "string",
        )
      : [];

  const mergedBuiltins = builtins.map((builtin) => {
    const match = stored.find((item) => item.id === builtin.id);
    return {
      ...builtin,
      path: typeof match?.path === "string" ? match.path : builtin.path,
      enabled: typeof match?.enabled === "boolean" ? match.enabled : builtin.enabled,
    };
  });

  const custom = stored
    .filter((item) => item.id.startsWith("custom-"))
    .filter(
      (item): item is McpSyncTarget =>
        typeof item.label === "string" &&
        typeof item.path === "string" &&
        typeof item.mode === "string" &&
        (item.mode === "json-replace" ||
          item.mode === "json-merge" ||
          item.mode === "json-mcpServers" ||
          item.mode === "codex-toml" ||
          item.mode === "opencode-json"),
    )
    .map((item) => ({
      ...item,
      isBuiltin: false,
      enabled: item.enabled !== false,
      accentClass: "border-gray-700 bg-gray-950 text-gray-300",
      syncServerNames: null,
    }));

  return [...mergedBuiltins, ...custom];
}

export function countServerInfo(server: McpServerConfig) {
  return {
    args: Array.isArray(server.args) ? server.args.length : 0,
    env:
      server.env && typeof server.env === "object" && !Array.isArray(server.env)
        ? Object.keys(server.env).length
        : 0,
  };
}

export function getServerValidationLabel(
  server: McpServerConfig,
  testState?: McpServiceTestState,
) {
  if (!testState?.checkedAt) return null;
  const serverType = (server.type ?? "stdio").toLowerCase();
  if (serverType === "http") {
    return testState.ok ? "http · 握手成功" : "http · 握手失败";
  }
  return testState.ok ? "stdio · 握手成功" : "stdio · 握手失败";
}

function nonEmptyRecord(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value).filter(([, item]) => typeof item === "string");
  if (entries.length === 0) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

function buildOpenCodeMcp(servers: Record<string, McpServerConfig>) {
  const next: Record<string, Record<string, unknown>> = {};
  for (const [name, server] of Object.entries(servers)) {
    if (server.type === "http") {
      next[name] = {
        type: "remote",
        url: String(server.url ?? ""),
        enabled: true,
      };
      continue;
    }

    const command = String(server.command ?? "");
    const args = Array.isArray(server.args) ? server.args.map((item) => String(item)) : [];
    const entry: Record<string, unknown> = {
      type: "local",
      command: [command, ...args].filter(Boolean),
      enabled: true,
    };
    const env = nonEmptyRecord(server.env);
    if (env) {
      entry.environment = env;
    }
    next[name] = entry;
  }
  return next;
}

export async function writeSyncTarget(
  target: McpSyncTarget,
  source: McpConfig,
): Promise<string | null> {
  const filteredServers = target.syncServerNames
    ? Object.fromEntries(
        Object.entries(source.mcpServers).filter(([name]) =>
          target.syncServerNames!.includes(name),
        ),
      )
    : source.mcpServers;
  const filteredConfig: McpConfig = { mcpServers: filteredServers };

  const backupPath = await backupIfExists(target.path);

  if (target.mode === "codex-toml") {
    const tomlModule = await import("smol-toml");
    let root: Record<string, unknown> = {};
    if (await exists(target.path)) {
      const content = await readTextFile(target.path);
      try {
        const parsed = tomlModule.parse(content);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          root = parsed as Record<string, unknown>;
        }
      } catch (error) {
        throw new Error(`Codex TOML 解析失败，已停止写入：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const currentServers =
      root.mcp_servers && typeof root.mcp_servers === "object" && !Array.isArray(root.mcp_servers)
        ? (root.mcp_servers as Record<string, Record<string, unknown>>)
        : {};
    const nextServers: Record<string, Record<string, unknown>> = {};
    for (const [name, server] of Object.entries(filteredConfig.mcpServers)) {
      const existing =
        currentServers[name] && typeof currentServers[name] === "object" && !Array.isArray(currentServers[name])
          ? currentServers[name]
          : {};
      const next: Record<string, unknown> = { ...existing };
      for (const key of ["command", "args", "env", "cwd", "url", "type"] as const) {
        delete next[key];
      }
      for (const [key, value] of Object.entries(server)) {
        if (value !== undefined) {
          next[key] = value;
        }
      }
      nextServers[name] = next;
    }
    root.mcp_servers = nextServers;
    await ensureParent(target.path);
    await writeTextFile(target.path, `${tomlModule.stringify(root)}\n`);
    return backupPath;
  }

  if (target.mode === "json-merge" || target.mode === "json-mcpServers") {
    let root: Record<string, unknown> = {};
    if (await exists(target.path)) {
      const content = await readTextFile(target.path);
      try {
        root = parseJsonObject(content);
      } catch (error) {
        throw new Error(`JSON 配置解析失败，已停止写入：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    root.mcpServers = filteredConfig.mcpServers;
    await ensureParent(target.path);
    await writeTextFile(target.path, `${JSON.stringify(root, null, 2)}\n`);
    return backupPath;
  }

  if (target.mode === "opencode-json") {
    let root: Record<string, unknown> = {};
    if (await exists(target.path)) {
      const content = await readTextFile(target.path);
      try {
        root = parseJsonObject(content, { relaxed: true });
      } catch (error) {
        throw new Error(`OpenCode 配置解析失败，已停止写入：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    root.mcp = buildOpenCodeMcp(filteredConfig.mcpServers);
    await ensureParent(target.path);
    await writeTextFile(target.path, `${JSON.stringify(root, null, 2)}\n`);
    return backupPath;
  }

  await ensureParent(target.path);
  await writeTextFile(target.path, stringifyConfig(filteredConfig));
  return backupPath;
}
