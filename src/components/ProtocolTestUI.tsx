import { Check, Save, Trash2, X } from "lucide-react";
import type { ModelResult, ProtocolTestResult } from "../types";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_ICON_MD_CLASS,
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../lib/buttonStyles";
import { CopyButton } from "./CopyButton";

export type ModelTestProtocol = "openApi" | "claude" | "gemini";

export const MODEL_TEST_PROTOCOLS: ModelTestProtocol[] = [
  "openApi",
  "claude",
  "gemini",
];

export function normalizeSupportedProtocolTag(protocol: string) {
  const normalized = protocol.trim().toLowerCase();
  if (normalized === "openapi" || normalized === "openai") return "openApi";
  if (normalized === "claude") return "claude";
  if (normalized === "gemini") return "gemini";
  if (normalized === "openrouter") return "openrouter";
  return normalized;
}

export function getModelProtocolLabel(protocol: string) {
  const normalized = normalizeSupportedProtocolTag(protocol);
  if (normalized === "openApi") return "openApi";
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
                      ? "走 OpenAI-compatible 请求格式"
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

        <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {results.map((protocolResult) => {
            const detail = getProtocolResultDetails(protocolResult);
            return (
              <div
                key={protocolResult.protocol}
                className="rounded-xl border border-gray-800 bg-gray-950/70 p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`rounded px-1.5 py-0.5 font-medium ${getModelProtocolBadgeClass(
                      protocolResult.protocol,
                    )}`}
                  >
                    {getModelProtocolLabel(protocolResult.protocol)}
                  </span>
                  <span
                    className={
                      protocolResult.available
                        ? "text-emerald-400"
                        : "text-red-400"
                    }
                  >
                    {protocolResult.available ? "支持" : "不支持"}
                  </span>
                  <span className="text-gray-500">
                    {protocolResult.latency_ms != null
                      ? `${protocolResult.latency_ms} ms`
                      : "—"}
                  </span>
                </div>
                <div className="mt-3 rounded-lg border border-gray-800 bg-black/20 p-3">
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-gray-300">
                    {detail}
                  </pre>
                </div>
              </div>
            );
          })}
        </div>
      </div>
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
