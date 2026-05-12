import { useEffect, useMemo, useState } from "react";
import { dirname, homeDir } from "@tauri-apps/api/path";
import { open as pickPath } from "@tauri-apps/plugin-dialog";
import { exists, mkdir, readDir, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  CheckCircle2,
  FilePenLine,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { testMcpServer } from "../../api";
import {
  ACTION_GROUP_BUTTON_ACTIVE_CLASS,
  ACTION_GROUP_BUTTON_BASE_CLASS,
  ACTION_GROUP_BUTTON_INACTIVE_CLASS,
  ACTION_GROUP_WRAPPER_CLASS,
} from "../../lib/actionGroupStyles";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_DANGER_OUTLINE_CLASS,
  BUTTON_ICON_DANGER_SM_CLASS,
  BUTTON_ICON_GHOST_SM_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../../lib/buttonStyles";
import { FIELD_INPUT_CLASS, FIELD_MONO_INPUT_CLASS, FIELD_SELECT_CLASS } from "../../lib/formStyles";
import { loadPersistedJson, savePersistedJson } from "../../lib/persistence";
import { toast } from "../../lib/toast";
import { logger } from "../../lib/devlog";
import { HintTooltip } from "../HintTooltip";
import { ModelscopeOnlineInstallPanel } from "./ModelscopeOnlineInstallPanel";
import type { McpServerConfigInput } from "../../types";

type McpServerConfig = {
  type?: "stdio" | "http" | string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  [key: string]: unknown;
};

type McpConfig = {
  mcpServers: Record<string, McpServerConfig>;
};

type SyncMode =
  | "json-replace"
  | "json-merge"
  | "json-mcpServers"
  | "codex-toml"
  | "opencode-json";

type McpSyncTarget = {
  id: string;
  label: string;
  path: string;
  mode: SyncMode;
  isBuiltin: boolean;
  enabled: boolean;
  accentClass: string;
};

type McpSyncStatus = {
  exists: boolean;
  syncedAt?: number;
  error?: string;
  backupPath?: string;
};

type McpServiceTestState = {
  running: boolean;
  ok?: boolean;
  status?: string;
  message?: string;
  detail?: string | null;
  latency_ms?: number | null;
  checkedAt?: number;
};

const MCP_SYNC_TARGETS_KEY = "ai-modal-mcp-sync-targets";
const MCP_SYNC_TARGETS_DB_KEY = "mcp_sync_targets";
const MCP_BATCH_TEST_CONCURRENCY = 4;
const MCP_BACKUP_KEEP_COUNT = 3;

function normalizeHomePath(path: string) {
  return path.replace(/\/$/, "");
}

function buildSourcePath(homePath: string) {
  return `${homePath}/.agents/mcp.config.json`;
}

function buildBuiltinTargets(homePath: string): McpSyncTarget[] {
  return [
    {
      id: "claude",
      label: "Claude",
      path: `${homePath}/.claude.json`,
      mode: "json-mcpServers",
      isBuiltin: true,
      enabled: true,
      accentClass: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
    },
    {
      id: "codex",
      label: "Codex",
      path: `${homePath}/.codex/config.toml`,
      mode: "codex-toml",
      isBuiltin: true,
      enabled: true,
      accentClass: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
    },
    {
      id: "gemini",
      label: "Gemini",
      path: `${homePath}/.gemini/settings.json`,
      mode: "json-mcpServers",
      isBuiltin: true,
      enabled: true,
      accentClass: "border-amber-500/30 bg-amber-500/10 text-amber-100",
    },
    {
      id: "qwen",
      label: "Qwen",
      path: `${homePath}/.qwen/settings.json`,
      mode: "json-mcpServers",
      isBuiltin: true,
      enabled: true,
      accentClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    },
    {
      id: "opencode",
      label: "OpenCode",
      path: `${homePath}/.config/opencode/opencode.json`,
      mode: "opencode-json",
      isBuiltin: true,
      enabled: true,
      accentClass: "border-sky-500/30 bg-sky-500/10 text-sky-100",
    },
  ];
}

function toAbsolutePath(path: string, homePath: string) {
  const trimmed = path.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("~/")) return `${homePath}/${trimmed.slice(2)}`;
  return trimmed;
}

function createEmptyConfig(): McpConfig {
  return { mcpServers: {} };
}

