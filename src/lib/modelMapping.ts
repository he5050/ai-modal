import type {
  LlmRequestKind,
  ModelMappingConfig,
  ModelMappingEntry,
  ModelMappingProvider,
  ModelResult,
  Provider,
} from "../types";

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

export function makeModelSlot(modelName: string) {
  const safe = modelName
    .split("")
    .map((char) => (/^[a-zA-Z0-9_.-]$/.test(char) ? char : "-"))
    .join("");
  return `claude-${safe}`;
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
      .filter((model) => model.name.trim() && Boolean(model.enabled))
      .map((model) => ({ provider, model })),
  );
}

export function providerToMappingProvider(provider: Provider): ModelMappingProvider {
  const availableModels = provider.lastResult?.results.filter((result) => result.available) ?? [];
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
  return { id: createMappingEntryId(), name, to_1m: "", enabled: false, protocol };
}

export function normalizeModelMappingConfig(config: ModelMappingConfig): ModelMappingConfig {
  return {
    providers: config.providers.map((provider) => ({
      ...provider,
      models: provider.models.map((model) => ({
        ...model,
        id: model.id || createMappingEntryId(),
        enabled: Boolean(model.enabled),
      })),
    })),
  };
}

function toMappingEntryFromResult(result: ModelResult): ModelMappingEntry {
  return toMappingEntry(result.model, "claude");
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
