import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Save, X } from "lucide-react";
import type { ModelResult, ProtocolTestResult } from "../types";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_ICON_MD_CLASS,
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../lib/buttonStyles";

export type ModelTestProtocol = "openApi" | "openai-responses" | "claude" | "gemini";

export const MODEL_TEST_PROTOCOLS: ModelTestProtocol[] = [
  "openApi",
  "openai-responses",
  "claude",
  "gemini",
];

export function normalizeSupportedProtocolTag(protocol: string) {
  const normalized = protocol.trim().toLowerCase();
  if (normalized === "openapi" || normalized === "openai") return "openApi";
  if (normalized === "openai-responses" || normalized === "responses") return "openai-responses";
  if (normalized === "claude") return "claude";
  if (normalized === "gemini") return "gemini";
  if (normalized === "openrouter") return "openrouter";
  return normalized;
}

export function getModelProtocolLabel(protocol: string) {
  const normalized = normalizeSupportedProtocolTag(protocol);
  if (normalized === "openApi") return "openApi";
  if (normalized === "openai-responses") return "openai-responses";
  if (normalized === "claude") return "claude";
  if (normalized === "gemini") return "gemini";
  if (normalized === "openrouter") return "openrouter";
  return protocol;
}

export function getModelProtocolBadgeClass(protocol: string) {
  const normalized = normalizeSupportedProtocolTag(protocol);
  if (normalized === "openApi") {
    return "bg-blue-500/15 text-blue-400";
  }
  if (normalized === "openai-responses") {
    return "bg-cyan-500/15 text-cyan-400";
  }
  if (normalized === "claude") {
    return "bg-purple-500/15 text-purple-400";
  }
  if (normalized === "gemini") {
    return "bg-amber-500/15 text-amber-400";
  }
  if (normalized === "openrouter") {
    return "bg-emerald-500/15 text-emerald-400";
  }
  return "bg-gray-700 text-gray-400";
}

export function formatProtocolSupportSummary(result: ModelResult) {
  const protocolMap = new Map(
    (result.protocol_results ?? []).map((item) => [
      normalizeSupportedProtocolTag(item.protocol),
      item.available,
    ]),
  );

  return MODEL_TEST_PROTOCOLS.map((protocol) => {
    const available = protocolMap.get(protocol);
    if (available == null) return `${protocol}=未测试`;
    return `${protocol}=${available ? "支持" : "不支持"}`;
  }).join("，");
}

export function getProtocolResultDetails(item: ProtocolTestResult) {
  return item.response_text?.trim() || item.error || "—";
}

function formatDebugMap(value?: Record<string, string> | null) {
  if (!value || Object.keys(value).length === 0) return "—";
  return JSON.stringify(value, null, 2);
}

export function getProtocolSupportState(
  result: ModelResult,
  protocol: ModelTestProtocol,
) {
  const match = (result.protocol_results ?? []).find(
    (item) => normalizeSupportedProtocolTag(item.protocol) === protocol,
  );
  if (!match) return "untested" as const;
  return match.available ? ("supported" as const) : ("unsupported" as const);
}

/**
 * 只渲染实际测试过的协议标签（从 protocol_results 中取），
 * 批量测试时只有 openApi 一项，单模型多协议测试时会显示多项。
 */
