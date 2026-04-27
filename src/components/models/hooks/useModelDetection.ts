import { useState, useCallback } from "react";
import { listModelsByProvider, testSingleModelByProvider } from "../../../api";
import type { ModelResult } from "../../../types";
import { logger } from "../../../lib/devlog";
import { toast } from "../../../lib/toast";
import { getConcurrency } from "../../SettingsPage";
import type { LiveResult, ModelTestProtocol, Phase } from "../types";
import { MODEL_TEST_PROTOCOLS } from "../constants";
import {
  buildTestSignature,
  mergeSingleResult,
  friendlyError,
} from "../utils";
import { normalizeSupportedProtocolTag } from "../../../lib/protocolUtils";
import { formatProtocolSupportSummary } from "../../ProtocolTestUI";

export function useModelDetection() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [results, setResults] = useState<ModelResult[]>([]);
  const [liveResults, setLiveResults] = useState<LiveResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [testCount, setTestCount] = useState({ done: 0, total: 0 });
  const [resultTimestamp, setResultTimestamp] = useState<number | null>(null);
  const [lastTestMode, setLastTestMode] = useState<"none" | "all" | "single">(
    "none",
  );
  const [lastTestSignature, setLastTestSignature] = useState<string | null>(
    null,
  );
  const [singleTestingModel, setSingleTestingModel] = useState<string | null>(
    null,
  );
  const [protocolDialogModel, setProtocolDialogModel] = useState<string | null>(
    null,
  );
  const [selectedProtocols, setSelectedProtocols] = useState<
    ModelTestProtocol[]
  >([...MODEL_TEST_PROTOCOLS]);
  const [retestScopeDialogOpen, setRetestScopeDialogOpen] = useState(false);

  const runModelDetection = useCallback(
    async (baseUrl: string, apiKey: string, name: string, targetModels?: string[]) => {
      if (!baseUrl.trim()) return;
      setError(null);
      setResults([]);
      setLiveResults([]);
      setPhase(targetModels ? "testing" : "fetching");
      setProgress(targetModels ? "正在准备重测模型..." : "正在获取模型列表...");
      setLastTestMode("all");
      logger.info(
        `[${name || baseUrl}] 开始检测，baseUrl: ${baseUrl}${targetModels ? `，指定模型=${targetModels.join(", ")}` : ""}`,
      );
      let models: string[];
      if (targetModels && targetModels.length > 0) {
        models = targetModels;
      } else {
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
      }

      const initial: LiveResult[] = models.map((m) => ({
        model: m,
        available: false,
        latency_ms: null,
        error: null,
        response_text: null,
        supported_protocols: [],
        protocol_results: [],
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
            response_text: String(e),
            supported_protocols: [],
            protocol_results: [],
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
    },
    [],
  );

  const handleTestSingleModel = useCallback(
    async (baseUrl: string, apiKey: string, name: string, manualModel: string, existingResults: ModelResult[], existingSignature: string | null) => {
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
          supported_protocols: [],
          protocol_results: [],
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
          existingSignature === currentSignature
            ? mergeSingleResult(existingResults, result)
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
    },
    [],
  );

  const handleOpenProtocolDialog = useCallback((result: LiveResult) => {
    const nextProtocols =
      result.supported_protocols
        ?.map(normalizeSupportedProtocolTag)
        .filter(
          (protocol): protocol is ModelTestProtocol =>
            protocol === "openApi" ||
            protocol === "openai-responses" ||
            protocol === "claude" ||
            protocol === "gemini",
        ) ?? [];
    setSelectedProtocols(
      nextProtocols.length > 0 ? nextProtocols : [...MODEL_TEST_PROTOCOLS],
    );
    setProtocolDialogModel(result.model);
  }, []);

  const toggleProtocolSelection = useCallback((protocol: ModelTestProtocol) => {
    setSelectedProtocols((prev) => {
      if (prev.includes(protocol)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== protocol);
      }
      return [...prev, protocol];
    });
  }, []);

  const handleProtocolTestConfirm = useCallback(
    async (baseUrl: string, apiKey: string, name: string, existingResults: ModelResult[], existingSignature: string | null) => {
      if (!protocolDialogModel || !baseUrl.trim()) return;

      const model = protocolDialogModel;
      const currentSignature = buildTestSignature(baseUrl, apiKey);
      setProtocolDialogModel(null);
      setSingleTestingModel(model);
      setError(null);
      setProgress(`正在测试 ${model}...`);
      setPhase("testing");
      setLastTestMode("single");
      logger.info(
        `[${name || baseUrl}] 当前 Provider 单模型测试：${model}，协议=${selectedProtocols.join(",")}`,
      );

      try {
        const result = await testSingleModelByProvider(
          baseUrl.trim(),
          apiKey.trim(),
          model,
          selectedProtocols,
        );
        const nextResults =
          existingSignature === currentSignature
            ? mergeSingleResult(existingResults, result)
            : [result];
        setResults(nextResults);
        setResultTimestamp(Date.now());
        setLastTestSignature(currentSignature);
        setLiveResults([]);
        setPhase("done");
        setProgress("");
        setTestCount({ done: 1, total: 1 });
        toast(
          `${model} 测试完成：${formatProtocolSupportSummary(result)}`,
          result.available ? "success" : "warning",
        );
      } catch (e) {
        const msg = friendlyError(e);
        logger.error(`当前 Provider 单模型测试失败：${msg}`);
        setError(msg);
        setLiveResults([]);
        setPhase("idle");
        setProgress("");
        setTestCount({ done: 0, total: 0 });
      } finally {
        setSingleTestingModel(null);
      }
    },
    [protocolDialogModel, selectedProtocols],
  );

  const resetDetectionState = useCallback(() => {
    setPhase("idle");
    setResults([]);
    setLiveResults([]);
    setError(null);
    setProgress("");
    setResultTimestamp(null);
    setTestCount({ done: 0, total: 0 });
    setLastTestMode("none");
    setLastTestSignature(null);
    setSingleTestingModel(null);
    setProtocolDialogModel(null);
    setRetestScopeDialogOpen(false);
  }, []);

  return {
    phase,
    results,
    setResults,
    liveResults,
    setLiveResults,
    error,
    setError,
    progress,
    setProgress,
    testCount,
    setTestCount,
    resultTimestamp,
    setResultTimestamp,
    lastTestMode,
    setLastTestMode,
    lastTestSignature,
    setLastTestSignature,
    singleTestingModel,
    protocolDialogModel,
    setProtocolDialogModel,
    selectedProtocols,
    retestScopeDialogOpen,
    setRetestScopeDialogOpen,
    runModelDetection,
    handleTestSingleModel,
    handleOpenProtocolDialog,
    toggleProtocolSelection,
    handleProtocolTestConfirm,
    resetDetectionState,
  };
}
