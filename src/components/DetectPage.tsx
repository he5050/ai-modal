import { useState, useEffect, useRef } from "react";
import { listModelsByProvider, testSingleModelByProvider } from "../api";
import type { ModelResult, Provider, ProviderLastResult } from "../types";
import { CopyButton } from "./CopyButton";
import { Tooltip } from "./Tooltip";
import { logger } from "../lib/devlog";
import { FIELD_INPUT_CLASS } from "../lib/formStyles";
import { toast } from "../lib/toast";
import { animate, spring } from "animejs";
import { getConcurrency } from "./SettingsPage";
import { X, Eye, EyeOff, Loader2 } from "lucide-react";

type Phase = "idle" | "fetching" | "testing" | "done";
type RowStatus = "pending" | "done";
interface LiveResult extends ModelResult {
  status: RowStatus;
}

function getResultDetails(result: ModelResult) {
  return result.response_text?.trim() || result.error || "—";
}

function maskPreviewText(value: string) {
  if (!value) return "—";
  if (value.length <= 4) return `${value.slice(0, 1)}******${value.slice(-1)}`;
  return `${value.slice(0, 2)}******${value.slice(-2)}`;
}

function buildTestSignature(baseUrl: string, apiKey: string) {
  return `${baseUrl.trim()}::${apiKey.trim()}`;
}

function DeleteDialog({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (overlayRef.current) {
      animate(overlayRef.current, {
        opacity: [0, 1],
        duration: 180,
        ease: "outQuad",
      });
    }
    if (cardRef.current) {
      animate(cardRef.current, {
        opacity: [0, 1],
        translateY: [12, 0],
        scale: [0.97, 1],
        ease: spring({ stiffness: 380, damping: 22 }),
        duration: 400,
      });
    }
  }, []);

  return (
    <div
      ref={overlayRef}
      style={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div
        ref={cardRef}
        style={{ opacity: 0 }}
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 shadow-xl"
      >
        <h3 className="text-sm font-semibold text-white mb-2">确认删除</h3>
        <p className="text-sm text-gray-400 mb-5">
          确定要删除 <span className="text-gray-200 font-medium">{name}</span>{" "}
          吗？此操作不可撤销。
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ available }: { available: boolean }) {
  return available ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      可用
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
      不可用
    </span>
  );
}

interface Props {
  providers: Provider[];
  editTarget: Provider | null;
  onClearEditTarget: () => void;
  onAddProvider: (
    p: Omit<Provider, "id" | "createdAt" | "lastResult">,
  ) => string;
  onEditProvider: (
    id: string,
    p: Omit<Provider, "id" | "createdAt" | "lastResult">,
  ) => void;
  onDeleteProvider: (id: string) => void;
  onSaveResult: (id: string, result: ProviderLastResult) => void;
  onDirtyChange: (dirty: boolean) => void;
  onOpenModels: () => void;
}

