import type { ModelResult } from "../../types";

export interface ModelConfigRecord {
  id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  lastTestResult?: ModelResult | null;
  lastTestAt?: number | null;
}

export type ClaudeEnvModelField =
  | "ANTHROPIC_MODEL"
  | "ANTHROPIC_DEFAULT_HAIKU_MODEL"
  | "ANTHROPIC_DEFAULT_SONNET_MODEL"
  | "ANTHROPIC_DEFAULT_OPUS_MODEL";

export type SnowRequestMethod = "chat" | "responses" | "gemini" | "anthropic";

export const MODEL_CONFIGS_KEY = "ai-modal-model-configs";
export const MODEL_CONFIGS_DB_KEY = "model_configs";

export const CLAUDE_ENV_MODEL_FIELDS: ClaudeEnvModelField[] = [
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
];

export const CLAUDE_ENV_MODEL_FIELD_LABELS: Record<ClaudeEnvModelField, string> = {
  ANTHROPIC_MODEL: "主模型",
  ANTHROPIC_DEFAULT_HAIKU_MODEL: "Haiku 默认模型",
  ANTHROPIC_DEFAULT_SONNET_MODEL: "Sonnet 默认模型",
  ANTHROPIC_DEFAULT_OPUS_MODEL: "Opus 默认模型",
};

export const SNOW_REQUEST_METHOD_OPTIONS: SnowRequestMethod[] = [
  "chat",
  "responses",
  "gemini",
  "anthropic",
];

export const SNOW_REQUEST_METHOD_LABELS: Record<SnowRequestMethod, string> = {
  chat: "OpenAI Chat Completion",
  responses: "OpenAI Responses",
  gemini: "Gemini",
  anthropic: "Anthropic",
};

export interface FileDraftState {
  contentDraft: string;
  savedContent: string;
  fileExists: boolean;
  loading: boolean;
  loadedPath: string;
}
