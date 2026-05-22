import type {
  LlmRequestKind,
  ModelMappingConfig,
  ModelMappingEntry,
  ModelMappingProvider,
  ModelResult,
  Provider,
} from "@/types";
import { normalizeSupportedProtocolTag } from "./protocolUtils";

function createMappingEntryId() {
  return `mm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export const MODEL_MAPPING_PRESETS = [
  {
    id: "deepseek",
    name: "DeepSeek",
    targetUrl: "https://api.deepseek.com/anthropic",
    models: ["deepseek-v4-pro", "deepseek-v4-flash"],
    thinkingOptions: ["", "off", "high", "max"],
  },
  {
    id: "kimi-code",
    name: "Kimi Code",
    targetUrl: "https://api.kimi.com/coding/",
    models: ["Kimi-k2.6"],
    thinkingOptions: ["", "off"],
  },
  {
    id: "kimi",
    name: "Kimi",
    targetUrl: "https://api.moonshot.cn/anthropic",
    models: ["kimi-k2.5", "kimi-k2.6"],
    thinkingOptions: ["", "off"],
  },
  {
    id: "minimax",
    name: "MiniMax",
    targetUrl: "https://api.minimaxi.com/anthropic",
    models: ["MiniMax-M2.7", "MiniMax-M2.7-highspeed"],
    thinkingOptions: ["", "off"],
  },
  {
    id: "qwen-coding",
    name: "百炼 Coding Plan",
    targetUrl: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
    models: ["qwen3.6-plus", "qwen3-coder-next"],
    thinkingOptions: ["", "off"],
  },
  {
    id: "qwen-token",
    name: "百炼 Token Plan",
    targetUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic",
    models: ["qwen3.6-plus", "qwen3-coder-next", "glm-5", "MiniMax-M2.5"],
    thinkingOptions: ["", "off"],
  },
  {
    id: "glm",
    name: "GLM 智谱",
    targetUrl: "https://open.bigmodel.cn/api/anthropic",
    models: ["glm-5.1", "glm-5-turbo", "glm-4.7", "glm-4.5-air"],
    thinkingOptions: ["", "off"],
  },
  {
    id: "mimo",
    name: "mimo",
    targetUrl: "https://api.xiaomimimo.com/anthropic",
    models: ["mimo-v2.5-pro", "mimo-v2.5", "mimo-v2-pro", "mimo-v2-omni", "mimo-v2-flash"],
    thinkingOptions: ["", "off"],
  },
] as const;

export const THINKING_EFFORT_LABELS: Record<string, string> = {
  "": "默认",
  off: "关闭",
  high: "High",
  max: "Max",
};

export const MODEL_MAPPING_TARGET_PROTOCOLS = [
  "claude",
  "openai-chat",
  "openai-responses",
  "gemini",
] as const;

export const DEFAULT_CLAUDE_SLOTS = [
  "anthropic/claude-opus-current",
  "anthropic/claude-sonnet-current",
  "anthropic/claude-haiku-current",
  "anthropic/claude-opus-4-7",
  "anthropic/claude-opus-4-6",
  "anthropic/claude-opus-4-5",
  "anthropic/claude-opus-4-1",
  "anthropic/claude-opus-4",
  "anthropic/claude-sonnet-4-6",
  "anthropic/claude-sonnet-4-5-20250929",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-sonnet-3-7",
  "anthropic/claude-haiku-4-5-20251001",
  "anthropic/claude-haiku-3-5",
] as const;

function makeModelDisplayName(providerName: string, modelName: string) {
  const provider = providerName.trim() || "provider";
  const model = modelName.trim();
  return model ? `${provider}-${model}` : provider;
}

function getDefaultTargetProtocol() {
  return "claude";
}

function normalizeProtocolList(protocols: Array<string | null | undefined> | undefined) {
  const result: string[] = [];
  for (const protocol of protocols ?? []) {
    if (!protocol) continue;
    const normalized = normalizeProtocol(protocol) ?? normalizeSupportedProtocolTag(protocol);
    if (!normalized) continue;
    if (!result.includes(normalized)) result.push(normalized);
  }
  return result;
}

function resolveSupportedProtocols(model: Pick<ModelMappingEntry, "supported_protocols" | "source_protocol" | "protocol">) {
  const values = normalizeProtocolList([
    ...(model.supported_protocols ?? []),
    model.source_protocol,
    model.protocol,
  ]);
  return values;
}

function pickSourceProtocol(
  model: Pick<ModelMappingEntry, "supported_protocols" | "source_protocol" | "protocol">,
  targetProtocol: string,
) {
  const supported = resolveSupportedProtocols(model);
  const explicit = normalizeProtocol(model.source_protocol ?? model.protocol ?? "");
  if (explicit && supported.includes(explicit)) return explicit;
  if (explicit) return explicit;
  if (supported.includes(targetProtocol)) return targetProtocol;
  if (supported.includes("claude")) return "claude";
  if (supported.length > 0) return supported[0];
  return "claude";
}

function pickTargetProtocol(targetProtocol: string | undefined | null) {
  const explicit = normalizeProtocol(targetProtocol ?? "");
  if (
    explicit &&
    explicit !== "openrouter" &&
    MODEL_MAPPING_TARGET_PROTOCOLS.includes(explicit as (typeof MODEL_MAPPING_TARGET_PROTOCOLS)[number])
  ) {
    return explicit;
  }
  return getDefaultTargetProtocol();
}

function sanitizeRouteSegment(value: string) {
  const safe = value
    .trim()
    .toLowerCase()
    .split("")
    .map((char) => (/^[a-zA-Z0-9_.-]$/.test(char) ? char : "-"))
    .join("")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return safe || "provider";
}

export function makeModelSlot(order: number) {
  return DEFAULT_CLAUDE_SLOTS[order - 1] ?? `anthropic/claude-custom-${order}`;
}

function isAutoGeneratedSlot(slot: string, modelName: string) {
  const safeName = sanitizeRouteSegment(modelName);
  return [
    new RegExp("^anthropic/claude-claude-\\d+$", "i"),
    new RegExp("^claude-claude-\\d+$", "i"),
    new RegExp("^anthropic/claude-claude-[a-z0-9_.-]+-\\d+$", "i"),
    new RegExp("^claude-claude-[a-z0-9_.-]+-\\d+$", "i"),
    new RegExp(`^anthropic/claude-${safeName}$`, "i"),
    new RegExp(`^claude-${safeName}$`, "i"),
    new RegExp(`^anthropic/claude-claude-${safeName}$`, "i"),
    new RegExp(`^claude-claude-${safeName}$`, "i"),
  ].some((pattern) => pattern.test(slot));
}

function normalizeExplicitSlot(slot: string) {
  const trimmed = slot.trim();
  const normalized = trimmed.replace(/^anthropic\//i, "");
  const safe = normalized
    .split("")
    .map((char) => (/^[a-zA-Z0-9_.-]$/.test(char) ? char : "-"))
    .join("");
  if (safe.startsWith("claude-")) {
    return `anthropic/${safe}`;
  }
  return `anthropic/claude-claude-${safe}`;
}

export function normalizeModelSlot(
  slot: string | undefined | null,
  modelName: string,
  _nextAutoSlot: () => string,
) {
  const trimmed = slot?.trim() ?? "";
  // 不再自动填充槽位，保持用户设置或为空
  if (!trimmed || isAutoGeneratedSlot(trimmed, modelName)) {
    return "";
  }
  return normalizeExplicitSlot(trimmed);
}

export function getModelSlot(model: Pick<ModelMappingEntry, "name" | "slot" | "slots">) {
  const all = getModelSlots(model);
  return all[0] || DEFAULT_CLAUDE_SLOTS[0];
}

export function getModelSlots(model: Pick<ModelMappingEntry, "name" | "slot" | "slots">): string[] {
  const fromSlots = (model.slots ?? []).map((s) => s.trim()).filter(Boolean);
  const legacy = model.slot?.trim() ?? "";
  if (fromSlots.length > 0) {
    if (legacy && !fromSlots.includes(legacy)) {
      return [legacy, ...fromSlots];
    }
    return fromSlots;
  }
  return legacy ? [legacy] : [];
}

function normalizeModelDisplayName(
  displayName: string | undefined | null,
  providerName: string,
  modelName: string,
) {
  const trimmed = displayName?.trim() ?? "";
  if (!trimmed) return makeModelDisplayName(providerName, modelName);
  return trimmed;
}

export function countMappingModels(config: ModelMappingConfig) {
  return config.providers.reduce(
    (total, provider) => total + provider.models.filter((model) => Boolean(model.enabled)).length,
    0,
  );
}

export function getActiveMappingModels(config: ModelMappingConfig) {
  return config.providers.flatMap((provider) =>
    provider.models
      .filter((model) =>
        model.name.trim() &&
        Boolean(model.enabled) &&
        (model.target_protocol || "claude") === "claude" &&
        getModelSlots(model).length > 0,
      )
      .map((model) => ({ provider, model })),
  );
}

export function providerToMappingProvider(
  provider: Provider,
  selectedModels?: string[],
): ModelMappingProvider {
  const selectedSet = selectedModels ? new Set(selectedModels) : null;
  const availableModels =
    provider.lastResult?.results.filter(
      (result) => result.available && (!selectedSet || selectedSet.has(result.model)),
    ) ?? [];
  return {
    id: provider.id,
    name: provider.name,
    target_url: normalizeMappingBaseUrl(provider.baseUrl),
    api_key: provider.apiKey,
    models: availableModels.map(toMappingEntryFromResult),
    thinking_effort: "",
  };
}

export function toMappingEntry(name: string, protocol = "claude"): ModelMappingEntry {
  return {
    id: createMappingEntryId(),
    name,
    slot: "",
    display_name: "",
    supported_protocols: normalizeProtocolList([protocol]),
    source_protocol: "",
    target_protocol: getDefaultTargetProtocol(),
    to_1m: "",
    enabled: false,
    protocol: "",
  };
}

export function normalizeModelMappingConfig(config: ModelMappingConfig): ModelMappingConfig {
  const reservedSlots = new Set<string>();
  for (const provider of config.providers) {
    for (const model of provider.models) {
      for (const s of getModelSlots(model)) {
        if (!s || isAutoGeneratedSlot(s, model.name)) continue;
        reservedSlots.add(normalizeExplicitSlot(s));
      }
    }
  }

  let nextAutoIndex = 1;
  function allocateAutoSlot() {
    while (reservedSlots.has(makeModelSlot(nextAutoIndex))) {
      nextAutoIndex += 1;
    }
    const slot = makeModelSlot(nextAutoIndex);
    reservedSlots.add(slot);
    nextAutoIndex += 1;
    return slot;
  }

  return {
    providers: config.providers.map((provider) => ({
      ...provider,
      models: provider.models.map((model) => {
        const supportedProtocols = resolveSupportedProtocols(model);
        const targetProtocol = pickTargetProtocol(model.target_protocol);
        const sourceProtocol = pickSourceProtocol(model, targetProtocol);
        const normalizedSlots = getModelSlots(model).map((s) => {
          if (!s || isAutoGeneratedSlot(s, model.name)) {
            return allocateAutoSlot();
          }
          return normalizeExplicitSlot(s);
        });
        const legacySlot = normalizedSlots[0] ?? "";
        return {
          ...model,
          id: model.id || createMappingEntryId(),
          slot: legacySlot,
          slots: normalizedSlots,
          display_name: normalizeModelDisplayName(
            model.display_name,
            provider.name || provider.id || "provider",
            model.name,
          ),
          supported_protocols: supportedProtocols,
          source_protocol: sourceProtocol,
          target_protocol: targetProtocol,
          enabled: Boolean(model.enabled),
        };
      }),
    })),
  };
}

function toMappingEntryFromResult(result: ModelResult): ModelMappingEntry {
  const supportedProtocols = normalizeProtocolList([
    ...(result.supported_protocols ?? []),
    ...(result.protocol_results ?? []).filter((item) => item.available).map((item) => item.protocol),
  ]);
  return {
    ...toMappingEntry(result.model, supportedProtocols[0] ?? "claude"),
    supported_protocols: supportedProtocols,
  };
}

export function inferMappingProtocol(result: ModelResult): LlmRequestKind | "openrouter" {
  const candidates = [
    ...(result.supported_protocols ?? []),
    ...(result.protocol_results ?? [])
      .filter((item) => item.available)
      .map((item) => item.protocol),
  ];
  for (const candidate of candidates) {
    const normalized = normalizeProtocol(candidate);
    if (normalized) return normalized;
  }
  return "claude";
}

export function normalizeProtocol(protocol?: string | null): LlmRequestKind | "openrouter" | null {
  const value = protocol?.trim().toLowerCase();
  if (!value) return null;
  if (["openapi", "openai", "openai-chat", "chat", "open-ai-chat"].includes(value)) {
    return "openai-chat";
  }
  if (["openai-responses", "responses", "open-ai-responses"].includes(value)) {
    return "openai-responses";
  }
  if (value === "openrouter") return "openrouter";
  if (value === "claude" || value === "anthropic") return "claude";
  if (value === "gemini") return "gemini";
  return null;
}

export function createPresetProvider(presetId: string): ModelMappingProvider {
  const preset = MODEL_MAPPING_PRESETS.find((item) => item.id === presetId);
  if (!preset) {
    return {
      id: `custom-${Date.now()}`,
      name: "自定义服务商",
      target_url: "",
      api_key: "",
      models: [],
      thinking_effort: "",
    };
  }
  return {
    id: preset.id,
    name: preset.name,
    target_url: preset.targetUrl,
    api_key: "",
    models: preset.models.map((model) => toMappingEntry(model, "claude")),
    thinking_effort: "",
  };
}

export function getPresetModels(targetUrl: string) {
  const preset = matchPreset(targetUrl);
  return preset?.models ?? [];
}

export function getThinkingOptions(targetUrl: string) {
  const preset = matchPreset(targetUrl);
  return preset?.thinkingOptions ?? ["", "off", "high", "max"];
}

function matchPreset(targetUrl: string) {
  if (!targetUrl) return null;
  const lower = targetUrl.toLowerCase();
  return (
    MODEL_MAPPING_PRESETS.find((preset) => {
      try {
        return lower.includes(new URL(preset.targetUrl).hostname.toLowerCase());
      } catch {
        return false;
      }
    }) ?? null
  );
}

function normalizeMappingBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/$/, "");
  return trimmed;
}
