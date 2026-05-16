import { useEffect, useMemo, useRef, useState } from "react";
import { open as pickPath } from "@tauri-apps/plugin-dialog";
import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { homeDir } from "@tauri-apps/api/path";
import {
  CheckCircle2,
  Download,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Send,
  X,
} from "lucide-react";
import { inspectModelscopeMcpServer, searchModelscopeMcpServers, testMcpServer } from "@/api";
import {
  ACTION_GROUP_BUTTON_ACTIVE_CLASS,
  ACTION_GROUP_BUTTON_BASE_CLASS,
  ACTION_GROUP_BUTTON_INACTIVE_CLASS,
  ACTION_GROUP_WRAPPER_CLASS,
} from "@/lib/actionGroupStyles";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_ICON_GHOST_SM_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "@/lib/buttonStyles";
import { FIELD_INPUT_CLASS, FIELD_MONO_INPUT_CLASS, FIELD_SELECT_CLASS } from "@/lib/formStyles";
import { loadPersistedJson, savePersistedJson } from "@/lib/persistence";
import { renderMarkdownToHtml } from "@/lib/promptMarkdown";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/devlog";
import { HintTooltip } from "../HintTooltip";
import type { ModelscopeRequestProfileInput, ModelscopeServerDetail } from "@/types";
import DOMPurify from "dompurify";
import {
  McpConfig,
  McpServerConfig,
  McpServiceTestState,
  McpSyncTarget,
  OnlineImportState,
  SyncMode,
} from "./types";
import {
  MCP_ONLINE_IMPORT_ENABLED,
  MCP_SYNC_TARGETS_DB_KEY,
  MCP_SYNC_TARGETS_KEY,
  MODELSCOPE_API_DB_KEY,
  MODELSCOPE_API_KEY,
  backupIfExists,
  buildBuiltinTargets,
  buildImportedServerEntries,
  buildModelscopeProfile,
  buildSourcePath,
  createEmptyConfig,
  defaultServerDraft,
  extractTransportConfigs,
  getModelscopeDetailData,
  getModelscopeDetailMarkdown,
  ensureParentDir,
  getModelscopeDisplayName,
  getModelscopeSearchItems,
  getModelscopeSearchTotal,
  hasImportedServerPrefix,
  maskAuthorizationHeader,
  normalizeHomePath,
  normalizeSyncTargets,
  parseMcpConfig,
  persistSourceConfig as utilsPersistSourceConfig,
  stringifyConfig,
  toAbsolutePath,
  toModelscopeDetailFallback,
  writeSyncTarget,
} from "./utils";
import { McpServerList } from "./components/McpServerList";
import { McpServerEditor } from "./components/McpServerEditor";

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
  const [statuses, setStatuses] = useState<Record<string, { exists: boolean; syncedAt?: number; error?: string; backupPath?: string }>>({});
  const [serverTests, setServerTests] = useState<Record<string, McpServiceTestState>>({});
  const [checkingTargets, setCheckingTargets] = useState(false);
  const [showCustomTargetForm, setShowCustomTargetForm] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customPath, setCustomPath] = useState("");
  const [customMode, setCustomMode] = useState<SyncMode>("json-replace");
  const [modelscopeProfile, setModelscopeProfile] = useState<ModelscopeRequestProfileInput | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingServerName, setEditingServerName] = useState<string | null>(null);
  const [draftServerName, setDraftServerName] = useState("");
  const [draftServerJson, setDraftServerJson] = useState(JSON.stringify(defaultServerDraft(), null, 2));
  const msDetailPanelRef = useRef<HTMLDivElement | null>(null);
  const [msSearchQuery, setMsSearchQuery] = useState("");
  const [msResults, setMsResults] = useState<Array<{ id: string; name: string; chinese_name?: string; description?: string; categories?: string[] }>>([]);
  const [msLoading, setMsLoading] = useState(false);
  const [msError, setMsError] = useState<string | null>(null);
  const [msTotal, setMsTotal] = useState(0);
  const [msDetail, setMsDetail] = useState<ModelscopeServerDetail | null>(null);
  const [msDetailLoading, setMsDetailLoading] = useState(false);
  const [msDetailError, setMsDetailError] = useState<string | null>(null);
  const [msDetailModalOpen, setMsDetailModalOpen] = useState(false);
  const [msImporting, setMsImporting] = useState(false);
  const [lastImported, setLastImported] = useState<OnlineImportState | null>(null);

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

  const testingCount = useMemo(
    () => Object.values(serverTests).filter((item) => item.running).length,
    [serverTests],
  );

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
        const modelscopeApiKey = await loadPersistedJson<string>(
          MODELSCOPE_API_DB_KEY,
          MODELSCOPE_API_KEY,
          "",
        );
        const nextTargets = normalizeSyncTargets(home, rawTargets);
        if (!active) return;

        setHomePath(home);
        setSourcePath(nextSourcePath);
        setConfig(nextConfig);
        setTargets(nextTargets);
        setModelscopeProfile(buildModelscopeProfile(modelscopeApiKey ?? ""));
        setDirty(false);
        logger.info(`[MCP] 配置加载完成：source=${nextSourcePath} servers=${Object.keys(nextConfig.mcpServers).length}`);
      } catch (error) {
        logger.error(`[MCP] 初始化失败：${error instanceof Error ? error.message : String(error)}`);
        toast("读取 MCP 配置失败", "error");
      } finally {
        if (active) setLoading(false);
      }
    }
    void bootstrap();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!homePath || targets.length === 0) return;
    void savePersistedJson(MCP_SYNC_TARGETS_DB_KEY, targets, MCP_SYNC_TARGETS_KEY);
  }, [homePath, targets]);

  async function refreshTargetStatuses() {
    setCheckingTargets(true);
    try {
      const next: Record<string, { exists: boolean; syncedAt?: number; error?: string; backupPath?: string }> = {};
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
  }, [targets]);

  async function reloadSource() {
    setBusy("reload");
    try {
      const sourceExists = await exists(sourcePath);
      const nextConfig = sourceExists ? parseMcpConfig(JSON.parse(await readTextFile(sourcePath))) : createEmptyConfig();
      setConfig(nextConfig);
      setDirty(false);
      toast("已刷新 MCP 配置", "success");
    } catch (error) {
      toast("刷新 MCP 配置失败", "error");
      logger.error(`[MCP] 刷新 source 失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function persistSourceConfig(nextConfig: McpConfig, options?: { backup?: boolean }) {
    if (options?.backup) await backupIfExists(sourcePath);
    await ensureParentDir(sourcePath);
    await writeTextFile(sourcePath, stringifyConfig(nextConfig));
  }

  async function saveSource() {
    setBusy("save");
    try {
      await persistSourceConfig(config, { backup: true });
      setDirty(false);
      toast("MCP 配置已保存", "success");
    } catch (error) {
      toast("保存 MCP 配置失败", "error");
    } finally {
      setBusy(null);
    }
  }

  async function syncEnabledTargets() {
    const enabledTargets = targets.filter((item) => item.enabled);
    if (enabledTargets.length === 0) { toast("请先启用至少一个同步目标", "warning"); return; }
    setBusy("sync");
    let successCount = 0;
    let failCount = 0;
    const nextStatuses = { ...statuses };
    try {
      for (const target of enabledTargets) {
        try {
          const backupPath = await writeSyncTarget(target, config);
          successCount += 1;
          nextStatuses[target.id] = { exists: true, syncedAt: Date.now(), backupPath: backupPath ?? undefined };
        } catch (error) {
          failCount += 1;
          const message = error instanceof Error ? error.message : String(error);
          nextStatuses[target.id] = { exists: await exists(target.path), syncedAt: Date.now(), error: message };
        }
      }
      setStatuses(nextStatuses);
      toast(`MCP 同步完成：成功 ${successCount}，失败 ${failCount}`, failCount === 0 ? "success" : "warning");
    } finally {
      setBusy(null);
    }
  }

  async function syncSingleTarget(target: McpSyncTarget) {
    const tag = `sync-${target.id}`;
    setBusy(tag);
    try {
      const backupPath = await writeSyncTarget(target, config);
      setStatuses((prev) => ({ ...prev, [target.id]: { exists: true, syncedAt: Date.now(), backupPath: backupPath ?? undefined } }));
      toast(`${target.label} 同步成功`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const targetExists = await exists(target.path);
      setStatuses((prev) => ({ ...prev, [target.id]: { exists: targetExists, syncedAt: Date.now(), error: message } }));
      toast(`${target.label} 同步失败：${message}`, "error");
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
    if (!nextName) { toast("服务名不能为空", "warning"); return; }
    let parsed: McpServerConfig;
    try {
      const value = JSON.parse(draftServerJson);
      if (!value || typeof value !== "object" || Array.isArray(value)) { toast("服务配置必须是 JSON 对象", "warning"); return; }
      parsed = value as McpServerConfig;
    } catch (error) {
      toast(`服务配置 JSON 无效：${error instanceof Error ? error.message : String(error)}`, "error");
      return;
    }
    const next = { ...config.mcpServers };
    if (editingServerName && editingServerName !== nextName) delete next[editingServerName];
    if (!editingServerName && next[nextName]) { toast("服务名已存在，请修改后重试", "warning"); return; }
    next[nextName] = parsed;
    setConfig({ mcpServers: next });
    setDirty(true);
    setEditorOpen(false);
    toast(`已保存 MCP 服务：${nextName}`, "success");
  }

  async function runServerTest(name: string, server: McpServerConfig, options?: { silent?: boolean }) {
    setServerTests((prev) => ({ ...prev, [name]: { ...(prev[name] ?? {}), running: true } }));
    try {
      const result = await testMcpServer(name, server);
      setServerTests((prev) => ({ ...prev, [name]: { running: false, ok: result.ok, status: result.status, message: result.message, detail: result.detail ?? null, latency_ms: result.latency_ms ?? null, checkedAt: Date.now() } }));
      if (result.ok && !options?.silent) toast(`${name} 测试通过`, "success");
      else if (!result.ok && !options?.silent) toast(`${name} 测试失败：${result.message}`, "warning");
      return result.ok;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setServerTests((prev) => ({ ...prev, [name]: { running: false, ok: false, status: "error", message, detail: null, latency_ms: null, checkedAt: Date.now() } }));
      if (!options?.silent) toast(`${name} 测试失败`, "error");
      return false;
    }
  }

  async function runBatchTests() {
    if (testingCount > 0) return;
    const queue = [...serverEntries];
    if (queue.length === 0) { toast("当前没有可测试的 MCP 服务", "info"); return; }
    let success = 0;
    let fail = 0;
    const workerCount = Math.min(4, queue.length);
    async function worker() {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        const [name, server] = item;
        const ok = await runServerTest(name, server, { silent: true });
        if (ok) success += 1; else fail += 1;
      }
    }
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    toast(`MCP 一键测试完成：通过 ${success}，失败 ${fail}`, fail === 0 ? "success" : "warning");
  }

  function setTargetEnabled(id: string, enabled: boolean) {
    setTargets((prev) => prev.map((item) => (item.id === id ? { ...item, enabled } : item)));
  }

  function addCustomTarget() {
    const label = customLabel.trim();
    const path = toAbsolutePath(customPath, homePath);
    if (!label || !path) { toast("请填写自定义目标名称和文件路径", "warning"); return; }
    if (targets.some((item) => item.path === path)) { toast("目标文件路径已存在，请勿重复", "warning"); return; }
    const next: McpSyncTarget = { id: `custom-${Date.now()}`, label, path, mode: customMode, isBuiltin: false, enabled: true, accentClass: "border-gray-700 bg-gray-950 text-gray-300", syncServerNames: null };
    setTargets((prev) => [...prev, next]);
    setCustomLabel(""); setCustomPath(""); setCustomMode("json-replace");
    setShowCustomTargetForm(false);
    toast("已新增自定义同步目标", "success");
  }

  useEffect(() => {
    if (!MCP_ONLINE_IMPORT_ENABLED) { setMsResults([]); setMsTotal(0); setMsError(null); setMsLoading(false); return; }
    const timer = window.setTimeout(async () => {
      setMsLoading(true); setMsError(null);
      try {
        const res = await searchModelscopeMcpServers(msSearchQuery.trim(), 100, modelscopeProfile);
        setMsResults(getModelscopeSearchItems(res));
        setMsTotal(getModelscopeSearchTotal(res));
      } catch (error) {
        setMsResults([]); setMsTotal(0); setMsError(error instanceof Error ? error.message : String(error));
      } finally { setMsLoading(false); }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [modelscopeProfile, msSearchQuery]);

  async function fetchModelscopeDetail(serverId: string, options?: { silent?: boolean }) {
    const fallback = msResults.find((item) => item.id === serverId);
    if (!options?.silent) {
      if (fallback) setMsDetail(toModelscopeDetailFallback(fallback));
      setMsDetailLoading(true); setMsDetailError(null);
    }
    try {
      const detailResponse = await inspectModelscopeMcpServer(serverId, modelscopeProfile);
      const detail = getModelscopeDetailData(detailResponse);
      if (!detail) throw new Error("详情响应缺少 data");
      if (!options?.silent) setMsDetail(detail);
      return detail;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!options?.silent) {
        if (fallback) setMsDetail(toModelscopeDetailFallback(fallback)); else setMsDetail(null);
        setMsDetailError(message || "详情加载失败");
      }
      throw error;
    } finally { if (!options?.silent) setMsDetailLoading(false); }
  }

  function handleOpenOnlineDetail(serverId: string) {
    setMsDetailModalOpen(true);
    const fallback = msResults.find((item) => item.id === serverId);
    if (fallback) { setMsDetail(toModelscopeDetailFallback(fallback)); setMsDetailError(null); } else { setMsDetail(null); }
    void fetchModelscopeDetail(serverId, { silent: false }).catch((e) => logger.warn("Detail fetch failed", e));
  }

  async function handleImportOnline(serverDetail: ModelscopeServerDetail) {
    const importEntries = buildImportedServerEntries(serverDetail);
    if (importEntries.length === 0) { toast("该服务没有可导入的配置", "warning"); return; }
    setMsImporting(true);
    try {
      const nextServers = { ...config.mcpServers };
      let overwriteCount = 0;
      for (const [name, cfg] of importEntries) { if (Object.prototype.hasOwnProperty.call(nextServers, name)) overwriteCount += 1; nextServers[name] = cfg; }
      const nextConfig = { mcpServers: nextServers };
      await persistSourceConfig(nextConfig, { backup: true });
      setConfig(nextConfig);
      setLastImported({ detailId: serverDetail.id, serverNames: importEntries.map(([n]) => n) });
      toast(overwriteCount > 0 ? `已导入 ${importEntries.length} 个配置，覆盖 ${overwriteCount} 个同名 MCP` : `已导入 ${importEntries.length} 个 MCP 配置`, "success");
    } catch (error) { toast(`导入 MCP 失败：${error instanceof Error ? error.message : String(error)}`, "error"); }
    finally { setMsImporting(false); }
  }

  async function handleImportOnlineFromCard(server: ModelscopeServerDetail) {
    try {
      const detail = await fetchModelscopeDetail(server.id, { silent: true });
      await handleImportOnline(detail);
    } catch (error) { toast(`导入 MCP 失败：${error instanceof Error ? error.message : String(error)}`, "error"); }
  }

  async function handleValidateImportedServers() {
    if (!lastImported || lastImported.serverNames.length === 0) { toast("当前没有刚导入的 MCP 服务", "info"); return; }
    let success = 0; let fail = 0;
    for (const name of lastImported.serverNames) {
      const server = config.mcpServers[name];
      if (!server) { fail += 1; continue; }
      const ok = await runServerTest(name, server, { silent: true });
      if (ok) success += 1; else fail += 1;
    }
    toast(`刚导入的 MCP 验证完成：通过 ${success}，失败 ${fail}`, fail === 0 ? "success" : "warning");
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
              <h2 className="text-base font-semibold tracking-tight text-white">MCP 管理</h2>
              <HintTooltip content="统一以 ~/.agents/mcp.config.json 作为唯一源，维护 MCP 服务并同步到各工具配置。" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="rounded-lg border border-gray-800 bg-gray-900 px-2.5 py-1 font-mono">{sourcePath}</span>
              <span className="rounded-lg border border-gray-800 bg-gray-900 px-2.5 py-1">{serverEntries.length} 个服务</span>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => void reloadSource()} disabled={busy != null} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
              {busy === "reload" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} 刷新
            </button>
            <button onClick={() => void saveSource()} disabled={busy != null || !dirty} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
              {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} 保存源配置
            </button>
            <button onClick={() => void syncEnabledTargets()} disabled={busy != null} className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
              {busy === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} 同步已启用目标
            </button>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-5 pb-3">
        <div className="flex items-center justify-end">
          <div className={ACTION_GROUP_WRAPPER_CLASS}>
            {([
              ["list", "服务列表"],
              ["sync", "同步目标"],
              ...(MCP_ONLINE_IMPORT_ENABLED ? ([["online", "在线导入"]] as const) : []),
            ] as const).map(([tab, label]) => (
              <button key={tab} onClick={() => setSelectedTab(tab)} className={`${ACTION_GROUP_BUTTON_BASE_CLASS} ${selectedTab === tab ? ACTION_GROUP_BUTTON_ACTIVE_CLASS : ACTION_GROUP_BUTTON_INACTIVE_CLASS}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {selectedTab === "list" && (
          <McpServerList
            serverEntries={serverEntries}
            serverTests={serverTests}
            testingCount={testingCount}
            busy={busy}
            onTest={(name, server) => void runServerTest(name, server)}
            onBatchTest={() => void runBatchTests()}
            onEdit={openServerEditor}
            onRemove={removeServer}
          />
        )}

        {selectedTab === "sync" && (
          <section className="rounded-xl border border-gray-800 bg-gray-900/80 px-5 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-medium text-gray-100">同步目标</h3>
                <HintTooltip content="启用后会把源配置同步到目标文件。" />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => void refreshTargetStatuses()} disabled={checkingTargets} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
                  {checkingTargets ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} 检查文件
                </button>
                <button onClick={() => void syncEnabledTargets()} disabled={busy != null} className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
                  {busy === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} 一键同步全部
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {targets.map((target) => {
                const status = statuses[target.id];
                const syncNames = target.syncServerNames;
                const totalServers = Object.keys(config.mcpServers).length;
                const selectedCount = syncNames ? syncNames.length : totalServers;
                const syncingThis = busy === `sync-${target.id}`;
                return (
                  <div key={target.id} className="rounded-xl border border-gray-800 bg-black/10 px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${target.accentClass}`}>{target.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500">
                          <span className={status?.exists ? "text-emerald-400" : "text-red-400"}>{status?.exists ? "存在" : "缺失"}</span>
                          {status?.syncedAt && <span className="ml-1">{new Date(status.syncedAt).toLocaleTimeString("zh-CN", { hour12: false })}</span>}
                        </span>
                        <button onClick={() => setTargetEnabled(target.id, !target.enabled)} className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full border border-transparent transition-colors ${target.enabled ? "bg-indigo-600" : "bg-gray-700"}`} role="switch" aria-checked={target.enabled}>
                          <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition duration-200 ${target.enabled ? "translate-x-3" : "translate-x-0"}`} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-gray-500">
                      {syncNames ? `${selectedCount}/${totalServers} 个服务` : `全部 ${totalServers} 个服务`}
                      {status?.error && <span className="ml-2 text-red-400">失败</span>}
                    </div>
                    {config.mcpServers && Object.keys(config.mcpServers).length > 0 && (
                      <div className="mt-2 max-h-[200px] space-y-1 overflow-y-auto rounded-lg border border-gray-800 bg-gray-950/40 px-2 py-2">
                        <label className="flex items-center gap-2 rounded px-1 py-1 text-xs text-gray-400 hover:bg-gray-800/50">
                          <input type="checkbox" checked={syncNames === null} onChange={() => { setTargets((prev) => prev.map((t) => t.id === target.id ? { ...t, syncServerNames: t.syncServerNames === null ? [] : null } : t)); }} className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-indigo-500 focus:ring-indigo-500/30" />
                          <span className="text-gray-300">全部同步</span>
                        </label>
                        {serverEntries.map(([name]) => (
                          <label key={`${target.id}-${name}`} className="flex items-center gap-2 rounded px-1 py-1 text-xs text-gray-400 hover:bg-gray-800/50">
                            <input type="checkbox" checked={syncNames ? syncNames.includes(name) : true} onChange={() => {
                              setTargets((prev) => prev.map((t) => {
                                if (t.id !== target.id) return t;
                                const current = t.syncServerNames;
                                if (current === null) return { ...t, syncServerNames: serverEntries.map(([n]) => n).filter((n) => n !== name) };
                                const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name];
                                return { ...t, syncServerNames: next.length === totalServers ? null : next };
                              }));
                            }} className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-indigo-500 focus:ring-indigo-500/30" />
                            <span className="truncate font-mono">{name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-end border-t border-gray-800 pt-2">
                      <button onClick={() => void syncSingleTarget(target)} disabled={!target.enabled || syncingThis || busy != null} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
                        {syncingThis ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} 同步
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-gray-800/80 bg-gray-950/30 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-200">自定义同步目标</p>
                {!showCustomTargetForm ? (
                  <button onClick={() => setShowCustomTargetForm(true)} className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}><Plus className="h-3.5 w-3.5" /> 新增</button>
                ) : (
                  <button onClick={() => { setShowCustomTargetForm(false); setCustomLabel(""); setCustomPath(""); }} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}><X className="h-3.5 w-3.5" /> 取消</button>
                )}
              </div>
              {showCustomTargetForm && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} className={`${FIELD_INPUT_CLASS} w-40`} placeholder="目标名称" />
                  <input value={customPath} onChange={(e) => setCustomPath(e.target.value)} className={`${FIELD_MONO_INPUT_CLASS} min-w-[260px] flex-1`} placeholder="~/custom/mcp.json" />
                  <select value={customMode} onChange={(e) => setCustomMode(e.target.value as SyncMode)} className={`${FIELD_SELECT_CLASS} w-40`}>
                    <option value="json-replace">JSON 覆盖</option>
                    <option value="json-merge">JSON mcpServers</option>
                    <option value="json-mcpServers">JSON 设置 mcpServers</option>
                    <option value="codex-toml">Codex TOML</option>
                    <option value="opencode-json">OpenCode JSON</option>
                  </select>
                  <button onClick={async () => { const selected = await pickPath({ directory: false, defaultPath: homePath || undefined }); if (typeof selected === "string") setCustomPath(selected); }} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}><FolderOpen className="h-3.5 w-3.5" /> 选择</button>
                  <button onClick={addCustomTarget} className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}><Save className="h-3.5 w-3.5" /> 保存</button>
                </div>
              )}
            </div>
          </section>
        )}

        {MCP_ONLINE_IMPORT_ENABLED && selectedTab === "online" && (
          <section className="rounded-xl border border-gray-800 bg-gray-900/80 px-5 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-medium text-gray-100">在线导入</h3>
                <HintTooltip content="从 ModelScope 社区搜索 MCP 服务。" />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-gray-800/70 bg-black/15 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input value={msSearchQuery} onChange={(e) => setMsSearchQuery(e.target.value)} placeholder="搜索 MCP 服务..." className={`${FIELD_MONO_INPUT_CLASS} pl-9`} />
                </div>
              </div>
              <div className="mt-2 text-[11px] text-gray-500">{msLoading ? "正在查询..." : msTotal > 0 ? `${msTotal} 个结果` : "输入关键词搜索或留空浏览列表"}</div>
              {msError && <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-200">{msError}</div>}
            </div>

            <div className="mt-4">
              <div className="grid grid-cols-2 gap-2.5">
                {msResults.length === 0 && !msLoading && (
                  <div className="col-span-2 rounded-xl border border-dashed border-gray-800 bg-black/10 px-4 py-8 text-sm text-gray-500">{msSearchQuery.trim() ? "没有匹配的搜索结果。" : "加载中..."}</div>
                )}
                {msResults.map((server) => {
                  const installed = hasImportedServerPrefix(getModelscopeBaseName(server), config.mcpServers);
                  return (
                    <div key={server.id} className="rounded-xl border border-gray-800 bg-black/10 px-3 py-3 transition-colors hover:border-gray-700">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-100">{getModelscopeDisplayName(server)}</p>
                          <p className="mt-1 truncate text-[11px] text-gray-500">{server.id}</p>
                        </div>
                        {installed && <span className="shrink-0 rounded-full border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">已导入</span>}
                      </div>
                      {(server.description) && <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-400">{server.description}</p>}
                      <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-gray-800 pt-2">
                        <button onClick={(e) => { e.stopPropagation(); void handleImportOnlineFromCard(server); }} disabled={msImporting} className={`${installed ? BUTTON_SECONDARY_CLASS : BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
                          {msImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} {installed ? "重新导入" : "导入"}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleOpenOnlineDetail(server.id); }} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>详情</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {msDetailModalOpen && (
              <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/70 px-4">
                <div ref={msDetailPanelRef} role="dialog" aria-modal="true" aria-label={msDetail ? getModelscopeDisplayName(msDetail) : "MCP 详情"} className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl">
                  <div className="flex items-start justify-between gap-4 border-b border-gray-800 px-6 py-5">
                    <div className="min-w-0"><h4 className="truncate text-lg font-semibold text-white">{msDetail ? getModelscopeDisplayName(msDetail) : "MCP 详情"}</h4>{msDetail?.id && <p className="mt-1 truncate text-xs text-gray-500">{msDetail.id}</p>}</div>
                    <button onClick={() => setMsDetailModalOpen(false)} className={BUTTON_ICON_GHOST_SM_CLASS}><X className="h-4 w-4" /></button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                    {msDetailLoading && <div className="mb-4 flex items-center gap-2 text-sm text-gray-300"><Loader2 className="h-4 w-4 animate-spin" /> 正在更新详情...</div>}
                    {msDetailError && <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">详情接口未返回完整配置。{msDetailError ? ` 原因：${msDetailError}` : ""}</div>}
                    {msDetail ? (
                      <div className="space-y-5">
                        <div className="flex flex-wrap gap-1.5">
                          {(msDetail.categories ?? []).map((cat) => <span key={cat} className="rounded-full border border-gray-700 bg-gray-900 px-2 py-0.5 text-[10px] text-gray-300">{cat}</span>)}
                          {(msDetail.operational_urls ?? []).map((item) => <span key={`${item.transport_type ?? "sse"}-${item.url}`} className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-200">{item.transport_type ?? "sse"}</span>)}
                        </div>
                        {msDetail.source_url && <p className="break-all text-xs text-gray-500">来源：{msDetail.source_url}</p>}
                        <div className="markdown-preview rounded-xl border border-gray-800 bg-black/15 px-4 py-4" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdownToHtml(getModelscopeDetailMarkdown(msDetail))) }} />
                        {Object.keys(extractTransportConfigs(msDetail)).length > 0 && (
                          <div><div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-gray-500">配置预览</div><pre className="max-h-[280px] overflow-auto rounded-xl border border-gray-800 bg-gray-900/80 px-3 py-2 font-mono text-[11px] leading-5 text-gray-300">{JSON.stringify(extractTransportConfigs(msDetail), null, 2)}</pre></div>
                        )}
                      </div>
                    ) : <div className="text-sm text-gray-500">暂无详情数据。</div>}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 border-t border-gray-800 px-6 py-4">
                    {msDetail && <button onClick={() => void handleImportOnline(msDetail)} disabled={msImporting || Object.keys(extractTransportConfigs(msDetail)).length === 0} className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>{msImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} 导入到源配置</button>}
                    {msDetail && <button onClick={() => void fetchModelscopeDetail(msDetail.id, { silent: false })} disabled={msDetailLoading} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>{msDetailLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} 刷新详情</button>}
                    {lastImported?.detailId === msDetail?.id && (
                      <>
                        <button onClick={() => void handleValidateImportedServers()} disabled={testingCount > 0} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}><CheckCircle2 className="h-3.5 w-3.5" /> 验证刚导入的服务</button>
                        <button onClick={() => void syncEnabledTargets()} disabled={busy != null} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}><Send className="h-3.5 w-3.5" /> 同步到已启用目标</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <McpServerEditor
        open={editorOpen}
        editingName={editingServerName}
        draftName={draftServerName}
        draftJson={draftServerJson}
        onDraftNameChange={setDraftServerName}
        onDraftJsonChange={setDraftServerJson}
        onSave={saveServerDraft}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  );
}
