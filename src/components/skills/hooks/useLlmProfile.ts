import { useEffect, useMemo, useState } from "react";
import { loadPersistedJson } from "../../../lib/persistence";
import {
  MODEL_CONFIG_DB_KEY,
  MODEL_CONFIG_KEY,
} from "../constants";
import type { PersistedModelConfig } from "../types";

export type LlmProfile = {
  toolId: string;
  label: string;
  sourcePath: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  requestKind: string;
  protocols: string[];
  updatedAt: number | null;
};

export function useLlmProfile() {
  const [modelConfigs, setModelConfigs] = useState<PersistedModelConfig[]>([]);
  const [selectedLlmProfileId, setSelectedLlmProfileId] = useState("");
  const [loadingLlmProfiles, setLoadingLlmProfiles] = useState(false);

  async function refreshLlmProfiles() {
    setLoadingLlmProfiles(true);
    try {
      const storedModelConfigs = await loadPersistedJson<
        PersistedModelConfig[]
      >(MODEL_CONFIG_DB_KEY, MODEL_CONFIG_KEY, []);
      if (Array.isArray(storedModelConfigs)) {
        setModelConfigs(storedModelConfigs);
      } else if (
        storedModelConfigs &&
        typeof storedModelConfigs === "object" &&
        !Array.isArray(storedModelConfigs) &&
        typeof (storedModelConfigs as Record<string, unknown>).baseUrl === "string"
      ) {
        setModelConfigs([storedModelConfigs as PersistedModelConfig]);
      } else {
        setModelConfigs([]);
      }
    } catch (error) {
      console.error("Failed to refresh ai-modal llm profiles", error);
    } finally {
      setLoadingLlmProfiles(false);
    }
  }

  useEffect(() => {
    void refreshLlmProfiles();
  }, []);

  const availableLlmProfiles = useMemo(() => {
    const modelConfigProfiles = modelConfigs
      .filter(
        (config) =>
          config.baseUrl?.trim() &&
          config.apiKey?.trim() &&
          config.model?.trim(),
      )
      .map((config) => ({
        toolId: `aimodal:model-config:${config.model}`,
        label: "AIModal 模型配置",
        sourcePath: "ai-modal:model_config",
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        requestKind: config.requestKind ?? "openai-chat",
        protocols: config.lastTestResult?.supported_protocols ?? ["openai"],
        updatedAt: config.lastTestAt ?? 0,
      }));
    modelConfigProfiles.sort(
      (left, right) =>
        (right.updatedAt ?? 0) - (left.updatedAt ?? 0) ||
        left.label.localeCompare(right.label),
    );
    return modelConfigProfiles;
  }, [modelConfigs]);

  const selectedLlmProfile =
    availableLlmProfiles.find(
      (profile) => profile.toolId === selectedLlmProfileId,
    ) ??
    availableLlmProfiles[0] ??
    null;

  useEffect(() => {
    if (!selectedLlmProfileId && selectedLlmProfile) {
      setSelectedLlmProfileId(selectedLlmProfile.toolId);
    }
  }, [selectedLlmProfile, selectedLlmProfileId]);

  return {
    modelConfigs,
    setModelConfigs,
    selectedLlmProfileId,
    setSelectedLlmProfileId,
    selectedLlmProfile,
    availableLlmProfiles,
    loadingLlmProfiles,
    refreshLlmProfiles,
  };
}
