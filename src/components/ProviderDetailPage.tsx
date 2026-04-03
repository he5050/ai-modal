import { useEffect, useRef, useState } from "react";
import { ArrowLeft, TerminalSquare } from "lucide-react";
import { animate, spring } from "animejs";
import { listModelsByProvider, testSingleModelByProvider } from "../api";
import type { ModelResult, Provider, ProviderLastResult } from "../types";
import { CopyButton } from "./CopyButton";
import { HintTooltip } from "./HintTooltip";
import { Tooltip } from "./Tooltip";
import {
  QuickTestDialog,
  getResultDetails,
  summarizeFailedResultDetails,
} from "./ModelsPage";
import { toast } from "../lib/toast";
import { logger } from "../lib/devlog";
import { getConcurrency } from "./SettingsPage";

type RowStatus = "pending" | "done";

interface LiveResult extends ModelResult {
  status: RowStatus;
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${min}`;
}

function maskKey(key: string) {
  if (!key) return "—";
  if (key.length <= 4) return "*".repeat(key.length);
  return key.slice(0, 2) + "******" + key.slice(-2);
}

function maskPreviewText(value: string) {
  if (!value) return "—";
  if (value.length <= 4) return `${value.slice(0, 1)}******${value.slice(-1)}`;
  return `${value.slice(0, 2)}******${value.slice(-2)}`;
}

interface Props {
  provider: Provider | null;
  onBack: () => void;
  onEdit: (provider: Provider) => void;
  onSaveResult: (id: string, result: ProviderLastResult) => void;
}

export function ProviderDetailPage({
  provider,
  onBack,
  onEdit,
  onSaveResult,
}: Props) {
  const [testing, setTesting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [liveResults, setLiveResults] = useState<LiveResult[]>([]);
  const [quickTestTarget, setQuickTestTarget] = useState<Provider | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pageRef.current) {
      animate(pageRef.current, {
        opacity: [0, 1],
        translateY: [8, 0],
        ease: spring({ stiffness: 280, damping: 22 }),
        duration: 320,
      });
    }
  }, [provider?.id]);

  useEffect(() => {
    setTesting(false);
    setProgress("");
    setError(null);
    setLiveResults([]);
    setQuickTestTarget(null);
  }, [provider?.id]);

  if (!provider) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
        <div className="shrink-0 px-6 pb-6">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回模型列表
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-6">
          <div className="rounded-2xl border border-gray-800 bg-gray-900/80 px-6 py-8 text-center">
            <p className="text-sm font-medium text-gray-200">
              接口不存在或已删除
            </p>
            <p className="mt-2 text-xs text-gray-500">
              当前详情项不可用，请返回模型列表重新选择。
            </p>
          </div>
        </div>
      </div>
    );
  }

  const currentProvider = provider;

  const displayResults: LiveResult[] =
    liveResults.length > 0
      ? liveResults
      : (currentProvider.lastResult?.results ?? []).map((result) => ({
          ...result,
          status: "done" as RowStatus,
        }));
  const totalCount = displayResults.length;
  const availableCount = displayResults.filter(
    (result) => result.status === "done" && result.available,
  ).length;
  const unavailableCount = displayResults.filter(
    (result) => result.status === "done" && !result.available,
  ).length;

  async function handleTest() {
    setError(null);
    setLiveResults([]);
    setTesting(true);
    setProgress("正在获取模型列表...");
    onSaveResult(currentProvider.id, {
      timestamp: Date.now(),
      results: [],
    });
    logger.info(
      `[${currentProvider.name}] 开始测试，baseUrl: ${currentProvider.baseUrl}`,
    );
    let models: string[];
    try {
      models = await listModelsByProvider(
        currentProvider.baseUrl,
        currentProvider.apiKey,
      );
      logger.success(
        `[${currentProvider.name}] 获取模型列表成功，共 ${models.length} 个：${models.join(", ")}`,
      );
    } catch (err) {
      const message = String(err);
      logger.error(`[${currentProvider.name}] 获取模型列表失败：${message}`);
      setError(message);
      setTesting(false);
      return;
    }

    const initial: LiveResult[] = models.map((model) => ({
      model,
      available: false,
      latency_ms: null,
      error: null,
      status: "pending",
    }));
    setLiveResults(initial);
    setProgress(`检测 ${models.length} 个模型...`);
    const concurrency = getConcurrency();
    logger.info(
      `[${currentProvider.name}] 开始逐条检测，并发数: ${concurrency}`,
    );

    const final: LiveResult[] = [...initial];
    const queue = models.map((model, idx) => ({ model, idx }));
    async function runNext(): Promise<void> {
      const item = queue.shift();
      if (!item) return;
      const { model, idx } = item;
      logger.debug(`[${currentProvider.name}] → 检测中：${model}`);
      try {
        const result = await testSingleModelByProvider(
          currentProvider.baseUrl,
          currentProvider.apiKey,
          model,
        );
        final[idx] = { ...result, status: "done" };
        if (result.available) {
          logger.success(
            `[${currentProvider.name}] ✓ ${model}  ${
              result.latency_ms != null ? result.latency_ms + "ms" : ""
            }`,
          );
        } else {
          const detail = getResultDetails(result);
          logger.warn(
            `[${currentProvider.name}] ✗ ${model} 不可用${
              detail && detail !== "—" ? " — " + detail : ""
            }`,
          );
        }
      } catch (err) {
        final[idx] = {
          model,
          available: false,
          latency_ms: null,
          error: String(err),
          status: "done",
        };
        logger.error(
          `[${currentProvider.name}] ✗ ${model} 请求失败：${String(err)}`,
        );
      }
      setLiveResults([...final]);
      await runNext();
    }

    await Promise.all(Array.from({ length: concurrency }, runNext));

    const sorted = [...final].sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return (a.latency_ms ?? 99999) - (b.latency_ms ?? 99999);
    });
    const available = sorted.filter((result) => result.available).length;
    logger.success(
      `[${currentProvider.name}] 检测完成：${available}/${sorted.length} 可用`,
    );
    if (available === 0) {
      const detail = summarizeFailedResultDetails(sorted);
      logger.warn(
        `[${currentProvider.name}] 所有模型均不可用${
          detail ? `：${detail}` : "，请检查 API Key 或服务状态"
        }`,
      );
    }
    onSaveResult(currentProvider.id, {
      timestamp: Date.now(),
      results: sorted,
    });
    setLiveResults([]);
    setTesting(false);
    setProgress("");
    toast("模型测试完成", available > 0 ? "success" : "warning");
  }

  return (
    <div
      ref={pageRef}
      style={{ opacity: 0 }}
      className="flex h-full min-h-0 w-full min-w-0 flex-col"
    >
      <div className="shrink-0 px-6 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-4">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              返回模型列表
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight text-white">
                  {currentProvider.name}
                </h2>
                <HintTooltip content="独立查看当前 provider 的模型明细、错误细节、一键测试与终端测试片段。" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit(currentProvider)}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
            >
              编辑接口
            </button>
            <button
              onClick={handleTest}
              disabled={testing}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
            >
              {testing ? "检测中..." : "一键测试"}
            </button>
            <button
              onClick={() => setQuickTestTarget(currentProvider)}
              disabled={
                !currentProvider.baseUrl.trim() ||
                !currentProvider.apiKey.trim()
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-indigo-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <TerminalSquare className="h-3.5 w-3.5" />
              生成终端测试
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">
              Base URL
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <Tooltip content={currentProvider.baseUrl} placement="top">
                <span className="cursor-default truncate font-mono text-xs text-gray-300">
                  {maskPreviewText(currentProvider.baseUrl)}
                </span>
              </Tooltip>
              <CopyButton
                text={currentProvider.baseUrl}
                message="已复制 Base URL"
              />
            </div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">
              API Key
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="font-mono text-xs text-gray-300">
                {maskKey(currentProvider.apiKey)}
              </span>
              {currentProvider.apiKey && (
                <CopyButton
                  text={currentProvider.apiKey}
                  message="已复制 API Key"
                />
              )}
            </div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">
              最近结果
            </p>
            <p className="mt-2 text-sm font-medium text-white">
              {currentProvider.lastResult
                ? formatTime(currentProvider.lastResult.timestamp)
                : "尚未检测"}
            </p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-gray-500">
              可用 / 总数
            </p>
            <p className="mt-2 text-sm font-medium text-white">
              {availableCount}/{totalCount || 0}
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <section className="rounded-2xl border border-gray-800 bg-gray-900/80">
          <div className="flex items-center justify-between border-b border-gray-800/60 px-5 py-4">
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span>{availableCount} 可用</span>
              <span>{unavailableCount} 不可用</span>
              {testing && (
                <span className="text-indigo-400">
                  {progress || "检测中..."}
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="px-5 py-3 text-xs text-red-400">{error}</div>
          )}

          {displayResults.length > 0 ? (
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-gray-800/60">
                  <th className="w-[34%] px-5 py-2 text-left text-xs text-gray-500">
                    模型
                  </th>
                  <th className="w-[14%] px-5 py-2 text-left text-xs text-gray-500">
                    状态
                  </th>
                  <th className="w-[14%] px-5 py-2 text-left text-xs text-gray-500">
                    延迟
                  </th>
                  <th className="w-[38%] px-5 py-2 text-left text-xs text-gray-500">
                    返回结果
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayResults.map((result, index) => (
                  <tr
                    key={result.model}
                    className={`hover:bg-gray-800/30 ${
                      index < displayResults.length - 1
                        ? "border-b border-gray-800/40"
                        : ""
                    }`}
                  >
                    <td className="px-5 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="max-w-xs truncate font-mono text-xs text-gray-300">
                          {result.model}
                        </span>
                        {result.status === "done" && (
                          <CopyButton text={result.model} />
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-2">
                      {result.status === "pending" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-400">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-500" />
                          检测中
                        </span>
                      ) : result.available ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          可用
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                          不可用
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2 text-xs text-gray-400">
                      {result.latency_ms != null
                        ? `${result.latency_ms} ms`
                        : "—"}
                    </td>
                    <td className="px-5 py-2 text-xs text-gray-600">
                      {result.status === "pending" ? null : (
                        <div className="flex items-start gap-1.5">
                          <Tooltip
                            content={getResultDetails(result)}
                            placement="top"
                          >
                            <span className="max-w-[260px] cursor-default truncate leading-5 text-gray-600">
                              {getResultDetails(result)}
                            </span>
                          </Tooltip>
                          {getResultDetails(result) !== "—" && (
                            <CopyButton
                              text={getResultDetails(result)}
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
          ) : (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium text-gray-300">暂无模型结果</p>
              <p className="mt-2 text-xs text-gray-500">
                点击上方“一键测试”获取当前 provider 的模型列表和检测结果。
              </p>
            </div>
          )}
        </section>
      </div>

      {quickTestTarget && (
        <QuickTestDialog
          provider={quickTestTarget}
          onClose={() => setQuickTestTarget(null)}
        />
      )}
    </div>
  );
}
