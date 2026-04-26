import { useEffect, useState } from "react";
import { testModelConfig } from "../../api";
import { loadPersistedJson, savePersistedJson } from "../../lib/persistence";
import { toast } from "../../lib/toast";
import { MODEL_CONFIGS_DB_KEY, MODEL_CONFIGS_KEY } from "./constants";
import type { ModelConfigRecord } from "./constants";
import { createEmptyModelConfig } from "./utils";

export function useModelConfig() {
  const [modelConfigs, setModelConfigs] = useState<ModelConfigRecord[]>([]);
  const [savedModelConfigs, setSavedModelConfigs] = useState<
    ModelConfigRecord[]
  >([]);
  const [selectedModelConfigId, setSelectedModelConfigId] =
    useState<string>("");
  const [testingModelConfig, setTestingModelConfig] = useState(false);
  const [modelConfigsReady, setModelConfigsReady] = useState(false);

  const selectedModelConfig =
    modelConfigs.find((item) => item.id === selectedModelConfigId) ??
    modelConfigs[0] ??
    null;

  const modelConfigDirty =
    JSON.stringify(modelConfigs) !== JSON.stringify(savedModelConfigs);

  // Load from storage on mount
  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const raw = await loadPersistedJson<unknown[]>(
          MODEL_CONFIGS_DB_KEY,
          MODEL_CONFIGS_KEY,
          [],
        );
        if (!active) return;
        const parsed = Array.isArray(raw)
          ? raw
              .filter((item): item is ModelConfigRecord => {
                return (
                  item != null &&
                  typeof (item as Record<string, unknown>).id === "string"
                );
              })
              .map((item) => ({
                id: item.id,
                baseUrl: typeof item.baseUrl === "string" ? item.baseUrl : "",
                apiKey: typeof item.apiKey === "string" ? item.apiKey : "",
                model: typeof item.model === "string" ? item.model : "",
                lastTestResult:
                  item.lastTestResult && typeof item.lastTestResult === "object"
                    ? item.lastTestResult
                    : null,
                lastTestAt:
                  typeof item.lastTestAt === "number" ? item.lastTestAt : null,
              }))
          : [];
        setModelConfigs(parsed);
        setSavedModelConfigs(parsed);
        setSelectedModelConfigId(parsed[0]?.id ?? "");
      } catch (error) {
        console.error("Failed to load model configs", error);
        toast("读取模型配置失败", "error");
      } finally {
        if (active) setModelConfigsReady(true);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  // Auto-select first if current is gone
  useEffect(() => {
    if (modelConfigs.length === 0) {
      setSelectedModelConfigId("");
      return;
    }
    const stillExists = modelConfigs.some(
      (item) => item.id === selectedModelConfigId,
    );
    if (!stillExists) {
      setSelectedModelConfigId(modelConfigs[0].id);
    }
  }, [modelConfigs, selectedModelConfigId]);

  function updateSelectedModelConfig(
    patch: Partial<ModelConfigRecord>,
    targetId = selectedModelConfig?.id,
  ) {
    if (!targetId) return;
    setModelConfigs((prev) =>
      prev.map((item) => (item.id === targetId ? { ...item, ...patch } : item)),
    );
  }

  function handleCreateModelConfig() {
    const next = createEmptyModelConfig();
    setModelConfigs((prev) => [...prev, next]);
    setSelectedModelConfigId(next.id);
  }

  async function handleSaveModelConfig() {
    if (!modelConfigsReady || !selectedModelConfig) return;
    await savePersistedJson(
      MODEL_CONFIGS_DB_KEY,
      modelConfigs,
      MODEL_CONFIGS_KEY,
    );
    setSavedModelConfigs(modelConfigs);
    toast("模型配置已保存", "success");
  }

  async function handleDeleteModelConfig() {
    if (!selectedModelConfig) return;
    const next = modelConfigs.filter(
      (item) => item.id !== selectedModelConfig.id,
    );
    setModelConfigs(next);
    setSavedModelConfigs(next);
    setSelectedModelConfigId(next[0]?.id ?? "");
    await savePersistedJson(MODEL_CONFIGS_DB_KEY, next, MODEL_CONFIGS_KEY);
    toast("模型配置已删除", "success");
  }

  function handleImportSelectedAvailableModel(
    selectedAvailableModel: {
      baseUrl: string;
      apiKey: string;
      model: string;
    } | null,
    selectedAvailableProvider: {
      models: { baseUrl: string; apiKey: string; model: string }[];
    } | null,
  ) {
    if (!selectedAvailableModel || !selectedAvailableProvider) return;
    const next = selectedModelConfig ?? createEmptyModelConfig();
    const exists = modelConfigs.some((item) => item.id === next.id);
    const patch: ModelConfigRecord = {
      ...next,
      baseUrl: selectedAvailableModel.baseUrl,
      apiKey: selectedAvailableModel.apiKey,
      model: selectedAvailableModel.model,
    };
    setModelConfigs((prev) =>
      exists
        ? prev.map((item) => (item.id === next.id ? patch : item))
        : [...prev, patch],
    );
    setSelectedModelConfigId(next.id);
  }

  async function handleTestCurrentModelConfig() {
    if (
      !selectedModelConfig?.baseUrl ||
      !selectedModelConfig.apiKey ||
      !selectedModelConfig.model
    )
      return;
    setTestingModelConfig(true);
    try {
      const result = await testModelConfig(
        selectedModelConfig.baseUrl,
        selectedModelConfig.apiKey,
        selectedModelConfig.model,
      );
      updateSelectedModelConfig({
        lastTestResult: result,
        lastTestAt: Date.now(),
      });
      toast(
        result.available ? "模型配置测试通过" : "模型配置测试失败",
        result.available ? "success" : "warning",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateSelectedModelConfig({
        lastTestResult: {
          model: selectedModelConfig.model,
          available: false,
          latency_ms: null,
          error: message,
          response_text: message,
        },
        lastTestAt: Date.now(),
      });
      toast(`测试失败：${message}`, "error");
    } finally {
      setTestingModelConfig(false);
    }
  }

  return {
    modelConfigs,
    setModelConfigs,
    savedModelConfigs,
    selectedModelConfig,
    selectedModelConfigId,
    setSelectedModelConfigId,
    modelConfigDirty,
    modelConfigsReady,
    testingModelConfig,
    handleCreateModelConfig,
    handleSaveModelConfig,
    handleDeleteModelConfig,
    handleImportSelectedAvailableModel,
    handleTestCurrentModelConfig,
    updateSelectedModelConfig,
  };
}