export function TestedProtocolBadges({ result }: { result: ModelResult }) {
  const protocolResults = result.protocol_results ?? [];
  if (protocolResults.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {protocolResults.map((pr) => {
        const normalized = normalizeSupportedProtocolTag(pr.protocol) as ModelTestProtocol;
        const state = pr.available
          ? ("supported" as const)
          : ("unsupported" as const);
        return (
          <span
            key={pr.protocol}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${getProtocolSupportChipClass(
              normalized,
              state,
            )}`}
          >
            <span>{getModelProtocolLabel(pr.protocol)}</span>
            <span>{state === "supported" ? "支持" : "不支持"}</span>
          </span>
        );
      })}
    </div>
  );
}

export function getProtocolSupportChipClass(
  protocol: ModelTestProtocol,
  state: "supported" | "unsupported" | "untested",
) {
  const isSupported = state === "supported";

  if (protocol === "openApi") {
    return isSupported
      ? "border-blue-500/35 bg-blue-500/15 text-blue-300"
      : "border-blue-900/50 bg-blue-950/50 text-blue-500";
  }
  if (protocol === "openai-responses") {
    return isSupported
      ? "border-cyan-500/35 bg-cyan-500/15 text-cyan-300"
      : "border-cyan-900/50 bg-cyan-950/50 text-cyan-500";
  }
  if (protocol === "claude") {
    return isSupported
      ? "border-purple-500/35 bg-purple-500/15 text-purple-300"
      : "border-purple-900/50 bg-purple-950/50 text-purple-500";
  }
  return isSupported
    ? "border-amber-500/35 bg-amber-500/15 text-amber-300"
    : "border-amber-900/50 bg-amber-950/50 text-amber-500";
}

function SelectionCheckbox({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
        checked
          ? "border-indigo-500 bg-indigo-600 text-white"
          : "border-gray-600 bg-gray-800 text-transparent hover:border-indigo-500/60"
      }`}
    >
      <Check className="h-3 w-3" strokeWidth={3} />
    </button>
  );
}

export function ModelProtocolDialog({
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
            className={BUTTON_ICON_MD_CLASS}
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
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            <X className="h-3.5 w-3.5" />
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={testing || selectedProtocols.length === 0}
            className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            <Save className="h-3.5 w-3.5" />
            {testing ? "测试中..." : "开始测试"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProtocolResultDetailDialog({
  model,
  results,
  onClose,
}: {
  model: string;
  results: ProtocolTestResult[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 px-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-white">协议测试详情</h3>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              模型 <span className="font-mono text-gray-200">{model}</span>{" "}
              在各协议下的独立测试结果。
            </p>
          </div>
          <button
            onClick={onClose}
            className={BUTTON_ICON_MD_CLASS}
            aria-label="关闭"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {results.map((protocolResult) => (
            <ProtocolResultCard
              key={protocolResult.protocol}
              result={protocolResult}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ProtocolResultCard({ result }: { result: ProtocolTestResult }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = !!result.error?.trim();
  const detail = getProtocolResultDetails(result);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/70 overflow-hidden">
      {/* 折叠态：摘要行 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-800/40"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
        )}
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${getModelProtocolBadgeClass(
            result.protocol,
          )}`}
        >
          {getModelProtocolLabel(result.protocol)}
        </span>
        <span
          className={`text-xs font-medium ${result.available ? "text-emerald-400" : "text-red-400"}`}
        >
          {result.available ? "支持" : "不支持"}
        </span>
        <span className="text-xs text-gray-500">
          {result.latency_ms != null ? `${result.latency_ms} ms` : "—"}
        </span>
        <span className="text-xs text-gray-500">
          {result.response_status != null
            ? `HTTP ${result.response_status}`
            : ""}
        </span>
        {hasError && !expanded && (
          <span className="flex-1 truncate text-xs text-red-400/70">
            {result.error}
          </span>
        )}
      </button>

      {/* 展开态：详细信息 */}
      {expanded && (
        <div className="border-t border-gray-800/60 px-4 py-3 space-y-3">
          {/* 关键信息 */}
          <div className="grid gap-2 text-xs">
            {result.request_url && (
              <div className="flex items-start gap-2">
                <span className="shrink-0 text-gray-500 w-24">Request</span>
                <span className="font-mono text-gray-300 break-all">
                  {result.request_method ?? "—"} {result.request_url}
                </span>
              </div>
            )}
            {result.response_status != null && (
              <div className="flex items-start gap-2">
                <span className="shrink-0 text-gray-500 w-24">HTTP Status</span>
                <span className={`font-mono ${result.response_status < 400 ? "text-gray-300" : "text-red-400"}`}>
                  {result.response_status}
                </span>
              </div>
            )}
            {result.latency_ms != null && (
              <div className="flex items-start gap-2">
                <span className="shrink-0 text-gray-500 w-24">Latency</span>
                <span className="font-mono text-gray-300">{result.latency_ms} ms</span>
              </div>
            )}
            {hasError && (
              <div className="flex items-start gap-2">
                <span className="shrink-0 text-gray-500 w-24">Error</span>
                <span className="text-red-400 break-all">{result.error}</span>
              </div>
            )}
            {detail && detail !== "—" && !hasError && (
              <div className="flex items-start gap-2">
                <span className="shrink-0 text-gray-500 w-24">Response</span>
                <span className="text-gray-400 break-all line-clamp-3">{detail}</span>
              </div>
            )}
          </div>

          {/* 可折叠的详细数据 */}
          <CollapsibleDebugSection title="Request Body" value={result.request_body} />
          <CollapsibleDebugSection title="Response Body" value={detail} />
          <CollapsibleDebugSection title="Request Headers" value={formatDebugMap(result.request_headers)} />
          <CollapsibleDebugSection title="Response Headers" value={formatDebugMap(result.response_headers)} />
        </div>
      )}
    </div>
  );
}

function CollapsibleDebugSection({
  title,
  value,
}: {
  title: string;
  value?: string | number | null;
}) {
  const [open, setOpen] = useState(false);
  const isEmpty = value == null || value === "" || value === "—";
  if (isEmpty) return null;

  return (
    <div className="rounded-lg border border-gray-800/60 bg-black/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-gray-800/30"
      >
        <span className="text-[11px] uppercase tracking-[0.12em] text-gray-500">{title}</span>
        {open ? (
          <ChevronDown className="h-3 w-3 text-gray-600" />
        ) : (
          <ChevronRight className="h-3 w-3 text-gray-600" />
        )}
      </button>
      {open && (
        <div className="border-t border-gray-800/40 px-3 py-2">
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs leading-5 text-gray-400">
            {String(value)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function RetestScopeDialog({
  totalCount,
  availableCount,
  unavailableCount,
  onAll,
  onAvailableOnly,
  onUnavailableOnly,
  onCancel,
}: {
  totalCount: number;
  availableCount: number;
  unavailableCount: number;
  onAll: () => void;
  onAvailableOnly: () => void;
  onUnavailableOnly: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[92] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-white">选择重测范围</h3>
        <p className="mt-2 text-sm leading-6 text-gray-400">
          当前接口已有 {totalCount} 条历史模型结果。你这次想重新检测哪些模型？
        </p>

        <div className="mt-5 space-y-2.5">
          <button
            onClick={onAll}
            className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left ${BUTTON_ACCENT_OUTLINE_CLASS}`}
          >
            <div>
              <p className="text-sm font-medium text-white">全部重新检测</p>
              <p className="mt-1 text-xs text-gray-500">
                重新拉取模型列表并检测全部模型
              </p>
            </div>
            <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-200">
              {totalCount} 条
            </span>
          </button>

          <button
            onClick={onAvailableOnly}
            disabled={availableCount === 0}
            className={`flex w-full items-center justify-between rounded-xl bg-gray-950/70 px-4 py-3 text-left ${BUTTON_SECONDARY_CLASS}`}
          >
            <div>
              <p className="text-sm font-medium text-white">只检测上次可用</p>
              <p className="mt-1 text-xs text-gray-500">
                仅复测上次结果为可用的模型
              </p>
            </div>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
              {availableCount} 条
            </span>
          </button>

          <button
            onClick={onUnavailableOnly}
            disabled={unavailableCount === 0}
            className={`flex w-full items-center justify-between rounded-xl bg-gray-950/70 px-4 py-3 text-left ${BUTTON_SECONDARY_CLASS}`}
          >
            <div>
              <p className="text-sm font-medium text-white">
                只检测上次不可用
              </p>
              <p className="mt-1 text-xs text-gray-500">
                仅复测上次结果为不可用的模型
              </p>
            </div>
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-300">
              {unavailableCount} 条
            </span>
          </button>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onCancel}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            <X className="h-3.5 w-3.5" />
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
