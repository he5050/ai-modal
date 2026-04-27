import { useState, useEffect, useRef } from "react";
import { ScanSearch, TerminalSquare } from "lucide-react";
import { animate, spring } from "animejs";
import { listModelsByProvider, testSingleModelByProvider } from "../../../api";
import type { ModelResult, Provider, ProviderLastResult } from "../../../types";
import { CopyButton } from "../../CopyButton";
import { Tooltip } from "../../Tooltip";
import { logger } from "../../../lib/devlog";
import { toast } from "../../../lib/toast";
import {
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../../../lib/buttonStyles";
import { getConcurrency } from "../../SettingsPage";
import type { RowStatus, ModelTestProtocol } from "../types";
import { MODEL_TEST_PROTOCOLS } from "../constants";
import {
  getResultDetails,
  summarizeFailedResultDetails,
  formatTime,
} from "../utils";
import { normalizeSupportedProtocolTag } from "../../../lib/protocolUtils";

interface LiveResult extends ModelResult {
  status: RowStatus;
}

export function DetailRow({
  provider,
  onSaveResult,
  onOpenQuickTest,
}: {
  provider: Provider;
  onSaveResult: (id: string, r: ProviderLastResult) => void;
  onOpenQuickTest: (provider: Provider) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [liveResults, setLiveResults] = useState<LiveResult[]>([]);
  const [protocolDialogModel, setProtocolDialogModel] = useState<string | null>(
    null,
  );
  const [selectedProtocols, setSelectedProtocols] = useState<
    ModelTestProtocol[]
  >(["openApi"]);
  const [singleTestingModel, setSingleTestingModel] = useState<string | null>(
    null,
  );
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rowRef.current) {
      animate(rowRef.current, {
        opacity: [0, 1],
        translateY: [-4, 0],
        ease: spring({ stiffness: 300, damping: 24 }),
        duration: 320,
      });
    }
  }, []);

  const displayResults: LiveResult[] =
    liveResults.length > 0
      ? liveResults
      : (provider.lastResult?.results ?? []).map((r) => ({
          ...r,
          status:
            singleTestingModel === r.model
              ? ("pending" as RowStatus)
              : ("done" as RowStatus),
        }));
  const totalCount = displayResults.length;
  const availableCount = displayResults.filter(
    (r) => r.status === "done" && r.available,
  ).length;
  const unavailableCount = displayResults.filter(
    (r) => r.status === "done" && !r.available,
  ).length;

  async function handleTest() {
    setError(null);
    setLiveResults([]);
    setTesting(true);
    setProgress("正在获取模型列表...");
    onSaveResult(provider.id, { timestamp: Date.now(), results: [] });
    logger.info(`[${provider.name}] 开始测试，baseUrl: ${provider.baseUrl}`);
    let models: string[];
    try {
      models = await listModelsByProvider(provider.baseUrl, provider.apiKey);
      logger.success(
        `[${provider.name}] 获取模型列表成功，共 ${models.length} 个：${models.join(", ")}`,
      );
    } catch (e) {
      logger.error(`[${provider.name}] 获取模型列表失败：${String(e)}`);
      setError(String(e));
      setTesting(false);
      return;
    }

    const initial: LiveResult[] = models.map((m) => ({
      model: m,
      available: false,
      latency_ms: null,
      error: null,
      response_text: null,
      supported_protocols: [],
      status: "pending",
    }));
    setLiveResults(initial);
    setProgress(`检测 ${models.length} 个模型...`);
    const concurrency = getConcurrency();
    logger.info(`[${provider.name}] 开始逐条检测，并发数: ${concurrency}`);

    const final: LiveResult[] = [...initial];
    const queue = models.map((model, idx) => ({ model, idx }));
    async function runNext(): Promise<void> {
      const item = queue.shift();
      if (!item) return;
      const { model, idx } = item;
      logger.debug(`[${provider.name}] → 检测中：${model}`);
      try {
        const res = await testSingleModelByProvider(
          provider.baseUrl,
          provider.apiKey,
          model,
        );
        final[idx] = { ...res, status: "done" };
        logger.debug(
          `[${provider.name}] ${model} 支持的协议: ${JSON.stringify(res.supported_protocols)}`,
        );
        if (res.available) {
          logger.success(
            `[${provider.name}] ✓ ${model} 协议:${res.supported_protocols?.join(",") || "unknown"} ${res.latency_ms != null ? res.latency_ms + "ms" : ""}`,
          );
        } else {
          const detail = getResultDetails(res);
          logger.warn(
            `[${provider.name}] ✗ ${model} 不可用${detail && detail !== "—" ? " — " + detail : ""}`,
          );
        }
      } catch (e) {
        final[idx] = {
          model,
          available: false,
          latency_ms: null,
          error: String(e),
          response_text: String(e),
          supported_protocols: [],
          status: "done",
        };
        logger.error(`[${provider.name}] ✗ ${model} 请求失败：${String(e)}`);
      }
      setLiveResults([...final]);
      await runNext();
    }
    await Promise.all(Array.from({ length: concurrency }, runNext));

    const sorted = [...final].sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return (a.latency_ms ?? 99999) - (b.latency_ms ?? 99999);
    });
    const available = sorted.filter((r) => r.available).length;
    logger.success(
      `[${provider.name}] 检测完成：${available}/${sorted.length} 可用`,
    );
    if (available === 0) {
      const detail = summarizeFailedResultDetails(sorted);
      logger.warn(
        `[${provider.name}] 所有模型均不可用${
          detail ? `：${detail}` : "，请检查 API Key 或服务状态"
        }`,
      );
    }
    onSaveResult(provider.id, { timestamp: Date.now(), results: sorted });
    setLiveResults([]);
    setTesting(false);
    setProgress("");
  }

  function handleOpenProtocolDialog(result: LiveResult) {
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
      nextProtocols.length > 0 ? nextProtocols : ["openApi"],
    );
    setProtocolDialogModel(result.model);
  }

  function toggleProtocolSelection(protocol: ModelTestProtocol) {
    setSelectedProtocols((prev) => {
      if (prev.includes(protocol)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== protocol);
      }
      return [...prev, protocol];
    });
  }

  async function handleProtocolTestConfirm() {
    if (!protocolDialogModel) return;

    const model = protocolDialogModel;
    setProtocolDialogModel(null);
    setSingleTestingModel(model);
    setError(null);
    setProgress(`正在测试 ${model}...`);
    logger.info(
      `[${provider.name}] 开始单模型测试：${model}，协议=${selectedProtocols.join(",")}`,
    );

    try {
      const result = await testSingleModelByProvider(
        provider.baseUrl,
        provider.apiKey,
        model,
        selectedProtocols,
      );
      const existing = provider.lastResult?.results ?? [];
      const nextResults = existing.some((item) => item.model === model)
        ? existing.map((item) => (item.model === model ? result : item))
        : [...existing, result];

      onSaveResult(provider.id, {
        timestamp: Date.now(),
        results: nextResults,
      });
      logger.success(
        `[${provider.name}] 单模型测试完成：${model} -> ${
          result.supported_protocols?.join(",") || "none"
        }`,
      );
      toast(
        result.available
          ? `${model} 测试完成`
          : `${model} 测试失败，请看返回结果`,
        result.available ? "success" : "warning",
      );
    } catch (e) {
      const message = String(e);
      const nextResult: ModelResult = {
        model,
        available: false,
        latency_ms: null,
        error: message,
        response_text: message,
        supported_protocols: [],
      };
      const existing = provider.lastResult?.results ?? [];
      const nextResults = existing.some((item) => item.model === model)
        ? existing.map((item) => (item.model === model ? nextResult : item))
        : [...existing, nextResult];
      onSaveResult(provider.id, {
        timestamp: Date.now(),
        results: nextResults,
      });
      logger.error(`[${provider.name}] 单模型测试失败：${model} -> ${message}`);
      setError(message);
      toast(`测试失败：${message}`, "error");
    } finally {
      setSingleTestingModel(null);
      setProgress("");
    }
  }

  return (
    <tr>
      <td colSpan={7} className="px-0 pb-0">
        <div
          ref={rowRef}
          style={{ opacity: 0 }}
          className="w-full bg-gray-800/40 border-t border-gray-800"
        >
          <div className="px-6 py-3 flex items-center justify-between border-b border-gray-800/60">
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span>
                {provider.lastResult
                  ? formatTime(provider.lastResult.timestamp)
                  : "尚未检测"}
              </span>
              <span>
                {availableCount}/{totalCount} 可用
              </span>
              {!!totalCount && <span>{unavailableCount} 不可用</span>}
              {(testing || singleTestingModel) && (
                <span className="text-indigo-400">
                  {progress || "检测中..."}
                </span>
              )}
            </div>
            <button
              onClick={handleTest}
              disabled={testing || !!singleTestingModel}
              className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              <ScanSearch className="h-3.5 w-3.5" />
              {testing ? "检测中..." : "一键测试"}
            </button>
            <button
              onClick={() => onOpenQuickTest(provider)}
              disabled={!provider.baseUrl.trim() || !provider.apiKey.trim()}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              <TerminalSquare className="h-3.5 w-3.5" />
              生成终端测试
            </button>
          </div>
          {error && (
            <div className="px-6 py-2 text-xs text-red-400">{error}</div>
          )}
          {displayResults.length > 0 && (
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-gray-800/60">
                  <th className="w-[20%] text-left px-6 py-2 text-xs text-gray-500">
                    模型
                  </th>
                  <th className="w-[120px] text-left px-6 py-2 text-xs text-gray-500">
                    状态
                  </th>
                  <th className="w-[120px] text-left px-6 py-2 text-xs text-gray-500">
                    延迟
                  </th>
                  <th className="text-left px-6 py-2 text-xs text-gray-500">
                    返回结果
                  </th>
                  <th className="w-[100px] text-left px-6 py-2 text-xs text-gray-500">
                    测试
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayResults.map((r, i) => (
                  <tr
                    key={`${r.model}-${i}`}
                    className={`hover:bg-gray-800/30 ${i < displayResults.length - 1 ? "border-b border-gray-800/40" : ""}`}
                  >
                    <td className="px-6 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-gray-300 truncate max-w-[160px]">
                          {r.model}
                        </span>
                        {r.status === "done" && <CopyButton text={r.model} />}
                      </div>
                    </td>
                    <td className="px-6 py-2">
                      {r.status === "pending" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-700 text-gray-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-pulse" />
                          检测中
                        </span>
                      ) : r.available ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/15 text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          可用
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-500/15 text-red-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          不可用
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-2 text-xs text-gray-400">
                      {r.latency_ms != null ? `${r.latency_ms} ms` : "—"}
                    </td>
                    <td className="px-6 py-2 text-xs text-gray-600">
                      {r.status === "pending" ? (
                        ""
                      ) : (
                        <div className="flex items-start gap-1.5">
                          <Tooltip
                            content={getResultDetails(r)}
                            placement="top"
                          >
                            <span className="max-w-[240px] truncate leading-5 text-gray-600 cursor-default">
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
                    <td className="px-6 py-2">
                      <button
                        onClick={() => handleOpenProtocolDialog(r)}
                        disabled={testing || !!singleTestingModel}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs text-gray-300 transition-colors hover:border-indigo-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        测试
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!testing && displayResults.length === 0 && !error && (
            <div className="px-6 py-4 text-xs text-gray-600">
              点击一键测试获取该 provider 的 model 列表
            </div>
          )}
          {protocolDialogModel && (
            <ProtocolDialog
              model={protocolDialogModel}
              selectedProtocols={selectedProtocols}
              testing={!!singleTestingModel}
              onToggle={toggleProtocolSelection}
              onConfirm={() => void handleProtocolTestConfirm()}
              onClose={() => setProtocolDialogModel(null)}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Inline protocol dialog for DetailRow ────────────────────────

import { SelectionCheckbox } from "./SharedDialogs";
import { X } from "lucide-react";
import { getModelProtocolLabel } from "../../../lib/protocolUtils";

function ProtocolDialog({
  model,
  selectedProtocols,
  testing,
  onToggle,
  onConfirm,
  onClose,
}: {
  model: string;
  selectedProtocols: ModelTestProtocol[];
  testing: boolean;
  onToggle: (protocol: ModelTestProtocol) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-white">选择测试协议</h3>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              为模型 <span className="font-mono text-gray-200">{model}</span>{" "}
              选择本次要验证的协议格式，可单选也可多选。
            </p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-700 text-gray-400 transition-colors hover:border-gray-600 hover:text-white"
            aria-label="关闭"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-2.5">
          {MODEL_TEST_PROTOCOLS.map((protocol) => {
            const checked = selectedProtocols.includes(protocol);
            return (
              <button
                key={protocol}
                type="button"
                onClick={() => onToggle(protocol)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                  checked
                    ? "border-indigo-500/40 bg-indigo-500/10"
                    : "border-gray-700 bg-gray-950/70 hover:border-gray-600 hover:bg-gray-950"
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-white">
                    {getModelProtocolLabel(protocol)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {protocol === "openApi"
                      ? "走 OpenAI Chat Completions 请求格式"
                      : protocol === "openai-responses"
                        ? "走 OpenAI Responses 请求格式"
                        : protocol === "claude"
                          ? "走 Claude messages 请求格式"
                          : "走 Gemini generateContent 请求格式"}
                  </p>
                </div>
                <SelectionCheckbox
                  checked={checked}
                  onToggle={() => onToggle(protocol)}
                />
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={testing || selectedProtocols.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
          >
            {testing ? "测试中..." : "开始测试"}
          </button>
        </div>
      </div>
    </div>
  );
}
