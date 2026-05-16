import { CopyButton } from "../../CopyButton";
import { Tooltip } from "../../Tooltip";
import { EmptyState, StatusBadge } from "../../ui";
import {
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "@/lib/buttonStyles";
import { Loader2 } from "lucide-react";
import type { LiveResult } from "@/types";
import { getResultDetails } from "../utils";
import {
  TestedProtocolBadges,
  getModelProtocolLabel,
  getProtocolResultDetails,
} from "../../ProtocolTestUI";
import type { ModelDetectionState } from "@/hooks/useModelDetection";

interface DetectResultsProps {
  detection: ModelDetectionState;
  visibleResults: import("../../../types").ModelResult[];
  visibleResultTimestamp: number | null;
  onExport: () => void;
  onCopyAvailable: () => void;
  onSetDetailDialogResult: (result: import("../../../types").ModelResult | null) => void;
}

export function DetectResults({
  detection,
  visibleResults,
  visibleResultTimestamp,
  onExport,
  onCopyAvailable,
  onSetDetailDialogResult,
}: DetectResultsProps) {
  const isLoading = detection.phase === "fetching" || detection.phase === "testing";
  const isDone = detection.phase === "done";

  const displayResults: LiveResult[] =
    detection.liveResults.length > 0
      ? detection.liveResults
      : visibleResults.map((r) => ({
          ...r,
          status:
            detection.singleTestingModel === r.model
              ? ("pending" as import("../types").RowStatus)
              : ("done" as import("../types").RowStatus),
        }));

  const totalCount = displayResults.length;
  const availableCount = displayResults.filter(
    (r) => r.status === "done" && r.available,
  ).length;
  const unavailableCount = displayResults.filter(
    (r) => r.status === "done" && !r.available,
  ).length;

  return (
    <>
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
              onClick={onExport}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              导出 Markdown
            </button>
            {visibleResults.some((r) => r.available) && (
              <button
                onClick={onCopyAvailable}
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

      {displayResults.length > 0 ? (
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
                              onClick={() => onSetDetailDialogResult(r)}
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
        <EmptyState
          title="点击「一键测试」选择模型和协议后，检测结果会显示在这里"
          description="系统会从 v1/models 获取模型列表，你可以选择要测试的模型和协议。"
          className="mb-6"
        />
      )}
    </>
  );
}
