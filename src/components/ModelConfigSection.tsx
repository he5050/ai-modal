import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Save, WandSparkles, X } from "lucide-react";
import { testModelConfig } from "../api";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_MD_CLASS,
} from "../lib/buttonStyles";
import {
  buildOpenAiCompatibleWritebackUrl,
  buildWritebackUrl,
  inferWritebackKindFromModel,
} from "../lib/providerBaseUrl";
import { loadPersistedJson, savePersistedJson } from "../lib/persistence";
import { FIELD_MONO_INPUT_CLASS, FIELD_SELECT_CLASS } from "../lib/formStyles";
import { logger } from "../lib/devlog";
import { toast } from "../lib/toast";
import { CopyButton } from "./CopyButton";
import { HintTooltip } from "./HintTooltip";
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

function maskKey(key: string) {
  if (!key) return "—";
  if (key.length <= 4) return "*".repeat(key.length);
  return key.slice(0, 2) + "******" + key.slice(-2);
}

function ClearInputButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-300"
      tabIndex={-1}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

function QuickApplyModal({
  providerOptions,
  selectedProviderId,
  selectedModelId,
  onProviderChange,
  onModelChange,
  onConfirm,
  onCancel,
}: {
  providerOptions: {
    id: string;
    providerName: string;
    availableCount: number;
    models: {
      id: string;
      model: string;
      baseUrl: string;
      apiKey: string;
      supportedProtocols: string[];
    }[];
  }[];
  selectedProviderId: string;
  selectedModelId: string;
  onProviderChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const selectedProvider =
    providerOptions.find((item) => item.id === selectedProviderId) ??
    providerOptions[0] ??
    null;
  const selectedModel =
    selectedProvider?.models.find((item) => item.id === selectedModelId) ??
    selectedProvider?.models[0] ??
    null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-gray-800/90 bg-gray-950/95 p-6 shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-200">
            <WandSparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold tracking-tight text-white">
              快捷应用
            </h3>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              选择一个可用模型，应用后会自动带入该模型对应的 URL、Token 和 Model。
            </p>
          </div>
        </div>

        {providerOptions.length > 0 && selectedProvider && selectedModel ? (
          <>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-gray-500">
                  Provider
                </p>
                <select
                  value={selectedProvider.id}
                  onChange={(event) => onProviderChange(event.target.value)}
                  className={FIELD_SELECT_CLASS}
                  aria-label="选择可用 Provider"
                >
                  {providerOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.providerName} ({option.availableCount} 个可用)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-gray-500">
                  Model
                </p>
                <select
                  value={selectedModel.id}
                  onChange={(event) => onModelChange(event.target.value)}
                  className={FIELD_SELECT_CLASS}
                  aria-label="选择 Provider 下的可用模型"
                >
                  {selectedProvider.models.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.model}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-gray-800 bg-black/10 px-4 py-4 text-sm text-gray-500">
            当前还没有可用模型。请先去模型列表或详情页完成检测。
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_MD_CLASS}`}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={!selectedModel}
            className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_MD_CLASS}`}
          >
            应用
          </button>
        </div>
      </div>
    </div>
  );
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
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [testingModelConfig, setTestingModelConfig] = useState(false);
  const [modelConfigReady, setModelConfigReady] = useState(false);
  const [quickApplyOpen, setQuickApplyOpen] = useState(false);

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
        ).map((model) => {
          const result = (provider.lastResult?.results ?? []).find(
            (item) => item.available && item.model === model,
          );
          return {
            id: `${provider.id}::${model}`,
            model,
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            supportedProtocols: result?.supported_protocols ?? [],
          };
        });

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
        supportedProtocols: string[];
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
    try {
      await savePersistedJson(
        MODEL_CONFIG_DB_KEY,
        modelConfig,
        MODEL_CONFIG_KEY,
      );
      setSavedModelConfig(modelConfig);
      logger.info("[LLM 配置] 已保存");
      toast("LLM 配置已保存", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[LLM 配置] 保存失败：${message}`);
      toast("LLM 配置保存失败", "error");
    }
  }

  function handleApplySelectedModel() {
    if (!selectedAvailableModel) return;
    setModelConfig((prev) => ({
      ...prev,
      baseUrl: buildOpenAiCompatibleWritebackUrl(
        selectedAvailableModel.baseUrl,
      ),
      apiKey: selectedAvailableModel.apiKey,
      model: selectedAvailableModel.model,
      lastTestResult: null,
      lastTestAt: null,
    }));
    toast(
      `已带入 LLM：${selectedAvailableModel.model}，请点击“保存”完成持久化`,
      "success",
    );
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
      `[LLM 配置] 开始测试：${modelConfig.baseUrl} / ${modelConfig.model}`,
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
        logger.success(`[LLM 配置] 已连接：${modelConfig.model}`);
      } else {
        logger.warn(`[LLM 配置] 连接失败：${getModelConfigResultText(result)}`);
      }
      toast(
        result.available ? "LLM 配置测试通过" : "LLM 配置测试失败",
        result.available ? "success" : "warning",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[LLM 配置] 测试异常：${message}`);
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
        LLM 配置
      </h3>
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="mb-3 flex items-center gap-1.5 text-sm text-gray-300">
          <span>LLM URL 支持常见 OpenAI 兼容写法</span>
          <HintTooltip content="支持根地址、/v1、/v1/models、/chat/completions，系统会自动归一化。" />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 xl:flex-nowrap">
          <div className="relative min-w-[280px] flex-1">
            <input
              value={modelConfig.baseUrl}
              onChange={(event) =>
                updateModelConfig({
                  baseUrl: event.target.value,
                })
              }
              placeholder="例如：https://openrouter.ai/api"
              className={`${FIELD_MONO_INPUT_CLASS} pr-8`}
            />
            {modelConfig.baseUrl && (
              <ClearInputButton
                onClick={() =>
                  updateModelConfig({
                    baseUrl: "",
                  })
                }
                label="清空 LLM URL"
              />
            )}
          </div>
          <div className="relative min-w-[220px] flex-1 xl:max-w-[260px]">
            <input
              type={apiKeyVisible ? "text" : "password"}
              value={modelConfig.apiKey}
              onChange={(event) =>
                updateModelConfig({
                  apiKey: event.target.value,
                })
              }
              placeholder="Token"
              className={`${FIELD_MONO_INPUT_CLASS} pr-16`}
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
              {modelConfig.apiKey && (
                <button
                  type="button"
                  onClick={() =>
                    updateModelConfig({
                      apiKey: "",
                    })
                  }
                  aria-label="清空 LLM Token"
                  title="清空 LLM Token"
                  className="text-gray-500 transition-colors hover:text-gray-300"
                  tabIndex={-1}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setApiKeyVisible((visible) => !visible)}
                aria-label={apiKeyVisible ? "隐藏 LLM Token" : "显示 LLM Token"}
                title={apiKeyVisible ? "隐藏 LLM Token" : "显示 LLM Token"}
                className="text-gray-500 transition-colors hover:text-gray-300"
              >
                {apiKeyVisible ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <div className="relative min-w-[220px] flex-1 xl:max-w-[260px]">
            <input
              value={modelConfig.model}
              onChange={(event) =>
                updateModelConfig({
                  model: event.target.value,
                })
              }
              placeholder="模型名称"
              className={`${FIELD_MONO_INPUT_CLASS} pr-8`}
            />
            {modelConfig.model && (
              <ClearInputButton
                onClick={() =>
                  updateModelConfig({
                    model: "",
                  })
                }
                label="清空 LLM Model"
              />
            )}
          </div>
          <button
            onClick={() => void handleSaveModelConfig()}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_MD_CLASS}`}
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
            className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_MD_CLASS}`}
          >
            测试
          </button>
          <button
            onClick={() => setQuickApplyOpen(true)}
            className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_MD_CLASS}`}
          >
            快捷应用
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
      {quickApplyOpen && (
        <QuickApplyModal
          providerOptions={availableProviderOptions}
          selectedProviderId={selectedAvailableProvider?.id ?? ""}
          selectedModelId={selectedAvailableModel?.id ?? ""}
          onProviderChange={(value) => {
            const nextProvider =
              availableProviderOptions.find((item) => item.id === value) ?? null;
            setSelectedAvailableProviderId(value);
            setSelectedAvailableModelId(nextProvider?.models[0]?.id ?? "");
          }}
          onModelChange={(value) => {
            setSelectedAvailableModelId(value);
          }}
          onConfirm={() => {
            handleApplySelectedModel();
            setQuickApplyOpen(false);
          }}
          onCancel={() => setQuickApplyOpen(false)}
        />
      )}
    </section>
  );
}
