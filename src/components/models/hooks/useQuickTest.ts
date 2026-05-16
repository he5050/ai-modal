import { useCallback, useState } from "react";
import { listModelsByProvider, testSingleModelByProvider } from "@/api";
import { logger } from "@/lib/devlog";
import { toast } from "@/lib/toast";
import { friendlyError, summarizeFailedResultDetails } from "../utils";
import type { Provider, ProviderLastResult } from "@/types";
import type { ModelTestProtocol } from "@/lib/protocolUtils";

export function useQuickTest(onSaveResult: (id: string, result: ProviderLastResult) => void) {
  const [quickTestActive, setQuickTestActive] = useState(false);
  const [quickTestProgress, setQuickTestProgress] = useState("");
  const [quickTestCancel, setQuickTestCancel] = useState(false);

  const [modelSelectionOpen, setModelSelectionOpen] = useState(false);
  const [modelSelectionLoading, setModelSelectionLoading] = useState(false);
  const [modelSelectionError, setModelSelectionError] = useState<string | null>(null);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [currentTestProvider, setCurrentTestProvider] = useState<Provider | null>(null);
  const [testQueue, setTestQueue] = useState<Provider[]>([]);

  const startProviderTest = useCallback(async (provider: Provider) => {
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
  }, []);

  const processNextProvider = useCallback(async () => {
    if (quickTestCancel) {
      finishQuickTest(true);
      return;
    }

    setTestQueue((prev) => {
      const remaining = prev.slice(1);
      if (remaining.length === 0) {
        finishQuickTest(false);
        return [];
      }
      const next = remaining[0];
      setQuickTestProgress(`准备检测下一个：${next.name}`);
      void startProviderTest(next);
      return remaining;
    });
  }, [quickTestCancel, startProviderTest]);

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
  }, [currentTestProvider, onSaveResult, processNextProvider]);

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
  }, [currentTestProvider, onSaveResult, processNextProvider]);

  function handleQuickTest(providers: Provider[]) {
    if (quickTestActive || providers.length === 0) return;
    setQuickTestCancel(false);
    setQuickTestActive(true);
    setTestQueue([...providers]);
    void startProviderTest(providers[0]);
  }

  function finishQuickTest(stopped: boolean) {
    setQuickTestActive(false);
    setQuickTestProgress("");
    setCurrentTestProvider(null);
    setTestQueue([]);
    if (stopped) {
      toast("一键测试已停止", "warning");
    } else {
      toast("一键测试全部完成", "success");
    }
  }

  function handleCancelQuickTest() {
    setQuickTestCancel(true);
    setModelSelectionOpen(false);
    setFetchedModels([]);
    setModelSelectionError(null);
    finishQuickTest(true);
  }

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

  function handleSkipProvider() {
    setModelSelectionOpen(false);
    setFetchedModels([]);
    setModelSelectionError(null);
    if (quickTestActive) {
      processNextProvider();
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