function parseMcpConfig(value: unknown): McpConfig {
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

function stringifyConfig(config: McpConfig) {
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

function parseJsonObject(content: string, options?: { relaxed?: boolean }) {
  const parsed = JSON.parse(options?.relaxed ? removeJsonTrailingCommas(content) : content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("配置根节点必须是 JSON 对象");
  }
  return parsed as Record<string, unknown>;
}

function defaultServerDraft(): McpServerConfig {
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

async function backupIfExists(path: string) {
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

function normalizeSyncTargets(
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
    }));

  return [...mergedBuiltins, ...custom];
}

function countServerInfo(server: McpServerConfig) {
  return {
    args: Array.isArray(server.args) ? server.args.length : 0,
    env:
      server.env && typeof server.env === "object" && !Array.isArray(server.env)
        ? Object.keys(server.env).length
        : 0,
  };
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

async function writeSyncTarget(
  target: McpSyncTarget,
  source: McpConfig,
): Promise<string | null> {
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
    for (const [name, server] of Object.entries(source.mcpServers)) {
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
    root.mcpServers = source.mcpServers;
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
    root.mcp = buildOpenCodeMcp(source.mcpServers);
    await ensureParent(target.path);
    await writeTextFile(target.path, `${JSON.stringify(root, null, 2)}\n`);
    return backupPath;
  }

  await ensureParent(target.path);
  await writeTextFile(target.path, stringifyConfig(source));
  return backupPath;
}

export function McpPage({
  onDirtyChange,
}: {
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [homePath, setHomePath] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [config, setConfig] = useState<McpConfig>(createEmptyConfig());
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<"list" | "sync" | "online">("list");
  const [targets, setTargets] = useState<McpSyncTarget[]>([]);
  const [statuses, setStatuses] = useState<Record<string, McpSyncStatus>>({});
  const [serverTests, setServerTests] = useState<Record<string, McpServiceTestState>>({});
  const [checkingTargets, setCheckingTargets] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [pathDraft, setPathDraft] = useState("");
  const [showCustomTargetForm, setShowCustomTargetForm] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customPath, setCustomPath] = useState("");
  const [customMode, setCustomMode] = useState<SyncMode>("json-replace");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingServerName, setEditingServerName] = useState<string | null>(null);
  const [draftServerName, setDraftServerName] = useState("");
  const [draftServerJson, setDraftServerJson] = useState(
    JSON.stringify(defaultServerDraft(), null, 2),
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const serverEntries = useMemo(
    () =>
      Object.entries(config.mcpServers).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    [config.mcpServers],
  );

  const selectedTarget = useMemo(
    () => targets.find((item) => item.id === selectedTargetId) ?? null,
    [selectedTargetId, targets],
  );

  const testingCount = useMemo(
    () => Object.values(serverTests).filter((item) => item.running).length,
    [serverTests],
  );

  useEffect(() => {
    if (!selectedTarget) return;
    setPathDraft(selectedTarget.path);
  }, [selectedTarget?.id, selectedTarget?.path]);

  useEffect(() => {
    if (targets.length === 0) return;
    if (!targets.some((item) => item.id === selectedTargetId)) {
      setSelectedTargetId(targets[0].id);
    }
  }, [selectedTargetId, targets]);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const home = normalizeHomePath(await homeDir());
        const nextSourcePath = buildSourcePath(home);
        const sourceExists = await exists(nextSourcePath);
        const nextConfig = sourceExists
          ? parseMcpConfig(JSON.parse(await readTextFile(nextSourcePath)))
          : createEmptyConfig();
        const rawTargets = await loadPersistedJson<unknown[]>(
          MCP_SYNC_TARGETS_DB_KEY,
          MCP_SYNC_TARGETS_KEY,
          [],
        );
        const nextTargets = normalizeSyncTargets(home, rawTargets);
        if (!active) return;

        setHomePath(home);
        setSourcePath(nextSourcePath);
        setConfig(nextConfig);
        setTargets(nextTargets);
        setSelectedTargetId(nextTargets[0]?.id ?? "");
        setDirty(false);
        logger.info(
          `[MCP] 配置加载完成：source=${nextSourcePath} servers=${Object.keys(nextConfig.mcpServers).length}`,
        );
      } catch (error) {
        logger.error(`[MCP] 初始化失败：${error instanceof Error ? error.message : String(error)}`);
        toast("读取 MCP 配置失败", "error");
      } finally {
        if (active) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!homePath || targets.length === 0) return;
    void savePersistedJson(MCP_SYNC_TARGETS_DB_KEY, targets, MCP_SYNC_TARGETS_KEY);
  }, [homePath, targets]);

  async function refreshTargetStatuses() {
    setCheckingTargets(true);
    try {
      const next: Record<string, McpSyncStatus> = {};
      await Promise.all(
        targets.map(async (target) => {
          next[target.id] = { ...(statuses[target.id] ?? {}), exists: await exists(target.path) };
        }),
      );
      setStatuses(next);
    } catch (error) {
      toast("检查同步目标失败", "error");
      logger.error(`[MCP] 检查同步目标失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCheckingTargets(false);
    }
  }

  useEffect(() => {
    if (targets.length === 0) return;
    void refreshTargetStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets]);

  async function reloadSource() {
    setBusy("reload");
    try {
      const sourceExists = await exists(sourcePath);
      const nextConfig = sourceExists
        ? parseMcpConfig(JSON.parse(await readTextFile(sourcePath)))
        : createEmptyConfig();
      setConfig(nextConfig);
      setDirty(false);
      toast("已刷新 MCP 配置", "success");
      logger.info(`[MCP] 已刷新 source，servers=${Object.keys(nextConfig.mcpServers).length}`);
    } catch (error) {
      toast("刷新 MCP 配置失败", "error");
      logger.error(`[MCP] 刷新 source 失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function persistSourceConfig(
    nextConfig: McpConfig,
    options?: { backup?: boolean },
  ) {
    if (options?.backup) {
      await backupIfExists(sourcePath);
    }
    await ensureParent(sourcePath);
    await writeTextFile(sourcePath, stringifyConfig(nextConfig));
  }

  async function saveSource() {
    setBusy("save");
    logger.info("[MCP] 开始保存 source 配置");
    try {
      await persistSourceConfig(config, { backup: true });
      setDirty(false);
      toast("MCP 配置已保存", "success");
      logger.success("[MCP] source 配置保存成功");
    } catch (error) {
      toast("保存 MCP 配置失败", "error");
      logger.error(`[MCP] source 配置保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function importModelscopeServer(payload: {
    name: string;
    config: McpServerConfigInput;
    sourceUrl?: string | null;
  }) {
    const previousConfig = config;
    const previousDirty = dirty;
    const nextConfig = {
      mcpServers: {
        ...config.mcpServers,
        [payload.name]: payload.config as McpServerConfig,
      },
    } as McpConfig;
    const isOverwrite = Object.prototype.hasOwnProperty.call(
      config.mcpServers,
      payload.name,
    );
    setConfig(nextConfig);
    setDirty(false);
    setBusy("save");
    try {
      await persistSourceConfig(nextConfig, { backup: true });
      toast(
        isOverwrite
          ? `已覆盖导入 MCP：${payload.name}`
          : `已导入 MCP：${payload.name}`,
        "success",
      );
      logger.success(
        `[MCP] 已导入 ModelScope MCP：${payload.name}${payload.sourceUrl ? ` <- ${payload.sourceUrl}` : ""}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast(`导入 MCP 失败：${message}`, "error");
      logger.error(`[MCP] 导入 ModelScope MCP 失败：${message}`);
      setConfig(previousConfig);
      setDirty(previousDirty);
    } finally {
      setBusy(null);
    }
  }

  async function syncEnabledTargets() {
    const enabledTargets = targets.filter((item) => item.enabled);
    if (enabledTargets.length === 0) {
      toast("请先启用至少一个同步目标", "warning");
      return;
    }

    setBusy("sync");
    logger.info(`[MCP] 开始同步，targets=${enabledTargets.length}`);
    let successCount = 0;
    let failCount = 0;
    const nextStatuses: Record<string, McpSyncStatus> = { ...statuses };
    try {
      for (const target of enabledTargets) {
        try {
          const backupPath = await writeSyncTarget(target, config);
          successCount += 1;
          nextStatuses[target.id] = {
            exists: true,
            syncedAt: Date.now(),
            backupPath: backupPath ?? undefined,
          };
          logger.success(
            `[MCP] 同步成功：${target.label} -> ${target.path}${backupPath ? `，备份=${backupPath}` : ""}`,
          );
        } catch (error) {
          failCount += 1;
          const message = error instanceof Error ? error.message : String(error);
          nextStatuses[target.id] = {
            exists: await exists(target.path),
            syncedAt: Date.now(),
            error: message,
          };
          logger.error(`[MCP] 同步失败：${target.label} -> ${message}`);
        }
      }
      setStatuses(nextStatuses);
      toast(
        `MCP 同步完成：成功 ${successCount}，失败 ${failCount}`,
        failCount === 0 ? "success" : "warning",
      );
    } finally {
      setBusy(null);
    }
  }

  function openServerEditor(name: string | null) {
    if (name) {
      const current = config.mcpServers[name];
      setEditingServerName(name);
      setDraftServerName(name);
      setDraftServerJson(JSON.stringify(current ?? defaultServerDraft(), null, 2));
    } else {
      setEditingServerName(null);
      setDraftServerName("");
      setDraftServerJson(JSON.stringify(defaultServerDraft(), null, 2));
    }
    setEditorOpen(true);
  }

  function removeServer(name: string) {
    const next = { ...config.mcpServers };
    delete next[name];
    setConfig({ mcpServers: next });
    setDirty(true);
    toast(`已删除 MCP 服务：${name}`, "info");
  }

  function saveServerDraft() {
    const nextName = draftServerName.trim();
    if (!nextName) {
      toast("服务名不能为空", "warning");
      return;
    }
    let parsed: McpServerConfig;
    try {
      const value = JSON.parse(draftServerJson);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        toast("服务配置必须是 JSON 对象", "warning");
        return;
      }
      parsed = value as McpServerConfig;
    } catch (error) {
      toast(`服务配置 JSON 无效：${error instanceof Error ? error.message : String(error)}`, "error");
      return;
    }

    const next = { ...config.mcpServers };
    if (editingServerName && editingServerName !== nextName) {
      delete next[editingServerName];
    }
    if (!editingServerName && next[nextName]) {
      toast("服务名已存在，请修改后重试", "warning");
      return;
    }
    next[nextName] = parsed;
    setConfig({ mcpServers: next });
    setDirty(true);
    setEditorOpen(false);
    toast(`已保存 MCP 服务：${nextName}`, "success");
  }

  async function runServerTest(
    name: string,
    server: McpServerConfig,
    options?: { silent?: boolean },
  ) {
    setServerTests((prev) => ({
      ...prev,
      [name]: {
        ...(prev[name] ?? {}),
        running: true,
      },
    }));
    logger.info(`[MCP] 开始测试服务：${name}`);
    try {
      const result = await testMcpServer(name, server);
      setServerTests((prev) => ({
        ...prev,
        [name]: {
          running: false,
          ok: result.ok,
          status: result.status,
          message: result.message,
          detail: result.detail ?? null,
          latency_ms: result.latency_ms ?? null,
          checkedAt: Date.now(),
        },
      }));
      if (result.ok && !options?.silent) {
        toast(`${name} 测试通过`, "success");
        logger.success(`[MCP] 服务测试通过：${name} ${result.status} ${result.message}`);
      } else if (!result.ok && !options?.silent) {
        toast(`${name} 测试失败：${result.message}`, "warning");
        logger.warn(`[MCP] 服务测试失败：${name} ${result.status} ${result.message}`);
      }
      return result.ok;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setServerTests((prev) => ({
        ...prev,
        [name]: {
          running: false,
          ok: false,
          status: "error",
          message,
          detail: null,
          latency_ms: null,
          checkedAt: Date.now(),
        },
      }));
      if (!options?.silent) {
        toast(`${name} 测试失败`, "error");
      }
      logger.error(`[MCP] 服务测试异常：${name} -> ${message}`);
      return false;
    }
  }

  async function runBatchTests() {
    if (testingCount > 0) return;
    const queue = [...serverEntries];
    if (queue.length === 0) {
      toast("当前没有可测试的 MCP 服务", "info");
      return;
    }

    let success = 0;
    let fail = 0;
    const workerCount = Math.min(MCP_BATCH_TEST_CONCURRENCY, queue.length);

    async function worker() {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        const [name, server] = item;
        // 批量测试静默执行，最终汇总一次结果，避免 toast 轰炸
        const ok = await runServerTest(name, server, { silent: true });
        if (ok) success += 1;
        else fail += 1;
      }
    }

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    toast(
      `MCP 一键测试完成：通过 ${success}，失败 ${fail}`,
      fail === 0 ? "success" : "warning",
    );
  }

  function setTargetEnabled(id: string, enabled: boolean) {
    setTargets((prev) =>
      prev.map((item) => (item.id === id ? { ...item, enabled } : item)),
    );
  }

  function saveTargetPath() {
    if (!selectedTarget) return;
    const nextPath = toAbsolutePath(pathDraft, homePath);
    if (!nextPath) {
      toast("路径不能为空", "warning");
      return;
    }
    setTargets((prev) =>
      prev.map((item) =>
        item.id === selectedTarget.id ? { ...item, path: nextPath } : item,
      ),
    );
    toast("目标路径已更新", "success");
  }

  function removeCustomTarget(id: string) {
    setTargets((prev) => prev.filter((item) => item.id !== id));
    if (selectedTargetId === id) {
      const next = targets.find((item) => item.id !== id);
      if (next) setSelectedTargetId(next.id);
    }
  }

  function addCustomTarget() {
    const label = customLabel.trim();
    const path = toAbsolutePath(customPath, homePath);
    if (!label || !path) {
      toast("请填写自定义目标名称和文件路径", "warning");
      return;
    }
    if (targets.some((item) => item.path === path)) {
      toast("目标文件路径已存在，请勿重复", "warning");
      return;
    }
    const next: McpSyncTarget = {
      id: `custom-${Date.now()}`,
      label,
      path,
      mode: customMode,
      isBuiltin: false,
      enabled: true,
      accentClass: "border-gray-700 bg-gray-950 text-gray-300",
    };
    setTargets((prev) => [...prev, next]);
    setSelectedTargetId(next.id);
    setPathDraft(next.path);
    setCustomLabel("");
    setCustomPath("");
    setCustomMode("json-replace");
    setShowCustomTargetForm(false);
    toast("已新增自定义同步目标", "success");
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在加载 MCP 配置
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="shrink-0 px-6 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-white">
                MCP 管理
              </h2>
              <HintTooltip content="统一以 ~/.agents/mcp.config.json 作为唯一源，维护 MCP 服务并同步到各工具配置。" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="rounded-lg border border-gray-800 bg-gray-900 px-2.5 py-1 font-mono">
                {sourcePath}
              </span>
              <span className="rounded-lg border border-gray-800 bg-gray-900 px-2.5 py-1">
                {serverEntries.length} 个服务
              </span>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              onClick={() => void reloadSource()}
              disabled={busy != null}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              {busy === "reload" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
              刷新
            </button>
            <button
              onClick={() => void saveSource()}
              disabled={busy != null || !dirty}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              保存源配置
            </button>
            <button
              onClick={() => void syncEnabledTargets()}
              disabled={busy != null}
              className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              {busy === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              同步已启用目标
            </button>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-5 pb-3">
        <div className="flex items-center justify-end">
          <div className={ACTION_GROUP_WRAPPER_CLASS}>
            {(
              [
                ["list", "服务列表"],
                ["sync", "同步目标"],
                ["online", "在线安装"],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setSelectedTab(tab)}
                className={`${ACTION_GROUP_BUTTON_BASE_CLASS} ${
                  selectedTab === tab ? ACTION_GROUP_BUTTON_ACTIVE_CLASS : ACTION_GROUP_BUTTON_INACTIVE_CLASS
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {selectedTab === "list" && (
          <section className="rounded-xl border border-gray-800 bg-gray-900/80">
            <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-200">MCP 服务列表</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void runBatchTests()}
                  disabled={testingCount > 0}
                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  {testingCount > 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  一键测试
                </button>
                <button
                  onClick={() => openServerEditor(null)}
                  className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  新增服务
                </button>
              </div>
            </div>
            {serverEntries.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-gray-400">当前没有 MCP 服务配置。</p>
              </div>
            ) : (
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="w-[22%] px-4 py-2.5 text-left text-xs text-gray-500">服务名</th>
                    <th className="w-[88px] px-4 py-2.5 text-left text-xs text-gray-500">类型</th>
                    <th className="px-4 py-2.5 text-left text-xs text-gray-500">启动信息</th>
                    <th className="w-[110px] px-4 py-2.5 text-left text-xs text-gray-500">参数</th>
                    <th className="w-[230px] px-4 py-2.5 text-left text-xs text-gray-500">测试状态</th>
                    <th className="w-[190px] px-4 py-2.5 text-center text-xs text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {serverEntries.map(([name, server], index) => {
                    const info = countServerInfo(server);
                    const testState = serverTests[name];
                    return (
                      <tr
                        key={name}
                        className={`hover:bg-gray-800/35 ${index < serverEntries.length - 1 ? "border-b border-gray-800/50" : ""}`}
                      >
                        <td className="px-4 py-2 align-middle">
                          <span className="truncate font-mono text-xs text-gray-200">{name}</span>
                        </td>
                        <td className="px-4 py-2 align-middle">
                          <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
                            {server.type ?? "stdio"}
                          </span>
                        </td>
                        <td className="px-4 py-2 align-middle">
                          {server.type === "http" ? (
                            <span className="block truncate font-mono text-xs text-cyan-300">
                              {String(server.url ?? "—")}
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="block truncate font-mono text-xs text-gray-300">
                                {String(server.command ?? "—")}
                              </span>
                              {Array.isArray(server.args) && server.args.length > 0 && (
                                <span className="block truncate font-mono text-[11px] text-gray-500">
                                  {server.args.join(" ")}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 align-middle">
                          <span className="text-xs text-gray-500">
                            args {info.args} / env {info.env}
                          </span>
                        </td>
                        <td className="px-4 py-2 align-middle">
                          {testState?.running ? (
                            <span className="inline-flex items-center gap-1 text-xs text-cyan-300">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              测试中...
                            </span>
                          ) : testState?.checkedAt ? (
                            <div className="space-y-0.5">
                              <span className={`block text-xs ${testState.ok ? "text-emerald-300" : "text-red-300"}`}>
                                {testState.ok ? "可用" : "不可用"} · {testState.status ?? "unknown"}
                                {typeof testState.latency_ms === "number" ? ` · ${testState.latency_ms}ms` : ""}
                              </span>
                              <span className="block truncate text-[11px] text-gray-500">
                                {testState.message}
                                {testState.detail ? `：${testState.detail}` : ""}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-600">未测试</span>
                          )}
                        </td>
                        <td className="px-4 py-2 align-middle whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => void runServerTest(name, server)}
                              disabled={!!testState?.running}
                              className={`${BUTTON_SECONDARY_CLASS} h-7 px-2.5 text-[11px] whitespace-nowrap`}
                              title="测试"
                            >
                              {testState?.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                              测试
                            </button>
                            <button
                              onClick={() => openServerEditor(name)}
                              className={BUTTON_ICON_GHOST_SM_CLASS}
                              title="编辑"
                            >
                              <FilePenLine className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => removeServer(name)}
                              className={BUTTON_ICON_DANGER_SM_CLASS}
                              title="删除"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        )}

        {selectedTab === "sync" && (
          <section className="rounded-xl border border-gray-800 bg-gray-900/80 px-5 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-medium text-gray-100">同步目标</h3>
                <HintTooltip content="启用后会把源配置同步到目标文件。Codex 目标会写入 config.toml 的 mcp_servers 字段，其它目标写 JSON。" />
              </div>
              <button
                onClick={() => void refreshTargetStatuses()}
                disabled={checkingTargets}
                className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              >
                {checkingTargets ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                检查
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {targets.map((target) => {
                const status = statuses[target.id];
                return (
                  <div key={target.id} className="rounded-xl border border-gray-800 bg-black/10 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${target.accentClass}`}>
                        {target.label}
                      </span>
                      <button
                        onClick={() => setTargetEnabled(target.id, !target.enabled)}
                        className={`relative inline-flex h-4 w-7 rounded-full transition-colors ${target.enabled ? "bg-indigo-600" : "bg-gray-700"}`}
                        role="switch"
                        aria-checked={target.enabled}
                      >
                        <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white transition duration-200 ${target.enabled ? "translate-x-3" : "translate-x-0"}`} />
                      </button>
                    </div>
                    <div className="mt-2 text-[10px] text-gray-500">
                      <span className={status?.exists ? "text-emerald-400" : "text-red-400"}>
                        {status?.exists ? "存在" : "缺失"}
                      </span>
                      {status?.syncedAt ? (
                        <span className="ml-2">
                          {new Date(status.syncedAt).toLocaleTimeString("zh-CN", { hour12: false })}
                        </span>
                      ) : null}
                      {status?.backupPath ? (
                        <span className="ml-2 text-cyan-400">已备份</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedTarget && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <select
                  value={selectedTargetId}
                  onChange={(event) => setSelectedTargetId(event.target.value)}
                  className={`w-40 ${FIELD_SELECT_CLASS}`}
                >
                  {targets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.label}
                    </option>
                  ))}
                </select>
                <input
                  value={pathDraft}
                  onChange={(event) => setPathDraft(event.target.value)}
                  className={`${FIELD_MONO_INPUT_CLASS} min-w-[280px] flex-1`}
                  placeholder="~/path/to/mcp-config.json"
                />
                <button
                  onClick={async () => {
                    const selected = await pickPath({
                      directory: false,
                      defaultPath: selectedTarget.path || homePath || undefined,
                    });
                    if (typeof selected === "string") setPathDraft(selected);
                  }}
                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  选择文件
                </button>
                <button
                  onClick={saveTargetPath}
                  className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  <Save className="h-3.5 w-3.5" />
                  保存路径
                </button>
                <button
                  onClick={() => void openPath(selectedTarget.path)}
                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  打开
                </button>
                {!selectedTarget.isBuiltin && (
                  <button
                    onClick={() => removeCustomTarget(selectedTarget.id)}
                    className={`${BUTTON_DANGER_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 rounded-xl border border-gray-800/80 bg-gray-950/30 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-200">自定义同步目标</p>
                {!showCustomTargetForm ? (
                  <button
                    onClick={() => setShowCustomTargetForm(true)}
                    className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    新增
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setShowCustomTargetForm(false);
                      setCustomLabel("");
                      setCustomPath("");
                    }}
                    className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                  >
                    <X className="h-3.5 w-3.5" />
                    取消
                  </button>
                )}
              </div>
              {showCustomTargetForm && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={customLabel}
                    onChange={(event) => setCustomLabel(event.target.value)}
                    className={`${FIELD_INPUT_CLASS} w-40`}
                    placeholder="目标名称"
                  />
                  <input
                    value={customPath}
                    onChange={(event) => setCustomPath(event.target.value)}
                    className={`${FIELD_MONO_INPUT_CLASS} min-w-[260px] flex-1`}
                    placeholder="~/custom/mcp.json"
                  />
                  <select
                    value={customMode}
                    onChange={(event) => setCustomMode(event.target.value as SyncMode)}
                    className={`${FIELD_SELECT_CLASS} w-40`}
                  >
                    <option value="json-replace">JSON 覆盖</option>
                    <option value="json-merge">JSON mcpServers</option>
                    <option value="json-mcpServers">JSON 设置 mcpServers</option>
                    <option value="codex-toml">Codex TOML</option>
                    <option value="opencode-json">OpenCode JSON</option>
                  </select>
                  <button
                    onClick={async () => {
                      const selected = await pickPath({
                        directory: false,
                        defaultPath: homePath || undefined,
                      });
                      if (typeof selected === "string") setCustomPath(selected);
                    }}
                    className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    选择
                  </button>
                  <button
                    onClick={addCustomTarget}
                    className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                  >
                    <Save className="h-3.5 w-3.5" />
                    保存
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {selectedTab === "online" && (
          <ModelscopeOnlineInstallPanel
            existingServerNames={new Set(Object.keys(config.mcpServers))}
            onImportServer={importModelscopeServer}
          />
        )}
      </div>

      {editorOpen && (
        <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-2xl rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                {editingServerName ? "编辑 MCP 服务" : "新增 MCP 服务"}
              </h3>
              <button
                onClick={() => setEditorOpen(false)}
                className={BUTTON_ICON_GHOST_SM_CLASS}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <p className="mb-1 text-xs text-gray-400">服务名</p>
                <input
                  value={draftServerName}
                  onChange={(event) => setDraftServerName(event.target.value)}
                  className={FIELD_INPUT_CLASS}
                  placeholder="例如：playwright"
                />
              </div>
              <div>
                <p className="mb-1 text-xs text-gray-400">服务配置 JSON</p>
                <textarea
                  value={draftServerJson}
                  onChange={(event) => setDraftServerJson(event.target.value)}
                  className={`${FIELD_MONO_INPUT_CLASS} min-h-[260px] resize-y py-2`}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setEditorOpen(false)}
                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  取消
                </button>
                <button
                  onClick={saveServerDraft}
                  className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
