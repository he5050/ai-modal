import type { ModelResult, ProtocolTestResult } from "../types";

export type ModelTestProtocol = "openApi" | "openai-responses" | "claude" | "gemini";

export const MODEL_TEST_PROTOCOLS: ModelTestProtocol[] = [
  "openApi",
  "openai-responses",
  "claude",
  "gemini",
];

export function normalizeSupportedProtocolTag(protocol: string): string {
  const normalized = protocol.trim().toLowerCase();
  if (normalized === "openapi" || normalized === "openai") return "openApi";
  if (normalized === "openai-responses" || normalized === "responses") return "openai-responses";
  if (normalized === "claude") return "claude";
  if (normalized === "gemini") return "gemini";
  if (normalized === "openrouter") return "openrouter";
  return normalized;
}

export function getModelProtocolLabel(protocol: string): string {
  const normalized = normalizeSupportedProtocolTag(protocol);
  if (normalized === "openApi") return "openApi";
  if (normalized === "openai-responses") return "openai-responses";
  if (normalized === "claude") return "claude";
  if (normalized === "gemini") return "gemini";
  if (normalized === "openrouter") return "openrouter";
  return protocol;
}

export function getModelProtocolBadgeClass(protocol: string): string {
  const normalized = normalizeSupportedProtocolTag(protocol);
  if (normalized === "openApi") return "bg-blue-500/15 text-blue-400";
  if (normalized === "openai-responses") return "bg-cyan-500/15 text-cyan-400";
  if (normalized === "claude") return "bg-purple-500/15 text-purple-400";
  if (normalized === "gemini") return "bg-amber-500/15 text-amber-400";
  if (normalized === "openrouter") return "bg-emerald-500/15 text-emerald-400";
  return "bg-gray-700 text-gray-400";
}

export function getProtocolSupportChipClass(
  protocol: ModelTestProtocol,
  state: "supported" | "unsupported" | "untested",
): string {
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

export function formatProtocolSupportSummary(result: ModelResult): string {
  const supported = (result.protocol_results ?? [])
    .filter((item) => item.available)
    .map((item) => getModelProtocolLabel(item.protocol));
  return supported.length > 0 ? supported.join("、") : "无支持的协议";
}

export function getProtocolResultDetails(item: ProtocolTestResult): string {
  return item.response_text?.trim() || item.error || "—";
}

export function getProtocolSupportState(
  result: ModelResult,
  protocol: ModelTestProtocol,
): "supported" | "unsupported" | "untested" {
  const match = (result.protocol_results ?? []).find(
    (item) => normalizeSupportedProtocolTag(item.protocol) === protocol,
  );
  if (!match) return "untested" as const;
  return match.available ? ("supported" as const) : ("unsupported" as const);
}
