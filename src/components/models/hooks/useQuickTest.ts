import { useCallback, useRef, useState } from "react";
import { listModelsByProvider, testSingleModelByProvider } from "@/api";
import { logger } from "@/lib/devlog";
import { toast } from "@/lib/toast";
import { friendlyError, summarizeFailedResultDetails } from "../utils";
import type { Provider, ProviderLastResult } from "@/types";
import type { ModelTestProtocol } from "@/lib/protocolUtils";

/**
 * 一键测试 hook — 模型列表详情页用。
 *
 * 流程与模型检测页一致：
 * 1. 遍历每个 provider，先调 /v1/models 获取模型列表
 * 2. 弹 ModelSelectionDialog，默认勾选该 provider 已保存的模型
 * 3. 用户选协议后确认 → 逐个测试
 * 4. 自动进入下一个 provider
 */
export function useQuickTest(onSaveResult: (id: string, result: ProviderLastResult) => void) {
  const [quickTestActive, setQuickTestActive] = useState(false);
  const [quickTestProgress, setQuickTestProgress] = useState("");
  const cancelRef = useRef(false);

  // ModelSelectionDialog 状态
  const [modelSelectionOpen, setModelSelectionOpen] = useState(false);
  const [modelSelectionLoading, setModelSelectionLoading] = useState(false);
  const [modelSelectionError, setModelSelectionError] = useState<string | null>(null);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [currentTestProvider, setCurrentTestProvider] = useState<Provider | null>(null);
  const queueRef = useRef<Provider[]>([]);

  // ─── 启动一键测试 ───────────────────────────────────────────────
  const handleQuickTest = useCallback((providers: Provider[]) => {
    if (quickTestActive || providers.length === 0) return;
    cancelRef.current = false;
    setQuickTestActive(true);
    queueRef.current = [...providers];
    void startProviderTest(providers[0]);
  }, [quickTestActive]);

  // ─── 获取单个 provider 的模型列表 ──────────────────────────────
  async function startProviderTest(provider: Provider) {
    if (cancelRef.current) { finishQuickTest(true); return; }

    setCurrentTestProvider(provider);
    setModelSelectionOpen(true);
    setModelSelectionLoading(true);
    setModelSelectionError(null);
    setFetchedModels([]);

    try {
      const models = await listModelsByProvider(provider.baseUrl, provider.apiKey);
      const sorted = [...models].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase()),
      );
      setFetchedModels(sorted);
      setModelSelectionLoading(false);
      logger.success(`[一键测试] ${provider.name} v1/models 获取到 ${sorted.length} 个模型`);
    } catch (e) {
      const msg = friendlyError(e);
      logger.error(`[一键测试] ${provider.name} v1/models 获取失败：${msg}`);
      setModelSelectionError(msg);
      setModelSelectionLoading(false);
    }
  }

  // ─── 用户选完模型和协议，开始测试 ──────────────────────────────
  const handleModelSelectionConfirm = useCallback(async (
    selectedModels: string[],
    protocols: ModelTestProtocol[],
  ) => {
    if (!currentTestProvider) return;
    const provider = currentTestProvider;
    const protocolsArg = protocols.length > 0 ? protocols : undefined;

    setModelSelectionOpen(false);
    setFetchedModels([]);
    setModelSelectionError(null);

    setQuickTestProgress(`正在检测 ${provider.name}：${selectedModels.length} 个模型...`);
    try {
      const results = [];
      for (const model of selectedModels) {
        if (cancelRef.current) break;
        setQuickTestProgress(`正在检测 ${provider.name}：${model}（${results.length + 1}/${selectedModels.length}）`);
        const result = await testSingleModelByProvider(provider.baseUrl, provider.apiKey, model, protocolsArg);
        results.push(result);
      }
      const avail = results.filter((r) => r.available).length;
      const detail = summarizeFailedResultDetails(results);
      logger.success(`[一键测试] ${provider.name} 完成：${avail}/${results.length} 可用`);
      if (avail === 0 && detail) {
        logger.warn(`[一键测试] ${provider.name} 错误详情：${detail}`);
      }
      onSaveResult(provider.id, { timestamp: Date.now(), results });
      toast(`${provider.name} 测试完成：${avail}/${results.length} 可用`, avail > 0 ? "success" : "warning");
    } catch (e) {
      logger.error(`[一键测试] ${provider.name} 测试失败：${String(e)}`);
      toast(`${provider.name} 测试失败`, "error");
    }

    await processNextProvider();
  }, [currentTestProvider, onSaveResult]);

  // ─── 手动输入模型确认 ───────────────────────────────────────────
  const handleManualModelConfirm = useCallback(async (
    models: string[],
    protocols: ModelTestProtocol[],
  ) => {
    if (!currentTestProvider) return;
    const provider = currentTestProvider;
    const protocolsArg = protocols.length > 0 ? protocols : undefined;

    setModelSelectionOpen(false);
    setFetchedModels([]);
    setModelSelectionError(null);

    setQuickTestProgress(`正在检测 ${provider.name}：${models.length} 个手动输入模型...`);
    try {
      const results = [];
      for (const model of models) {
        if (cancelRef.current) break;
        const result = await testSingleModelByProvider(provider.baseUrl, provider.apiKey, model, protocolsArg);
        results.push(result);
      }
      const avail = results.filter((r) => r.available).length;
      onSaveResult(provider.id, { timestamp: Date.now(), results });
      toast(`${provider.name} 测试完成：${avail}/${results.length} 可用`, avail > 0 ? "success" : "warning");
    } catch (e) {
      logger.error(`[一键测试] ${provider.name} 测试失败：${String(e)}`);
      toast(`${provider.name} 测试失败`, "error");
    }

    await processNextProvider();
  }, [currentTestProvider, onSaveResult]);

  // ─── 处理队列中下一个 provider ──────────────────────────────────
  async function processNextProvider() {
    if (cancelRef.current) { finishQuickTest(true); return; }

    queueRef.current = queueRef.current.slice(1);
    const remaining = queueRef.current;

    if (remaining.length === 0) {
      finishQuickTest(false);
      return;
    }

    const next = remaining[0];
    setQuickTestProgress(`准备检测下一个：${next.name}`);
    await startProviderTest(next);
  }

  // ─── 重试获取模型列表 ───────────────────────────────────────────
  function handleRetryFetch() {
    if (!currentTestProvider) return;
    setModelSelectionLoading(true);
    setModelSelectionError(null);
    setFetchedModels([]);
    listModelsByProvider(currentTestProvider.baseUrl, currentTestProvider.apiKey)
      .then((models) => {
        const sorted = [...models].sort((a, b) =>
          a.toLowerCase().localeCompare(b.toLowerCase()),
        );
        setFetchedModels(sorted);
        setModelSelectionLoading(false);
      })
      .catch((e) => {
        setModelSelectionError(friendlyError(e));
        setModelSelectionLoading(false);
      });
  }

  // ─── 跳过当前 provider / 关闭弹窗 ──────────────────────────────
  function handleSkipProvider() {
    setModelSelectionOpen(false);
    setFetchedModels([]);
    setModelSelectionError(null);
    if (quickTestActive) {
      processNextProvider();
    }
  }

  // ─── 取消整个一键测试 ───────────────────────────────────────────
  function handleCancelQuickTest() {
    cancelRef.current = true;
    setModelSelectionOpen(false);
    setFetchedModels([]);
    setModelSelectionError(null);
    finishQuickTest(true);
  }

  function finishQuickTest(stopped: boolean) {
    setQuickTestActive(false);
    setQuickTestProgress("");
    setCurrentTestProvider(null);
    queueRef.current = [];
    if (stopped) {
      toast("一键测试已停止", "warning");
    } else {
      toast("一键测试全部完成", "success");
    }
  }

  return {
    quickTestActive,
    quickTestProgress,
    modelSelectionOpen,
    modelSelectionLoading,
    modelSelectionError,
    fetchedModels,
    currentTestProvider,
    handleQuickTest,
    handleModelSelectionConfirm,
    handleManualModelConfirm,
    handleCancelQuickTest,
    handleRetryFetch,
    handleSkipProvider,
  };
}
