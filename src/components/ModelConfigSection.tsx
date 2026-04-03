import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { testModelConfig } from "../api";
import { loadPersistedJson, savePersistedJson } from "../lib/persistence";
import { FIELD_MONO_INPUT_CLASS, FIELD_SELECT_CLASS } from "../lib/formStyles";
import { logger } from "../lib/devlog";
import { toast } from "../lib/toast";
import { CopyButton } from "./CopyButton";
import type { ModelResult, Provider } from "../types";

const MODEL_CONFIG_KEY = "ai-modal-model-config";
const MODEL_CONFIG_DB_KEY = "model_config";

type ModelConfigRecord = {
  baseUrl: string;
  apiKey: string;
  model: string;
  lastTestResult?: ModelResult | null;
  lastTestAt?: number | null;
};

function createEmptyModelConfig(): ModelConfigRecord {
  return {
    baseUrl: "",
    apiKey: "",
    model: "",
    lastTestResult: null,
    lastTestAt: null,
  };
}

function getModelConfigResultText(result?: ModelResult | null) {
  if (!result) return "尚未测试";
  return result.response_text?.trim() || result.error || "—";
}

function getConnectionStatus(result?: ModelResult | null) {
  if (!result) return "未测试";
  return result.available ? "已连接" : "连接失败";
}

