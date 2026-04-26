import { exists } from "@tauri-apps/plugin-fs";
import type {
  ClaudeEnvModelField,
  ModelConfigRecord,
} from "./constants";

export function normalizeText(value: string) {
  return value.trim();
}

export function toDisplayPath(value: string, homePath: string) {
  return value.startsWith(homePath)
    ? `~${value.slice(homePath.length)}`
    : value;
}

export async function detectExists(path: string) {
  try {
    return await exists(path);
  } catch {
    return false;
  }
}

export function createEmptyModelConfig(): ModelConfigRecord {
  return {
    id: `model-config-${Date.now()}`,
    baseUrl: "",
    apiKey: "",
    model: "",
    lastTestResult: null,
    lastTestAt: null,
  };
}

export function getModelConfigLabel(config: ModelConfigRecord) {
  const host = (() => {
    try {
      return config.baseUrl ? new URL(config.baseUrl).host : "";
    } catch {
      return "";
    }
  })();

  if (config.model && host) return `${config.model} @ ${host}`;
  if (config.model) return config.model;
  return "未命名配置";
}

export function getModelConfigResultText(
  result?: import("../../types").ModelResult | null,
) {
  if (!result) return "尚未测试";
  return result.response_text?.trim() || result.error || "—";
}

export function buildClaudeModelGuessMap(
  availableModels: string[],
  selectedModel: string,
): Record<ClaudeEnvModelField, string> {
  const normalized = availableModels.map((model) => ({
    raw: model,
    lowered: model.toLowerCase(),
  }));
  const fallback = selectedModel || availableModels[0] || "";
  const findByKeyword = (keyword: string) =>
    normalized.find((item) => item.lowered.includes(keyword))?.raw ?? fallback;

  return {
    ANTHROPIC_MODEL: fallback,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: findByKeyword("haiku"),
    ANTHROPIC_DEFAULT_SONNET_MODEL: findByKeyword("sonnet"),
    ANTHROPIC_DEFAULT_OPUS_MODEL: findByKeyword("opus"),
  };
}

export function inferSnowRequestMethod(protocols: string[] | undefined) {
  const normalized = new Set(
    (protocols ?? []).map((protocol) => protocol.toLowerCase()),
  );

  if (normalized.has("claude")) return "anthropic";
  if (normalized.has("gemini")) return "gemini";
  if (normalized.has("openai")) return "responses";
  return "chat";
}

export function pickDefaultSnowBasicModel(
  availableModels: string[],
  primary: string,
) {
  return availableModels.find((model) => model !== primary) ?? primary;
}

export function formatEnvValue(value: string) {
  if (value === "") return "";
  if (/[#\s"'`]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

export function upsertEnvAssignments(
  content: string,
  entries: Record<string, string>,
) {
  const sourceLines = content.length > 0 ? content.split(/\r?\n/) : [];
  const lines = sourceLines.filter((line, index, all) => {
    return !(index === all.length - 1 && line === "");
  });
  const pendingKeys = new Set(Object.keys(entries));

  const nextLines = lines.map((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) return line;

    const key = match[1];
    if (!pendingKeys.has(key)) return line;
    pendingKeys.delete(key);
    return `${key}=${formatEnvValue(entries[key] ?? "")}`;
  });

  if (pendingKeys.size > 0) {
    for (const key of pendingKeys) {
      nextLines.push(`${key}=${formatEnvValue(entries[key] ?? "")}`);
    }
  }

  return `${nextLines.join("\n")}\n`;
}
