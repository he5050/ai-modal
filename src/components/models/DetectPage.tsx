import { useState, useEffect, useRef } from "react";
import { openExternalUrl } from "../../lib/openExternalUrl";
import type { Provider, ProviderLastResult } from "../../types";
import { CopyButton } from "../CopyButton";
import { HintTooltip } from "../HintTooltip";
import { Tooltip } from "../Tooltip";
import { logger } from "../../lib/devlog";
import {
  FIELD_INPUT_CLASS,
} from "../../lib/formStyles";
import {
  BUTTON_ICON_DANGER_SM_CLASS,
  BUTTON_ICON_GHOST_MD_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_PRIMARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../../lib/buttonStyles";
import { toast } from "../../lib/toast";
import { animate, spring } from "animejs";
import {
  ArrowRight,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  Save,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  ModelProtocolDialog,
  ProtocolResultDetailDialog,
  RetestScopeDialog,
  TestedProtocolBadges,
  getModelProtocolLabel,
  getProtocolResultDetails,
} from "../ProtocolTestUI";
import type { ModelTestProtocol } from "../../lib/protocolUtils";
import { RECENT_PAGE_SIZE } from "./constants";
import type { LiveResult } from "./types";
import {
  getResultDetails,
  maskPreviewText,
  buildTestSignature,
  friendlyError,
} from "./utils";
import { DeleteDialog, StatusBadge } from "./components/SharedDialogs";
import { ModelSelectionDialog } from "./components/ModelSelectionDialog";
import { useDetectForm } from "./hooks/useDetectForm";
import { useModelDetection } from "./hooks/useModelDetection";
import { listModels } from "../../api";

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
  const testBtnRef = useRef<HTMLButtonElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const [recentPage, setRecentPage] = useState(1);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [detailDialogResult, setDetailDialogResult] =
    useState<import("../../types").ModelResult | null>(null);

  // ─── 一键测试：模型选择弹窗状态 ────────────────────────────────
  const [modelSelectionOpen, setModelSelectionOpen] = useState(false);
  const [modelSelectionLoading, setModelSelectionLoading] = useState(false);
  const [modelSelectionError, setModelSelectionError] = useState<string | null>(null);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);

  const form = useDetectForm(providers, editTarget, onClearEditTarget, onDirtyChange);
  const detection = useModelDetection();

  // editTarget 回填检测状态
  useEffect(() => {
    if (!editTarget) return;
    detection.setResults(editTarget.lastResult?.results ?? []);
    detection.setLiveResults([]);
    detection.setError(null);
    detection.setProgress("");
    detection.setResultTimestamp(editTarget.lastResult?.timestamp ?? null);
    detection.setTestCount({ done: 0, total: 0 });
    detection.setLastTestMode(
      editTarget.lastResult?.results?.length ? "all" : "none",
    );
    detection.setLastTestSignature(
      editTarget.lastResult?.results?.length
        ? buildTestSignature(editTarget.baseUrl, editTarget.apiKey)
        : null,
    );
  }, [editTarget?.id]);

  const isLoading = detection.phase === "fetching" || detection.phase === "testing";
  const isDone = detection.phase === "done";
  const currentFormSignature = buildTestSignature(form.baseUrl, form.apiKey);
  const hasCurrentResults = detection.lastTestSignature === currentFormSignature;
  const visibleResults = hasCurrentResults ? detection.results : [];
  const visibleResultTimestamp = hasCurrentResults
    ? detection.resultTimestamp
    : null;

  const recentProviders = [...providers].sort(
    (a, b) =>
      (b.lastResult?.timestamp ?? b.createdAt) -
      (a.lastResult?.timestamp ?? a.createdAt),
  );
  const recentTotalPages = Math.max(
    1,
    Math.ceil(recentProviders.length / RECENT_PAGE_SIZE),
  );
  const pagedRecentProviders = recentProviders.slice(
    (recentPage - 1) * RECENT_PAGE_SIZE,
    recentPage * RECENT_PAGE_SIZE,
  );

  useEffect(() => {
    setRecentPage((page) => Math.min(page, recentTotalPages));
  }, [recentTotalPages]);

  function handleReset() {
    form.handleReset();
    detection.resetDetectionState();
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

  // ─── 一键测试流程 ────────────────────────────────────────────

  async function handleQuickTest() {
    if (!form.baseUrl.trim()) return;

    // 编辑模式下已有结果 → 弹 retest scope dialog
    if (
      form.editingId &&
      form.editingProvider?.lastResult?.results &&
      form.editingProvider.lastResult.results.length > 0
    ) {
      detection.setRetestScopeDialogOpen(true);
      return;
    }

    await fetchModelsAndShowDialog();
  }

  async function fetchModelsAndShowDialog() {
    setModelSelectionOpen(true);
    setModelSelectionLoading(true);
    setModelSelectionError(null);
    setFetchedModels([]);

    try {
      const models = await listModels(form.baseUrl.trim(), form.apiKey.trim());
      const sorted = [...models].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase()),
      );
      setFetchedModels(sorted);
      setModelSelectionLoading(false);
      logger.success(`[一键测试] v1/models 获取到 ${sorted.length} 个模型`);
    } catch (e) {
      const msg = friendlyError(e);
      logger.error(`[一键测试] v1/models 获取失败：${msg}`);
      setModelSelectionError(msg);
      setModelSelectionLoading(false);
    }
  }

  /** 用户选完模型和协议后，开始测试 */
  function handleModelSelectionConfirm(selectedModels: string[], protocols: ModelTestProtocol[]) {
    setModelSelectionOpen(false);
    setFetchedModels([]);
    setModelSelectionError(null);
    void detection.runModelDetection(
      form.baseUrl,
      form.apiKey,
      form.name,
      selectedModels,
      protocols.length > 0 ? protocols : undefined,
    );
  }

  /** 用户手动输入模型和选完协议后，开始测试 */
  function handleManualModelConfirm(models: string[], protocols: ModelTestProtocol[]) {
    setModelSelectionOpen(false);
    setFetchedModels([]);
    setModelSelectionError(null);
    void detection.runModelDetection(
      form.baseUrl,
      form.apiKey,
      form.name,
      models,
      protocols.length > 0 ? protocols : undefined,
    );
  }

  function handleSaveAsNew() {
    if (!form.name.trim() || !form.baseUrl.trim()) return;
    form.setSaving(true);
    const data = {
      name: form.name.trim() + " (副本)",
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey.trim(),
    };
    const newId = onAddProvider(data);
    if (visibleResults.length > 0)
      onSaveResult(newId, { timestamp: Date.now(), results: visibleResults });
    logger.info(
      `[另存为] 「${data.name}」已创建，id: ${newId}，含 ${visibleResults.length} 条检测结果`,
    );
    toast("已另存为新接口", "success");
    handleReset();
    form.setSaving(false);
  }

  function handleSave() {
    if (!form.name.trim() || !form.baseUrl.trim()) return;
    form.setSaving(true);
    const data = {
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey.trim(),
    };
    const currentConfigSignature = buildTestSignature(data.baseUrl, data.apiKey);
    const storedSignature = buildTestSignature(form.origBaseUrl, form.origApiKey);
    const hasFreshResultsForCurrentConfig =
      detection.lastTestSignature === currentConfigSignature &&
      visibleResults.length > 0;
    if (form.editingId) {
      onEditProvider(form.editingId, data);
      if (hasFreshResultsForCurrentConfig) {
        const existingResults =
          detection.lastTestMode === "single" &&
          currentConfigSignature === storedSignature
            ? (providers.find((provider) => provider.id === form.editingId)
                ?.lastResult?.results ?? [])
            : [];
        const nextResults =
          detection.lastTestMode === "single"
            ? visibleResults.reduce(
                (acc: import("../../types").ModelResult[], r) =>
                  acc.find((item) => item.model === r.model)
                    ? acc
                    : [...acc, r],
                existingResults,
              )
            : visibleResults;
        onSaveResult(form.editingId, {
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
    form.setSaving(false);
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="shrink-0 px-6 pb-6">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight text-white">
            模型检测
          </h2>
          <HintTooltip content="填写并测试当前 provider。" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {form.editingId && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="text-sm text-amber-200">
              编辑模式：修改配置后建议重新测试再保存，避免数据不一致。
            </span>
          </div>
        )}

        <div className="mb-4 space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-indigo-500/15 bg-indigo-500/5 px-3 py-2.5">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-gray-100">
                  {form.editingId ? "正在编辑当前 provider" : "先填写一个 provider"}
                </p>
                <HintTooltip content="Base URL 支持根地址、/v1、/v1/models、/chat/completions；系统会自动归一化，本地服务可不填 Key。" />
              </div>
            </div>
            <button
              onClick={onOpenModels}
              className={`flex-shrink-0 ${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              <ArrowRight className="h-3.5 w-3.5" />
              前往模型列表
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <label className="block text-xs text-gray-400">名称</label>
                <HintTooltip content="列表中的 provider 名称。" />
              </div>
              <div className="relative">
                <input
                  value={form.name}
                  onChange={(e) => form.setName(e.target.value)}
                  placeholder="如：官方 OpenAI、企业代理、网关服务"
                  className={`${FIELD_INPUT_CLASS} pr-8`}
                />
                {form.name && (
                  <button
                    onClick={() => form.setName("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    tabIndex={-1}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <label className="block text-xs text-gray-400">Base URL</label>
                <HintTooltip content="示例：https://api.openai.com、https://openrouter.ai/api、https://your-gateway.example.com/v1/models；支持根地址、/v1、/v1/models、/chat/completions。" />
              </div>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <input
                    value={form.baseUrl}
                    onChange={(e) => form.setBaseUrl(e.target.value)}
                    onBlur={() => {
                      if (form.baseUrl.trim() && !form.baseUrl.trim().startsWith("http"))
                        form.setUrlError("请输入完整 URL（以 http:// 或 https:// 开头）");
                      else form.setUrlError(null);
                    }}
                    placeholder="例如：https://openrouter.ai/api"
                    className={`${FIELD_INPUT_CLASS} pr-8 ${
                      form.urlError ? "border-red-500 focus:border-red-500" : ""
                    }`}
                  />
                  {form.baseUrl && (
                    <button
                      onClick={() => {
                        form.setBaseUrl("");
                        form.setUrlError(null);
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
                {form.baseUrl && <CopyButton text={form.baseUrl} />}
                {form.baseUrl && (
                  <button
                    onClick={() => void openExternalUrl(form.baseUrl)}
                    className={BUTTON_ICON_GHOST_MD_CLASS}
                    title="浏览器打开 Base URL"
                    aria-label="浏览器打开 Base URL"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                )}
              </div>
              {form.urlError && (
                <p className="text-xs text-red-400 mt-1">{form.urlError}</p>
              )}
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <label className="block text-xs text-gray-400">API Key</label>
              <HintTooltip content="模型测试可能走 OpenAI / Claude / Gemini 协议；导出可能包含明文 Key。" />
            </div>
            <div className="relative flex items-center">
              <input
                type={form.keyVisible ? "text" : "password"}
                value={form.apiKey}
                onChange={(e) => form.setApiKey(e.target.value)}
                placeholder="sk-..."
                className={`${FIELD_INPUT_CLASS} pr-24`}
              />
              <div className="absolute right-2 flex items-center gap-1.5">
                {form.apiKey && <CopyButton text={form.apiKey} />}
                {form.apiKey && (
                  <button
                    onClick={() => form.setApiKey("")}
                    className="text-gray-500 hover:text-gray-300 transition-colors"
                    tabIndex={-1}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => form.setKeyVisible((v) => !v)}
                  className="text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {form.keyVisible ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ─── 操作按钮 ────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-1">
            <div>
              {form.editingId ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    编辑模式
                  </span>
                  {(form.baseUrl.trim() !== form.origBaseUrl ||
                    form.apiKey.trim() !== form.origApiKey) && (
                    <span className="text-xs text-amber-400">
                      URL 或 Key 已修改，建议重新测试后保存
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-gray-600">填写后点击一键测试</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {form.editingId ? "新建接口" : "重置"}
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
                  handleQuickTest();
                }}
                disabled={isLoading || !form.baseUrl.trim() || !!form.urlError}
                className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              >
                <Zap className="h-3.5 w-3.5" />
                {isLoading ? "检测中..." : "一键测试"}
              </button>
              {(isDone || form.editingId) && (
                <Tooltip
                  content={
                    !form.name.trim()
                      ? "请填写名称后再保存"
                      : !form.baseUrl.trim()
                        ? "请填写 Base URL"
                        : undefined
                  }
                  placement="top"
                  disabled={form.name.trim() !== "" && form.baseUrl.trim() !== ""}
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
                    disabled={!form.name.trim() || !form.baseUrl.trim() || form.saving}
                    className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {form.saving ? "保存中..." : "保存"}
                  </button>
                </Tooltip>
              )}
              {form.editingId && (
                <Tooltip
                  content={
                    !form.name.trim()
                      ? "请填写名称"
                      : !form.baseUrl.trim()
                        ? "请填写 Base URL"
                        : undefined
                  }
                  placement="top"
                  disabled={form.name.trim() !== "" && form.baseUrl.trim() !== ""}
                >
                  <button
                    onClick={handleSaveAsNew}
                    disabled={!form.name.trim() || !form.baseUrl.trim() || form.saving}
                    className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {form.saving ? "保存中..." : "另存为新接口"}
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        {detection.error && (
          <div className="mb-4 rounded-xl border border-red-500/30 border-l-2 border-l-red-500 bg-red-500/10 p-3 text-sm text-red-400">
            {detection.error}
          </div>
        )}

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
                className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              >
                导出 Markdown
              </button>
              {visibleResults.some((r) => r.available) && (
                <button
                  onClick={handleCopyAvailable}
                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
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
              {detection.phase === "testing" && detection.testCount.total > 0
                ? `正在检测 ${detection.testCount.done} / ${detection.testCount.total} 个模型...`
                : detection.progress}
            </span>
          </div>
        )}

        {(() => {
          const displayResults: LiveResult[] =
            detection.liveResults.length > 0
              ? detection.liveResults
              : visibleResults.map((r) => ({
                  ...r,
                  status:
                    detection.singleTestingModel === r.model
                      ? ("pending" as import("./types").RowStatus)
                      : ("done" as import("./types").RowStatus),
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
                  <p className="text-xs uppercase tracking-widest text-gray-500">Model 总数</p>
                  <p className="mt-1.5 text-lg font-semibold text-white">{totalCount}</p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900/70 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-widest text-gray-500">可用模型</p>
                  <p className="mt-1.5 text-lg font-semibold text-emerald-400">{availableCount}</p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900/70 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-widest text-gray-500">不可用模型</p>
                  <p className="mt-1.5 text-lg font-semibold text-red-400">{unavailableCount}</p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900/70 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-widest text-gray-500">最近检测</p>
                  <p className="mt-1.5 text-sm font-medium text-gray-200">
                    {visibleResultTimestamp
                      ? new Date(visibleResultTimestamp).toLocaleString("zh-CN", { hour12: false })
                      : "—"}
                  </p>
                </div>
              </div>
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="w-[24%] px-4 py-2.5 text-left text-xs text-gray-400">模型</th>
                    <th className="w-[112px] px-4 py-2.5 text-left text-xs text-gray-400">状态</th>
                    <th className="w-[108px] px-4 py-2.5 text-left text-xs text-gray-400">延迟</th>
                    <th className="px-4 py-2.5 text-left text-xs text-gray-400">返回结果</th>
                    <th className="w-[92px] px-4 py-2.5 text-center text-xs text-gray-400">测试</th>
                  </tr>
                </thead>
                <tbody>
                  {displayResults.map((r, i) => (
                    <tr
                      key={`${r.model}-${i}`}
                      className={`hover:bg-gray-800/30 transition-colors ${i < displayResults.length - 1 ? "border-b border-gray-800/50" : ""} ${
                        r.status === "pending"
                          ? "border-l-2 border-l-gray-700"
                          : r.available
                            ? "border-l-2 border-l-emerald-500/40"
                            : "border-l-2 border-l-red-500/20"
                      }`}
                    >
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-gray-200 truncate max-w-[160px]">{r.model}</span>
                          {r.status === "done" && <CopyButton text={r.model} />}
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        {r.status === "pending" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-700 text-gray-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-pulse" />
                            检测中
                          </span>
                        ) : (
                          <StatusBadge available={r.available} />
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-300 align-middle">
                        {r.latency_ms != null ? `${r.latency_ms} ms` : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {r.status === "pending" ? (
                          ""
                        ) : (
                          <div className="space-y-2">
                            <TestedProtocolBadges result={r} />
                            {(r.protocol_results ?? []).filter((pr) => pr.available).length > 0 ? (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setDetailDialogResult(r)}
                                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                                >
                                  查看详情
                                </button>
                                <CopyButton
                                  text={(r.protocol_results ?? [])
                                    .filter((item) => item.available)
                                    .map((item) => `${getModelProtocolLabel(item.protocol)}: ${getProtocolResultDetails(item)}`)
                                    .join("\n\n")}
                                  message="已复制协议返回结果"
                                />
                              </div>
                            ) : (
                              <div className="flex items-start gap-1.5">
                                <Tooltip content={getResultDetails(r)} placement="top">
                                  <span className="max-w-[320px] truncate leading-5 text-gray-500 cursor-default">
                                    {getResultDetails(r)}
                                  </span>
                                </Tooltip>
                                {getResultDetails(r) !== "—" && (
                                  <CopyButton text={getResultDetails(r)} message="已复制返回结果" />
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex justify-center">
                          <button
                            onClick={() => detection.handleOpenProtocolDialog(r)}
                            disabled={isLoading || !!detection.singleTestingModel}
                            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                          >
                            测试
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mb-6 rounded-xl border border-dashed border-gray-800 bg-gray-900/60 px-6 py-12 text-center">
              <p className="text-sm font-medium text-gray-300">
                点击「一键测试」选择模型和协议后，检测结果会显示在这里
              </p>
              <p className="mt-1.5 text-xs text-gray-500">
                系统会从 v1/models 获取模型列表，你可以选择要测试的模型和协议。
              </p>
            </div>
          );
        })()}

        {recentProviders.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-medium uppercase tracking-widest text-gray-500">
                  最近使用接口
                </h3>
                <HintTooltip content="展示全部记录，按最近时间倒序；本地分页为每页 20 条。" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">共 {recentProviders.length} 条</span>
                <button
                  onClick={onOpenModels}
                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  查看全部接口管理
                </button>
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="w-12 px-4 py-2.5 text-left text-xs text-gray-400">#</th>
                    <th className="w-[76px] px-4 py-2.5 text-left text-xs text-gray-400">状态</th>
                    <th className="w-[24%] px-4 py-2.5 text-left text-xs text-gray-400">名称</th>
                    <th className="w-[28%] px-4 py-2.5 text-left text-xs text-gray-400">Base URL</th>
                    <th className="w-[140px] px-4 py-2.5 text-left text-xs text-gray-400">上次检测</th>
                    <th className="w-[72px] px-4 py-2.5 text-center text-xs text-gray-400">操作</th>
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
                        onClick={() => form.handleLoadHistory(p)}
                      >
                        <td className="px-4 py-2 text-xs text-gray-500">
                          {(recentPage - 1) * RECENT_PAGE_SIZE + i + 1}
                        </td>
                        <td className="px-4 py-2">
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
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-200 text-sm font-medium">{p.name}</span>
                            {i === 0 && p.lastResult && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400">最新</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <Tooltip content={p.baseUrl} placement="top">
                            <span className="font-mono text-xs text-gray-400 truncate max-w-[200px] block cursor-default">
                              {maskPreviewText(p.baseUrl)}
                            </span>
                          </Tooltip>
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">
                          {p.lastResult
                            ? new Date(p.lastResult.timestamp).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
                            : "—"}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-center">
                            <Tooltip content="删除接口" placement="top">
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(p.id); }}
                                className={BUTTON_ICON_DANGER_SM_CLASS}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {recentProviders.length > RECENT_PAGE_SIZE && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">
                  第 {recentPage} / {recentTotalPages} 页，每页 {RECENT_PAGE_SIZE} 条
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setRecentPage(1)} disabled={recentPage === 1} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>首页</button>
                  <button onClick={() => setRecentPage((p) => Math.max(1, p - 1))} disabled={recentPage === 1} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>上一页</button>
                  <span className="text-xs text-gray-500">{recentPage} / {recentTotalPages}</span>
                  <button onClick={() => setRecentPage((p) => Math.min(recentTotalPages, p + 1))} disabled={recentPage === recentTotalPages} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>下一页</button>
                  <button onClick={() => setRecentPage(recentTotalPages)} disabled={recentPage === recentTotalPages} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>末页</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── 弹窗集合 ────────────────────────────────────────────── */}

      {(() => {
        const target = providers.find((p) => p.id === deleteConfirmId);
        return target ? (
          <DeleteDialog
            name={target.name}
            onConfirm={() => {
              onDeleteProvider(target.id);
              if (form.editingId === target.id) handleReset();
              setDeleteConfirmId(null);
              toast(`「${target.name}」已删除`, "info");
            }}
            onCancel={() => setDeleteConfirmId(null)}
          />
        ) : null;
      })()}

      {detection.retestScopeDialogOpen && form.editingProvider?.lastResult?.results && (
        <RetestScopeDialog
          totalCount={form.editingProvider.lastResult.results.length}
          availableCount={form.editingProvider.lastResult.results.filter((item) => item.available).length}
          unavailableCount={form.editingProvider.lastResult.results.filter((item) => !item.available).length}
          onAll={() => {
            detection.setRetestScopeDialogOpen(false);
            void fetchModelsAndShowDialog();
          }}
          onAvailableOnly={() => {
            const models = form.editingProvider!.lastResult!.results.filter((item) => item.available).map((item) => item.model);
            detection.setRetestScopeDialogOpen(false);
            void detection.runModelDetection(form.baseUrl, form.apiKey, form.name, models);
          }}
          onUnavailableOnly={() => {
            const models = form.editingProvider!.lastResult!.results.filter((item) => !item.available).map((item) => item.model);
            detection.setRetestScopeDialogOpen(false);
            void detection.runModelDetection(form.baseUrl, form.apiKey, form.name, models);
          }}
          onCancel={() => detection.setRetestScopeDialogOpen(false)}
        />
      )}

      {modelSelectionOpen && (
        <ModelSelectionDialog
          models={fetchedModels}
          initialSelectedModels={form.editingProvider?.lastResult?.results?.map((item) => item.model) ?? []}
          loading={modelSelectionLoading}
          fetchError={modelSelectionError}
          onConfirm={handleModelSelectionConfirm}
          onManualConfirm={handleManualModelConfirm}
          onRetry={fetchModelsAndShowDialog}
          onClose={() => {
            setModelSelectionOpen(false);
            setFetchedModels([]);
            setModelSelectionError(null);
          }}
        />
      )}

      {detection.protocolDialogModel && (
        <ModelProtocolDialog
          model={detection.protocolDialogModel}
          selectedProtocols={detection.selectedProtocols}
          testing={!!detection.singleTestingModel}
          onToggle={detection.toggleProtocolSelection}
          onConfirm={() =>
            void detection.handleProtocolTestConfirm(
              form.baseUrl,
              form.apiKey,
              form.name,
              detection.results,
              detection.lastTestSignature,
            )
          }
          onClose={() => detection.setProtocolDialogModel(null)}
        />
      )}
      {detailDialogResult && (
        <ProtocolResultDetailDialog
          model={detailDialogResult.model}
          results={(detailDialogResult.protocol_results ?? []).filter((pr) => pr.available)}
          onClose={() => setDetailDialogResult(null)}
        />
      )}
    </div>
  );
}
