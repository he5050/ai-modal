import type { LlmRequestKind } from "../../types";

export type InstallMode = "search" | "github" | "local" | "update" | "remove";
export type SkillsTab = "list" | "manage";

export type PersistedModelConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  requestKind?: LlmRequestKind;
  lastTestAt?: number | null;
  lastTestResult?: {
    supported_protocols?: string[];
  } | null;
};

export type BuiltinSkillTarget = {
  id: string;
  label: string;
  relativePath: string;
  accentClass: string;
};