export function ModelConfigSection({
  providers,
  onDirtyChange,
}: {
  providers: Provider[];
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [selectedAvailableProviderId, setSelectedAvailableProviderId] =
    useState<string>("");
  const [selectedAvailableModelId, setSelectedAvailableModelId] =
    useState<string>("");
  const [modelConfig, setModelConfig] = useState<ModelConfigRecord>(
    createEmptyModelConfig(),
  );
  const [savedModelConfig, setSavedModelConfig] = useState<ModelConfigRecord>(
    createEmptyModelConfig(),
  );
  const [testingModelConfig, setTestingModelConfig] = useState(false);
  const [modelConfigReady, setModelConfigReady] = useState(false);

  const availableProviderOptions = useMemo(() => {
    return providers
      .map((provider) => {
        const models = Array.from(
          new Set(
            (provider.lastResult?.results ?? [])
              .filter((result) => result.available)
              .map((result) => result.model)
              .filter(Boolean),
          ),
        ).map((model) => ({
          id: `${provider.id}::${model}`,
          model,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
        }));

        return models.length > 0
          ? {
              id: provider.id,
              providerName: provider.name,
              availableCount: models.length,
              models,
            }
          : null;
      })
      .filter(Boolean) as {
      id: string;
      providerName: string;
      availableCount: number;
      models: {
        id: string;
        model: string;
        baseUrl: string;
        apiKey: string;
      }[];
    }[];
  }, [providers]);

  const selectedAvailableProvider =
    availableProviderOptions.find(
      (item) => item.id === selectedAvailableProviderId,
    ) ??
    availableProviderOptions[0] ??
    null;

  const selectedAvailableModel =
    selectedAvailableProvider?.models.find(
      (item) => item.id === selectedAvailableModelId,
    ) ??
    selectedAvailableProvider?.models[0] ??
    null;

  const dirty =
    JSON.stringify(modelConfig) !== JSON.stringify(savedModelConfig);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    let active = true;

    async function loadModelConfig() {
      try {
        const raw = await loadPersistedJson<unknown>(
          MODEL_CONFIG_DB_KEY,
          MODEL_CONFIG_KEY,
          createEmptyModelConfig(),
        );
        if (!active) return;

        const parsed = Array.isArray(raw)
          ? (raw[0] ?? createEmptyModelConfig())
          : raw && typeof raw === "object"
            ? raw
            : createEmptyModelConfig();

        const next: ModelConfigRecord = {
          baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
          apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
          model: typeof parsed.model === "string" ? parsed.model : "",
          lastTestResult:
            parsed.lastTestResult && typeof parsed.lastTestResult === "object"
              ? (parsed.lastTestResult as ModelResult)
              : null,
          lastTestAt:
            typeof parsed.lastTestAt === "number" ? parsed.lastTestAt : null,
        };

        setModelConfig(next);
        setSavedModelConfig(next);
      } catch (error) {
        console.error("Failed to load model config", error);
        toast("读取模型配置失败", "error");
      } finally {
        if (active) setModelConfigReady(true);
      }
    }

    void loadModelConfig();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (availableProviderOptions.length === 0) {
      setSelectedAvailableProviderId("");
      setSelectedAvailableModelId("");
      return;
    }

    const providerStillExists = availableProviderOptions.some(
      (item) => item.id === selectedAvailableProviderId,
    );
    if (!providerStillExists) {
      setSelectedAvailableProviderId(availableProviderOptions[0].id);
      setSelectedAvailableModelId(
        availableProviderOptions[0].models[0]?.id ?? "",
      );
      return;
    }

    const currentProvider =
      availableProviderOptions.find(
        (item) => item.id === selectedAvailableProviderId,
      ) ?? availableProviderOptions[0];
    const modelStillExists = currentProvider.models.some(
      (item) => item.id === selectedAvailableModelId,
    );
    if (!modelStillExists) {
      setSelectedAvailableModelId(currentProvider.models[0]?.id ?? "");
    }
  }, [
    availableProviderOptions,
    selectedAvailableProviderId,
    selectedAvailableModelId,
  ]);

  function updateModelConfig(patch: Partial<ModelConfigRecord>) {
    setModelConfig((prev) => ({ ...prev, ...patch }));
  }

  async function handleSaveModelConfig() {
    if (!modelConfigReady) return;
    await savePersistedJson(MODEL_CONFIG_DB_KEY, modelConfig, MODEL_CONFIG_KEY);
    setSavedModelConfig(modelConfig);
    logger.info("[模型配置] 已保存");
    toast("模型配置已保存", "success");
  }

  function handleApplySelectedModel() {
    if (!selectedAvailableModel) return;
    setModelConfig((prev) => ({
      ...prev,
      baseUrl: selectedAvailableModel.baseUrl,
      apiKey: selectedAvailableModel.apiKey,
      model: selectedAvailableModel.model,
    }));
  }

  async function handleTestCurrentModelConfig() {
    if (
      !modelConfig.baseUrl.trim() ||
      !modelConfig.apiKey.trim() ||
      !modelConfig.model.trim()
    )
      return;

    setTestingModelConfig(true);
    logger.info(
      `[模型配置] 开始测试：${modelConfig.baseUrl} / ${modelConfig.model}`,
    );
    try {
      const result = await testModelConfig(
        modelConfig.baseUrl,
        modelConfig.apiKey,
        modelConfig.model,
      );
      updateModelConfig({
        lastTestResult: result,
        lastTestAt: Date.now(),
      });
      if (result.available) {
        logger.success(`[模型配置] 已连接：${modelConfig.model}`);
      } else {
        logger.warn(`[模型配置] 连接失败：${getModelConfigResultText(result)}`);
      }
      toast(
        result.available ? "模型配置测试通过" : "模型配置测试失败",
        result.available ? "success" : "warning",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[模型配置] 测试异常：${message}`);
      updateModelConfig({
        lastTestResult: {
          model: modelConfig.model,
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

  return (
    <section className="mt-6">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-gray-500">
        模型配置
      </h3>
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="mt-4 rounded-xl border border-gray-800/80 bg-black/15 px-3 py-3">
          {availableProviderOptions.length > 0 && selectedAvailableModel ? (
            <>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="min-w-[260px] flex-1">
                  <select
                    value={selectedAvailableProvider?.id ?? ""}
                    onChange={(event) => {
                      const nextProvider =
                        availableProviderOptions.find(
                          (item) => item.id === event.target.value,
                        ) ?? null;
                      setSelectedAvailableProviderId(event.target.value);
                      setSelectedAvailableModelId(
                        nextProvider?.models[0]?.id ?? "",
                      );
                    }}
                    className={FIELD_SELECT_CLASS}
                    aria-label="选择可用模型 Provider"
                  >
                    {availableProviderOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.providerName} ({option.availableCount} 个可用)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[220px] flex-1">
                  <select
                    value={selectedAvailableModel.id}
                    onChange={(event) =>
                      setSelectedAvailableModelId(event.target.value)
                    }
                    className={FIELD_SELECT_CLASS}
                    aria-label="选择 Provider 下的可用模型"
                  >
                    {(selectedAvailableProvider?.models ?? []).map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.model}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleApplySelectedModel}
                  className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
                >
                  应用
                </button>
                <span className="rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-300">
                  {availableProviderOptions.reduce(
                    (total, item) => total + item.availableCount,
                    0,
                  )}{" "}
                  个可用模型
                </span>
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-500">当前没有可用模型。</div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <div className="min-w-[300px] flex-1">
            <input
              value={modelConfig.baseUrl}
              onChange={(event) =>
                updateModelConfig({
                  baseUrl: event.target.value,
                })
              }
              placeholder="https://api.example.com/v1"
              className={FIELD_MONO_INPUT_CLASS}
            />
          </div>
          <CopyButton
            text={modelConfig.baseUrl}
            message="已复制模型配置 Base URL"
          />
          <div className="min-w-[220px] flex-1">
            <input
              value={modelConfig.model}
              onChange={(event) =>
                updateModelConfig({
                  model: event.target.value,
                })
              }
              placeholder="模型名称"
              className={FIELD_MONO_INPUT_CLASS}
            />
          </div>
          <CopyButton text={modelConfig.model} message="已复制模型配置模型名" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <div className="min-w-[320px] flex-1">
            <input
              value={modelConfig.apiKey}
              onChange={(event) =>
                updateModelConfig({
                  apiKey: event.target.value,
                })
              }
              placeholder="sk-..."
              className={FIELD_MONO_INPUT_CLASS}
            />
          </div>
          <CopyButton
            text={modelConfig.apiKey}
            message="已复制模型配置 API Key"
          />
          <button
            onClick={() => void handleSaveModelConfig()}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
          >
            <Save className="h-4 w-4" />
            保存
          </button>
          <button
            onClick={() => void handleTestCurrentModelConfig()}
            disabled={
              testingModelConfig ||
              !modelConfig.baseUrl.trim() ||
              !modelConfig.apiKey.trim() ||
              !modelConfig.model.trim()
            }
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-indigo-500/35 bg-indigo-500/10 px-3 text-sm text-indigo-100 transition-colors hover:border-indigo-300/70 hover:bg-indigo-400/18 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            测试
          </button>
          <span
            className={`rounded-full px-2.5 py-1 text-xs ${
              modelConfig.lastTestResult?.available
                ? "bg-emerald-500/15 text-emerald-300"
                : modelConfig.lastTestResult
                  ? "bg-red-500/15 text-red-300"
                  : "bg-gray-800 text-gray-400"
            }`}
          >
            {getConnectionStatus(modelConfig.lastTestResult)}
          </span>
        </div>
      </div>
    </section>
  );
}
