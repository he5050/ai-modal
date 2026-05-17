import { useState, useEffect } from "react";
import type { Provider, ProviderLastResult } from "@/types";
import { HintTooltip } from "@/components/HintTooltip";
import { logger } from "@/lib/devlog";
import { toast } from "@/lib/toast";
import type { ModelTestProtocol } from "@/lib/protocolUtils";
import { buildTestSignature, getResultDetails } from "./utils";
import { DeleteDialog } from "@/components/ui";
import { ModelSelectionDialog } from "./components/ModelSelectionDialog";
import {
  ModelProtocolDialog,
  ProtocolResultDetailDialog,
  RetestScopeDialog,
} from "../ProtocolTestUI";
import { useDetectForm } from "./hooks/useDetectForm";
import { useModelDetection } from "./hooks/useModelDetection";
import { useModelSelectionDialog } from "./hooks/useModelSelectionDialog";
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
  onOpenDetail: (provider: Provider) => void;
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
  onOpenDetail,
}: Props) {
  const [recentPage, setRecentPage] = useState(1);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [detailDialogResult, setDetailDialogResult] =
    useState<import("../../types").ModelResult | null>(null);

  const form = useDetectForm(providers, editTarget, onClearEditTarget, onDirtyChange);
  const detection = useModelDetection();

  const modelSelection = useModelSelectionDialog({
    getBaseUrl: () => form.baseUrl,
    getApiKey: () => form.apiKey,
    getProviderName: () => form.name,
    getInitialSelectedModels: () =>
      form.editingProvider?.lastResult?.results?.map((item) => item.model) ?? [],
    onConfirm: (selectedModels, protocols) => {
      void detection.runModelDetection(
        form.baseUrl,
        form.apiKey,
        form.name,
        selectedModels,
        protocols.length > 0 ? protocols : undefined,
      );
    },
    onManualConfirm: (models, protocols) => {
      void detection.runModelDetection(
        form.baseUrl,
        form.apiKey,
        form.name,
        models,
        protocols.length > 0 ? protocols : undefined,
      );
    },
  });

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

  const isTesting = detection.isTesting;
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

  function handleQuickTest() {
    if (!form.baseUrl.trim()) return;

    if (
      form.editingId &&
      form.editingProvider?.lastResult?.results &&
      form.editingProvider.lastResult.results.length > 0
    ) {
      detection.setRetestScopeDialogOpen(true);
      return;
    }

    modelSelection.openDialog();
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
    toast("已另存为新接口，返回详情页", "success");
    // 切换到新创建的 Provider 并返回详情页
    form.setEditingId(newId);
    const newProvider = providers.find((p) => p.id === newId);
    if (newProvider) {
      onClearEditTarget();
      onOpenDetail(newProvider);
    }
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
      toast("已更新，返回详情页", "success");
      // 返回详情页
      const updatedProvider = providers.find((p) => p.id === form.editingId);
      if (updatedProvider) {
        onClearEditTarget();
        onOpenDetail(updatedProvider);
      }
    } else {
      const newId = onAddProvider(data);
      if (visibleResults.length > 0) {
        onSaveResult(newId, { timestamp: Date.now(), results: visibleResults });
      }
      logger.info(
        `[保存] 「${data.name}」已保存，id: ${newId}，含 ${visibleResults.length} 条检测结果`,
      );
      toast("已保存，返回详情页", "success");
      // 切换到新创建的 Provider 并返回详情页
      form.setEditingId(newId);
      const newProvider = providers.find((p) => p.id === newId);
      if (newProvider) {
        onClearEditTarget();
        onOpenDetail(newProvider);
      }
    }
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
          isLoading={isTesting}
          isDone={isDone}
          onOpenModels={onOpenModels}
          onReset={handleReset}
          onQuickTest={handleQuickTest}
          onCancelDetection={detection.cancelDetection}
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
            modelSelection.openDialog();
          }}
          onAvailableOnly={() => {
            // 获取本地已保存的可用模型
            const results = form.editingProvider?.lastResult?.results;
            const availableModels = results
              ? results.filter((item) => item.available).map((item) => item.model)
              : [];

            detection.setRetestScopeDialogOpen(false);

            // 使用本地模型弹出选择框
            modelSelection.openDialogWithLocalModels(availableModels);
          }}
          onUnavailableOnly={() => {
            // 获取本地已保存的不可用模型
            const results = form.editingProvider?.lastResult?.results;
            const unavailableModels = results
              ? results.filter((item) => !item.available).map((item) => item.model)
              : [];

            detection.setRetestScopeDialogOpen(false);

            // 使用本地模型弹出选择框
            modelSelection.openDialogWithLocalModels(unavailableModels);
          }}
          onCancel={() => detection.setRetestScopeDialogOpen(false)}
        />
      )}

      {modelSelection.dialogState.open && (
        <ModelSelectionDialog
          models={modelSelection.dialogState.fetchedModels}
          initialSelectedModels={modelSelection.initialSelectedModels}
          loading={modelSelection.dialogState.loading}
          fetchError={modelSelection.dialogState.error}
          onConfirm={modelSelection.handleConfirm}
          onManualConfirm={modelSelection.handleManualConfirm}
          onRetry={modelSelection.handleRetry}
          onClose={modelSelection.closeDialog}
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
