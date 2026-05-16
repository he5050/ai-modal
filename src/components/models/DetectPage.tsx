import { useState, useEffect } from "react";
import type { Provider, ProviderLastResult } from "../../types";
import { HintTooltip } from "../HintTooltip";
import { logger } from "../../lib/devlog";
import { toast } from "../../lib/toast";
import type { ModelTestProtocol } from "../../lib/protocolUtils";
import { buildTestSignature, friendlyError } from "./utils";
import { DeleteDialog } from "./components/SharedDialogs";
import { ModelSelectionDialog } from "./components/ModelSelectionDialog";
import {
  ModelProtocolDialog,
  ProtocolResultDetailDialog,
  RetestScopeDialog,
} from "../ProtocolTestUI";
import { useDetectForm } from "./hooks/useDetectForm";
import { useModelDetection } from "./hooks/useModelDetection";
import { listModels } from "../../api";
import { RECENT_PAGE_SIZE } from "./constants";
import { DetectForm } from "./components/DetectForm";
import { DetectResults } from "./components/DetectResults";
import { RecentTests } from "./components/RecentTests";

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
          `| ${r.model} | ${r.available ? "✅ 可用" : "❌ 不可用"} | ${r.latency_ms != null ? r.latency_ms + " ms" : "—"} | ${require("./utils").getResultDetails(r).replace(/\n/g, " ")} |`,
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

        <DetectForm
          form={form}
          isLoading={isLoading}
          isDone={isDone}
          onOpenModels={onOpenModels}
          onReset={handleReset}
          onQuickTest={handleQuickTest}
          onSave={handleSave}
          onSaveAsNew={handleSaveAsNew}
        />

        <DetectResults
          detection={detection}
          visibleResults={visibleResults}
          visibleResultTimestamp={visibleResultTimestamp}
          onExport={handleExport}
          onCopyAvailable={handleCopyAvailable}
          onSetDetailDialogResult={setDetailDialogResult}
        />

        <RecentTests
          providers={providers}
          recentPage={recentPage}
          recentTotalPages={recentTotalPages}
          form={form}
          onOpenModels={onOpenModels}
          onPageChange={setRecentPage}
          onDeleteClick={setDeleteConfirmId}
          onLoadHistory={(p) => form.handleLoadHistory(p)}
        />
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