export function DetectPage({
  providers,
  editTarget,
  onClearEditTarget,
  onAddProvider,
  onEditProvider,
  onDeleteProvider,
  onSaveResult,
  onDirtyChange,
  onOpenModels,
}: Props) {
  const RECENT_PAGE_SIZE = 10;
  const RECENT_MAX_ITEMS = 500;
  const [name, setName] = useState("");
  const [origName, setOrigName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [origBaseUrl, setOrigBaseUrl] = useState("");
  const [origApiKey, setOrigApiKey] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const testBtnRef = useRef<HTMLButtonElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [results, setResults] = useState<ModelResult[]>([]);
  const [liveResults, setLiveResults] = useState<LiveResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [testCount, setTestCount] = useState({ done: 0, total: 0 });
  const [resultTimestamp, setResultTimestamp] = useState<number | null>(null);
  const [lastTestMode, setLastTestMode] = useState<"none" | "all" | "single">(
    "none",
  );
  const [lastTestSignature, setLastTestSignature] = useState<string | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [recentPage, setRecentPage] = useState(1);

  // editTarget 回填：从模型列表页点击编辑时触发
  useEffect(() => {
    if (!editTarget) return;
    setName(editTarget.name);
    setOrigName(editTarget.name);
    setBaseUrl(editTarget.baseUrl);
    setApiKey(editTarget.apiKey);
    setManualModel("");
    setEditingId(editTarget.id);
    setOrigBaseUrl(editTarget.baseUrl);
    setOrigApiKey(editTarget.apiKey);
    setPhase("idle");
    setResults([]);
    setLiveResults([]);
    setError(null);
    setProgress("");
    setResultTimestamp(null);
    setUrlError(null);
    setTestCount({ done: 0, total: 0 });
    setLastTestMode("none");
    setLastTestSignature(null);
    onClearEditTarget();
  }, [editTarget?.id]);

  const isLoading = phase === "fetching" || phase === "testing";
  const isDone = phase === "done";
  const currentFormSignature = buildTestSignature(baseUrl, apiKey);
  const hasCurrentResults = lastTestSignature === currentFormSignature;
  const visibleResults = hasCurrentResults ? results : [];
  const visibleResultTimestamp = hasCurrentResults ? resultTimestamp : null;
  const recentProviders = [...providers]
    .sort(
      (a, b) =>
        (b.lastResult?.timestamp ?? b.createdAt) -
        (a.lastResult?.timestamp ?? a.createdAt),
    )
    .slice(0, RECENT_MAX_ITEMS);
  const recentTotalPages = Math.max(
    1,
    Math.ceil(recentProviders.length / RECENT_PAGE_SIZE),
  );
  const pagedRecentProviders = recentProviders.slice(
    (recentPage - 1) * RECENT_PAGE_SIZE,
    recentPage * RECENT_PAGE_SIZE,
  );

  // 编辑中且表单有改动（名称/URL/Key 任一变化）时为 dirty
  const isDirty =
    !!editingId &&
    (name !== origName || baseUrl !== origBaseUrl || apiKey !== origApiKey);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty]);

  function handleReset() {
    setName("");
    setBaseUrl("");
    setApiKey("");
    setManualModel("");
    setOrigName("");
    setEditingId(null);
    setOrigBaseUrl("");
    setOrigApiKey("");
    setPhase("idle");
    setResults([]);
    setLiveResults([]);
    setError(null);
    setProgress("");
    setResultTimestamp(null);
    setUrlError(null);
    setTestCount({ done: 0, total: 0 });
    setLastTestMode("none");
    setLastTestSignature(null);
  }

  function handleExport() {
    const header =
      "| 模型 | 状态 | 延迟 | 返回结果 |\n|------|------|------|------|\n";
    const rows = visibleResults
      .map(
        (r) =>
          `| ${r.model} | ${r.available ? "✅ 可用" : "❌ 不可用"} | ${r.latency_ms != null ? r.latency_ms + " ms" : "—"} | ${getResultDetails(r).replace(/\n/g, " ")} |`,
      )
      .join("\n");
    navigator.clipboard.writeText(header + rows);
    logger.info(`[复制] Markdown 表格，共 ${visibleResults.length} 条`);
    toast("已复制 Markdown 表格", "success");
  }

  function handleCopyAvailable() {
    const avail = visibleResults.filter((r) => r.available);
    navigator.clipboard.writeText(avail.map((r) => r.model).join("\n"));
    logger.info(
      `[复制] 可用模型列表，共 ${avail.length} 个：${avail.map((r) => r.model).join(", ")}`,
    );
    toast(`已复制 ${avail.length} 个可用模型`, "success");
  }

  function handleLoadHistory(p: Provider) {
    setName(p.name);
    setBaseUrl(p.baseUrl);
    setApiKey(p.apiKey);
    setManualModel("");
    setOrigName(p.name);
    setOrigBaseUrl(p.baseUrl);
    setOrigApiKey(p.apiKey);
    setEditingId(p.id);
    setPhase("idle");
    setResults([]);
    setLiveResults([]);
    setError(null);
    setProgress("");
    setResultTimestamp(null);
    setLastTestMode("none");
    setLastTestSignature(null);
  }

  function friendlyError(e: unknown): string {
    const msg = String(e);
    if (
      msg.includes("401") ||
      msg.includes("Unauthorized") ||
      msg.includes("invalid_api_key")
    )
      return "API Key 无效或已过期，请检查 Key 是否正确";
    if (msg.includes("404") || msg.includes("not found"))
      return "接口路径不存在，请检查 Base URL 是否正确（支持根地址、/v1、/v1/models）";
    if (
      msg.includes("ECONNREFUSED") ||
      msg.includes("Failed to fetch") ||
      msg.includes("connect")
    )
      return "无法连接到服务器，请检查 Base URL 是否可访问";
    if (msg.includes("timeout") || msg.includes("Timeout"))
      return "请求超时，服务器响应过慢，请稍后重试";
    if (msg.includes("CORS") || msg.includes("cors"))
      return "跨域请求被拒绝，该接口可能不支持浏览器直接调用";
    return msg;
  }

  async function handleTest() {
    if (!baseUrl.trim()) return;
    setError(null);
    setResults([]);
    setLiveResults([]);
    setPhase("fetching");
    setProgress("正在获取模型列表...");
    setLastTestMode("all");
    logger.info(`[${name || baseUrl}] 开始检测，baseUrl: ${baseUrl}`);
    let models: string[];
    try {
      models = await listModelsByProvider(baseUrl.trim(), apiKey.trim());
      logger.success(
        `获取模型列表成功，共 ${models.length} 个：${models.join(", ")}`,
      );
    } catch (e) {
      const msg = friendlyError(e);
      logger.error(`获取模型列表失败：${msg}`);
      setError(msg);
      setPhase("idle");
      return;
    }

    // 立即渲染所有行为「检测中」
    const initial: LiveResult[] = models.map((m) => ({
      model: m,
      available: false,
      latency_ms: null,
      error: null,
      status: "pending",
    }));
    setLiveResults(initial);
    setTestCount({ done: 0, total: models.length });
    setPhase("testing");
    setProgress(`正在检测 0 / ${models.length} 个模型...`);
    const concurrency = getConcurrency();
    logger.info(`开始逐条检测 ${models.length} 个模型，并发数: ${concurrency}`);

    const final: LiveResult[] = [...initial];
    let doneCount = 0;
    const queue = models.map((model, idx) => ({ model, idx }));
    async function runNext(): Promise<void> {
      const item = queue.shift();
      if (!item) return;
      const { model, idx } = item;
      logger.debug(`→ 检测中：${model}`);
      try {
        const res = await testSingleModelByProvider(
          baseUrl.trim(),
          apiKey.trim(),
          model,
        );
        final[idx] = { ...res, status: "done" };
        if (res.available) {
          logger.success(
            `✓ ${model}  ${res.latency_ms != null ? res.latency_ms + "ms" : ""}`,
          );
        } else {
          logger.warn(`✗ ${model} 不可用${res.error ? " — " + res.error : ""}`);
        }
      } catch (e) {
        final[idx] = {
          model,
          available: false,
          latency_ms: null,
          error: String(e),
          status: "done",
        };
        logger.error(`✗ ${model} 请求失败：${String(e)}`);
      }
      doneCount++;
      setTestCount({ done: doneCount, total: models.length });
      setProgress(`正在检测 ${doneCount} / ${models.length} 个模型...`);
      setLiveResults([...final]);
      await runNext();
    }
    await Promise.all(Array.from({ length: concurrency }, runNext));

    const sorted = [...final].sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return (a.latency_ms ?? 99999) - (b.latency_ms ?? 99999);
    });
    const available = sorted.filter((r) => r.available).length;
    logger.success(`检测完成：${available}/${sorted.length} 可用`);
    setResults(sorted);
    setResultTimestamp(Date.now());
    setLastTestSignature(buildTestSignature(baseUrl, apiKey));
    setLiveResults([]);
    setPhase("done");
    setProgress("");
    toast(
      available > 0
        ? `检测完成：${available}/${sorted.length} 可用`
        : "检测完成：全部不可用",
      available > 0 ? "success" : "warning",
    );
  }

  function mergeSingleResult(existing: ModelResult[], next: ModelResult) {
    const merged = [...existing];
    const index = merged.findIndex((item) => item.model === next.model);
    if (index >= 0) {
      merged[index] = next;
    } else {
      merged.push(next);
    }
    return merged.sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return (a.latency_ms ?? 99999) - (b.latency_ms ?? 99999);
    });
  }

  async function handleTestSingleModel() {
    if (!baseUrl.trim() || !manualModel.trim()) return;
    const currentSignature = buildTestSignature(baseUrl, apiKey);
    setError(null);
    setLiveResults([
      {
        model: manualModel.trim(),
        available: false,
        latency_ms: null,
        error: null,
        response_text: null,
        status: "pending",
      },
    ]);
    setPhase("testing");
    setProgress("正在测试指定模型...");
    setTestCount({ done: 0, total: 1 });
    setLastTestMode("single");
    logger.info(
      `[${name || baseUrl}] 开始测试指定模型，baseUrl: ${baseUrl}，model: ${manualModel.trim()}`,
    );

    try {
      const result = await testSingleModelByProvider(
        baseUrl.trim(),
        apiKey.trim(),
        manualModel.trim(),
      );
      const nextResults =
        lastTestSignature === currentSignature
          ? mergeSingleResult(results, result)
          : [result];
      setResults(nextResults);
      setResultTimestamp(Date.now());
      setLastTestSignature(currentSignature);
      setLiveResults([]);
      setPhase("done");
      setProgress("");
      setTestCount({ done: 1, total: 1 });
      toast(
        result.available
          ? `模型 ${result.model} 可用`
          : `模型 ${result.model} 不可用`,
        result.available ? "success" : "warning",
      );
    } catch (e) {
      const msg = friendlyError(e);
      logger.error(`指定模型测试失败：${msg}`);
      setError(msg);
      setLiveResults([]);
      setPhase("idle");
      setProgress("");
      setTestCount({ done: 0, total: 0 });
    }
  }

  function handleSaveAsNew() {
    if (!name.trim() || !baseUrl.trim()) return;
    setSaving(true);
    const data = {
      name: name.trim() + " (副本)",
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
    };
    const newId = onAddProvider(data);
    if (visibleResults.length > 0)
      onSaveResult(newId, { timestamp: Date.now(), results: visibleResults });
    logger.info(
      `[另存为] 「${data.name}」已创建，id: ${newId}，含 ${visibleResults.length} 条检测结果`,
    );
    toast("已另存为新接口", "success");
    handleReset();
    setSaving(false);
  }

  function handleSave() {
    if (!name.trim() || !baseUrl.trim()) return;
    setSaving(true);
    const data = {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
    };
    const currentConfigSignature = buildTestSignature(
      data.baseUrl,
      data.apiKey,
    );
    const storedSignature = buildTestSignature(origBaseUrl, origApiKey);
    const hasFreshResultsForCurrentConfig =
      lastTestSignature === currentConfigSignature && visibleResults.length > 0;
    if (editingId) {
      onEditProvider(editingId, data);
      if (hasFreshResultsForCurrentConfig) {
        const existingResults =
          lastTestMode === "single" &&
          currentConfigSignature === storedSignature
            ? (providers.find((provider) => provider.id === editingId)
                ?.lastResult?.results ?? [])
            : [];
        const nextResults =
          lastTestMode === "single"
            ? visibleResults.reduce(mergeSingleResult, existingResults)
            : visibleResults;
        onSaveResult(editingId, {
          timestamp: Date.now(),
          results: nextResults,
        });
      }
      logger.info(
        `[更新] 「${data.name}」已更新，含 ${visibleResults.length} 条当前检测结果`,
      );
      toast("已更新", "success");
    } else {
      const newId = onAddProvider(data);
      if (visibleResults.length > 0) {
        onSaveResult(newId, { timestamp: Date.now(), results: visibleResults });
      }
      logger.info(
        `[保存] 「${data.name}」已保存，id: ${newId}，含 ${visibleResults.length} 条检测结果`,
      );
      toast("已保存", "success");
    }
    handleReset();
    setSaving(false);
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="shrink-0 px-5 pb-4">
        <h2 className="text-base font-semibold tracking-tight text-white">
          模型检测
        </h2>
        <p className="mt-1 text-sm text-gray-400">填写并测试当前 provider。</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {/* 编辑模式提示条 */}
        {editingId && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="text-sm text-amber-200">
              编辑模式：修改配置后建议重新测试再保存，避免数据不一致。
            </span>
          </div>
        )}

        {/* 表单区 */}
        <div className="mb-4 space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-indigo-500/15 bg-indigo-500/5 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-gray-100">
                {editingId ? "正在编辑当前 provider" : "先填写一个 provider"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Base URL 支持根地址、`/v1`、`/v1/models`、`/chat/completions`；系统会自动归一化，本地服务可不填 Key。
              </p>
            </div>
            <button
              onClick={onOpenModels}
              className="flex-shrink-0 rounded-lg border border-gray-700 px-3 py-1 text-xs text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
            >
              前往模型列表
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">名称</label>
              <div className="relative">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如：官方 OpenAI、企业代理、网关服务"
                  className={`${FIELD_INPUT_CLASS} pr-8`}
                />
                {name && (
                  <button
                    onClick={() => setName("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    tabIndex={-1}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-gray-600">
                列表中的 provider 名称。
              </p>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Base URL
              </label>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    onBlur={() => {
                      if (baseUrl.trim() && !baseUrl.trim().startsWith("http"))
                        setUrlError(
                          "请输入完整 URL（以 http:// 或 https:// 开头）",
                        );
                      else setUrlError(null);
                    }}
                    placeholder="例如：https://openrouter.ai/api"
                    className={`${FIELD_INPUT_CLASS} pr-8 ${
                      urlError ? "border-red-500 focus:border-red-500" : ""
                    }`}
                  />
                  {baseUrl && (
                    <button
                      onClick={() => {
                        setBaseUrl("");
                        setUrlError(null);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                      tabIndex={-1}
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
                {baseUrl && <CopyButton text={baseUrl} />}
              </div>
              {urlError && (
                <p className="text-xs text-red-400 mt-1">{urlError}</p>
              )}
              {!urlError && (
                <p className="mt-1 text-[11px] text-gray-600">
                  示例：`https://api.openai.com`、`https://openrouter.ai/api`、`https://your-gateway.example.com/v1/models`；支持根地址、`/v1`、`/v1/models`、`/chat/completions`。
                </p>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">API Key</label>
            <div className="relative flex items-center">
              <input
                type={keyVisible ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className={`${FIELD_INPUT_CLASS} pr-24`}
              />
              <div className="absolute right-2 flex items-center gap-1.5">
                {apiKey && <CopyButton text={apiKey} />}
                {apiKey && (
                  <button
                    onClick={() => setApiKey("")}
                    className="text-gray-500 hover:text-gray-300 transition-colors"
                    tabIndex={-1}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setKeyVisible((v) => !v)}
                  className="text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {keyVisible ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-gray-600">
              模型测试可能走 OpenAI / Claude / Gemini 协议；导出可能包含明文
              Key。
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">
              指定模型名测试
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  value={manualModel}
                  onChange={(e) => setManualModel(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !isLoading &&
                      baseUrl.trim() &&
                      manualModel.trim()
                    ) {
                      handleTestSingleModel();
                    }
                  }}
                  placeholder="如：gpt-4.1-mini / claude-3-7-sonnet / gemini-2.5-flash"
                  className={`${FIELD_INPUT_CLASS} pr-8 font-mono text-xs`}
                />
                {manualModel && (
                  <button
                    onClick={() => setManualModel("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-300"
                    tabIndex={-1}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={handleTestSingleModel}
                disabled={
                  isLoading ||
                  !baseUrl.trim() ||
                  !!urlError ||
                  !manualModel.trim()
                }
                className="rounded-lg border border-gray-700 px-4 py-1.5 text-sm text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:border-gray-800 disabled:text-gray-600"
              >
                测试指定模型
              </button>
            </div>
            <p className="mt-1 text-[11px] text-gray-600">
              不依赖先拉取模型列表；可直接输入模型名做单模型验证。
            </p>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div>
              {editingId ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    编辑模式
                  </span>
                  {(baseUrl.trim() !== origBaseUrl ||
                    apiKey.trim() !== origApiKey) && (
                    <span className="text-xs text-amber-400">
                      URL 或 Key 已修改，建议重新测试后保存
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-gray-600">填写后点击测试</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="text-sm text-gray-400 hover:text-gray-200 px-4 py-1.5 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
              >
                {editingId ? "新建接口" : "重置"}
              </button>
              <button
                ref={testBtnRef}
                onClick={() => {
                  if (testBtnRef.current) {
                    animate(testBtnRef.current, {
                      scale: [1, 0.93, 1],
                      ease: spring({ stiffness: 500, damping: 16 }),
                      duration: 300,
                    });
                  }
                  handleTest();
                }}
                disabled={isLoading || !baseUrl.trim() || !!urlError}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium px-5 py-1.5 rounded-lg transition-colors"
              >
                {isLoading ? "检测中..." : "检测全部模型"}
              </button>
              {(isDone || editingId) && (
                <Tooltip
                  content={
                    !name.trim()
                      ? "请填写名称后再保存"
                      : !baseUrl.trim()
                        ? "请填写 Base URL"
                        : undefined
                  }
                  placement="top"
                  disabled={name.trim() !== "" && baseUrl.trim() !== ""}
                >
                  <button
                    ref={saveBtnRef}
                    onClick={() => {
                      if (saveBtnRef.current) {
                        animate(saveBtnRef.current, {
                          scale: [1, 0.93, 1],
                          ease: spring({ stiffness: 500, damping: 16 }),
                          duration: 300,
                        });
                      }
                      handleSave();
                    }}
                    disabled={!name.trim() || !baseUrl.trim() || saving}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium px-5 py-1.5 rounded-lg transition-colors"
                  >
                    {saving ? "保存中..." : "保存"}
                  </button>
                </Tooltip>
              )}
              {editingId && (
                <Tooltip
                  content={
                    !name.trim()
                      ? "请填写名称"
                      : !baseUrl.trim()
                        ? "请填写 Base URL"
                        : undefined
                  }
                  placement="top"
                  disabled={name.trim() !== "" && baseUrl.trim() !== ""}
                >
                  <button
                    onClick={handleSaveAsNew}
                    disabled={!name.trim() || !baseUrl.trim() || saving}
                    className="text-sm text-gray-400 hover:text-gray-200 px-4 py-1.5 rounded-lg border border-gray-700 hover:border-gray-600 disabled:opacity-40 transition-colors"
                  >
                    {saving ? "保存中..." : "另存为新接口"}
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 border-l-2 border-l-red-500 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* 顶部导出操作栏 */}
        {isDone && visibleResults.length > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-200">
                检测完成：{visibleResults.filter((r) => r.available).length}/
                {visibleResults.length} 可用
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200"
              >
                导出 Markdown
              </button>
              {visibleResults.some((r) => r.available) && (
                <button
                  onClick={handleCopyAvailable}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-emerald-500/50 hover:text-emerald-400"
                >
                  复制可用模型
                </button>
              )}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="mb-4 flex items-center gap-2 text-gray-400 text-sm rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2">
            <Loader2 className="animate-spin h-4 w-4 text-indigo-400 flex-shrink-0" />
            <span className="text-xs text-gray-400">
              {phase === "testing" && testCount.total > 0
                ? `正在检测 ${testCount.done} / ${testCount.total} 个模型...`
                : progress}
            </span>
          </div>
        )}

        {(() => {
          const displayResults: LiveResult[] =
            liveResults.length > 0
              ? liveResults
              : visibleResults.map((r) => ({
                  ...r,
                  status: "done" as RowStatus,
                }));
          const totalCount = displayResults.length;
          const availableCount = displayResults.filter(
            (r) => r.status === "done" && r.available,
          ).length;
          const unavailableCount = displayResults.filter(
            (r) => r.status === "done" && !r.available,
          ).length;
          return displayResults.length > 0 ? (
            <div className="mb-6 overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
              <div className="border-b border-gray-800 px-4 py-2.5">
                <p className="text-sm font-medium text-gray-200">
                  当前 Provider 结果
                </p>
              </div>
              <div className="grid gap-2 border-b border-gray-800 bg-gray-950/40 px-4 py-3 md:grid-cols-4">
                <div className="rounded-lg border border-gray-800 bg-gray-900/70 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-widest text-gray-500">
                    Model 总数
                  </p>
                  <p className="mt-1.5 text-lg font-semibold text-white">
                    {totalCount}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900/70 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-widest text-gray-500">
                    可用模型
                  </p>
                  <p className="mt-1.5 text-lg font-semibold text-emerald-400">
                    {availableCount}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900/70 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-widest text-gray-500">
                    不可用模型
                  </p>
                  <p className="mt-1.5 text-lg font-semibold text-red-400">
                    {unavailableCount}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900/70 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-widest text-gray-500">
                    最近检测
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-gray-200">
                    {visibleResultTimestamp
                      ? new Date(visibleResultTimestamp).toLocaleString(
                          "zh-CN",
                          {
                            hour12: false,
                          },
                        )
                      : "—"}
                  </p>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-5 py-2.5 text-xs text-gray-400">
                      模型
                    </th>
                    <th className="text-left px-5 py-2.5 text-xs text-gray-400">
                      状态
                    </th>
                    <th className="text-left px-5 py-2.5 text-xs text-gray-400">
                      延迟
                    </th>
                    <th className="text-left px-5 py-2.5 text-xs text-gray-400">
                      返回结果
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayResults.map((r, i) => (
                    <tr
                      key={r.model}
                      className={`hover:bg-gray-800/30 transition-colors ${i < displayResults.length - 1 ? "border-b border-gray-800/50" : ""} ${
                        r.status === "pending"
                          ? "border-l-2 border-l-gray-700"
                          : r.available
                            ? "border-l-2 border-l-emerald-500/40"
                            : "border-l-2 border-l-red-500/20"
                      }`}
                    >
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-gray-200 truncate max-w-xs">
                            {r.model}
                          </span>
                          {r.status === "done" && <CopyButton text={r.model} />}
                        </div>
                      </td>
                      <td className="px-5 py-2.5">
                        {r.status === "pending" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-700 text-gray-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-pulse" />
                            检测中
                          </span>
                        ) : (
                          <StatusBadge available={r.available} />
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-gray-300 text-xs">
                        {r.latency_ms != null ? `${r.latency_ms} ms` : "—"}
                      </td>
                      <td className="px-5 py-2.5 text-gray-500 text-xs">
                        {r.status === "pending" ? (
                          ""
                        ) : (
                          <div className="flex items-start gap-1.5">
                            <Tooltip
                              content={getResultDetails(r)}
                              placement="top"
                            >
                              <span className="max-w-[360px] truncate leading-5 text-gray-500 cursor-default">
                                {getResultDetails(r)}
                              </span>
                            </Tooltip>
                            {getResultDetails(r) !== "—" && (
                              <CopyButton
                                text={getResultDetails(r)}
                                message="已复制返回结果"
                              />
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mb-6 rounded-xl border border-dashed border-gray-800 bg-gray-900/60 px-5 py-7 text-center">
              <p className="text-sm font-medium text-gray-300">
                本次接口检测结果会显示在这里
              </p>
              <p className="mt-1.5 text-xs text-gray-500">
                点击“检测全部模型”或“测试指定模型”后显示结果明细。
              </p>
            </div>
          );
        })()}

        {/* 最近使用 */}
        {recentProviders.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-medium uppercase tracking-widest text-gray-500">
                  最近使用接口
                </h3>
                <p className="mt-1 text-[11px] text-gray-600">
                  保留最近 500 条记录，超过 10 条自动分页。
                </p>
              </div>
              <button
                onClick={onOpenModels}
                className="rounded-lg border border-gray-700 px-3 py-1 text-xs text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
              >
                查看全部接口管理
              </button>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-5 py-2.5 text-xs text-gray-400">
                      状态
                    </th>
                    <th className="text-left px-5 py-2.5 text-xs text-gray-400">
                      名称
                    </th>
                    <th className="text-left px-5 py-2.5 text-xs text-gray-400">
                      Base URL
                    </th>
                    <th className="text-left px-5 py-2.5 text-xs text-gray-400">
                      上次检测
                    </th>
                    <th className="text-left px-5 py-2.5 text-xs text-gray-400">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRecentProviders.map((p, i) => {
                    const results = p.lastResult?.results ?? [];
                    const hasTested = results.length > 0;
                    const hasAvailable = results.some((r) => r.available);
                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-gray-800/30 transition-colors cursor-pointer ${i < pagedRecentProviders.length - 1 ? "border-b border-gray-800/50" : ""}`}
                        onClick={() => handleLoadHistory(p)}
                      >
                        <td className="px-5 py-2.5">
                          {!hasTested ? (
                            <Tooltip content="未检测" placement="top">
                              <span className="w-2 h-2 rounded-full bg-gray-600 inline-block cursor-default" />
                            </Tooltip>
                          ) : hasAvailable ? (
                            <Tooltip content="可用" placement="top">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block cursor-default" />
                            </Tooltip>
                          ) : (
                            <Tooltip content="不可用" placement="top">
                              <span className="w-2 h-2 rounded-full bg-red-400 inline-block cursor-default" />
                            </Tooltip>
                          )}
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-200 text-sm font-medium">
                              {p.name}
                            </span>
                            {i === 0 && p.lastResult && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400">
                                最新
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-2.5">
                          <Tooltip content={p.baseUrl} placement="top">
                            <span className="font-mono text-xs text-gray-400 truncate max-w-[200px] block cursor-default">
                              {maskPreviewText(p.baseUrl)}
                            </span>
                          </Tooltip>
                        </td>
                        <td className="px-5 py-2.5 text-xs text-gray-500">
                          {p.lastResult
                            ? new Date(p.lastResult.timestamp).toLocaleString(
                                "zh-CN",
                                {
                                  month: "2-digit",
                                  day: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )
                            : "—"}
                        </td>
                        <td className="px-5 py-2.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(p.id);
                            }}
                            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {recentTotalPages > 1 && (
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  onClick={() => setRecentPage((p) => Math.max(1, p - 1))}
                  disabled={recentPage === 1}
                  className="rounded-lg border border-gray-700 px-3 py-1 text-xs text-gray-300 transition-colors hover:border-gray-600 hover:text-white disabled:opacity-40"
                >
                  上一页
                </button>
                <span className="text-xs text-gray-500">
                  {recentPage} / {recentTotalPages}
                </span>
                <button
                  onClick={() =>
                    setRecentPage((p) => Math.min(recentTotalPages, p + 1))
                  }
                  disabled={recentPage === recentTotalPages}
                  className="rounded-lg border border-gray-700 px-3 py-1 text-xs text-gray-300 transition-colors hover:border-gray-600 hover:text-white disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {(() => {
        const target = providers.find((p) => p.id === deleteConfirmId);
        return target ? (
          <DeleteDialog
            name={target.name}
            onConfirm={() => {
              onDeleteProvider(target.id);
              logger.warn(`[删除] 「${target.name}」已删除`);
              if (editingId === target.id) handleReset();
              setDeleteConfirmId(null);
              toast(`「${target.name}」已删除`, "info");
            }}
            onCancel={() => setDeleteConfirmId(null)}
          />
        ) : null;
      })()}
    </div>
  );
}
