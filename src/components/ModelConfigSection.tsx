import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, Save, X } from "lucide-react";
import { testModelConfig } from "../api";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_MD_CLASS,
} from "../lib/buttonStyles";
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

function maskPreviewText(value: string) {
  if (!value) return "—";
  if (value.length <= 4) return `${value.slice(0, 1)}******${value.slice(-1)}`;
  return `${value.slice(0, 2)}******${value.slice(-2)}`;
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
  const [helperExpanded, setHelperExpanded] = useState(false);
  const [shortcutExpanded, setShortcutExpanded] = useState(false);

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
    try {
      await savePersistedJson(
        MODEL_CONFIG_DB_KEY,
        modelConfig,
        MODEL_CONFIG_KEY,
      );
      setSavedModelConfig(modelConfig);
      logger.info("[模型配置] 已保存");
      toast("模型配置已保存", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[模型配置] 保存失败：${message}`);
      toast("模型配置保存失败", "error");
    }
  }

  function handleApplySelectedModel() {
    if (!selectedAvailableModel) return;
    setModelConfig((prev) => ({
      ...prev,
      baseUrl: selectedAvailableModel.baseUrl,
      apiKey: selectedAvailableModel.apiKey,
      model: selectedAvailableModel.model,
      lastTestResult: null,
      lastTestAt: null,
    }));
    toast(
      `已带入模型：${selectedAvailableModel.model}，请点击“保存”完成持久化`,
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
        <div className="rounded-xl border border-indigo-500/15 bg-indigo-500/5">
          <button
            onClick={() => setHelperExpanded((prev) => !prev)}
            className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
          >
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-gray-100">
                  Base URL 支持常见 OpenAI 兼容写法
                </p>
                <HintTooltip content="支持根地址、/v1、/v1/models、/chat/completions，系统会自动归一化。" />
              </div>
            </div>
            <span className="flex items-center gap-2 text-xs text-gray-400">
              {helperExpanded ? "收起" : "展开"}
              {helperExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </span>
          </button>

          {helperExpanded && (
            <div className="border-t border-indigo-500/10 px-3 pb-3">
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-400">
                <span className="rounded-full border border-gray-700 bg-gray-950/60 px-2.5 py-1 font-mono">
                  https://api.openai.com
                </span>
                <span className="rounded-full border border-gray-700 bg-gray-950/60 px-2.5 py-1 font-mono">
                  https://openrouter.ai/api
                </span>
                <span className="rounded-full border border-gray-700 bg-gray-950/60 px-2.5 py-1 font-mono">
                  https://your-gateway.example.com/v1/models
                </span>
              </div>

              <div className="mt-4 rounded-xl border border-gray-800/80 bg-gray-950/30 px-4 py-4">
                <button
                  type="button"
                  onClick={() => setShortcutExpanded((prev) => !prev)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-100">
                        可用模型快捷选择
                      </p>
                      <HintTooltip content="从已检测可用的 Provider 和模型中一键带入当前配置。" />
                    </div>
                  </div>
                  <span className="flex items-center gap-2 rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-300">
                    {availableProviderOptions.reduce(
                      (total, item) => total + item.availableCount,
                      0,
                    )}{" "}
                    个可用模型
                    {shortcutExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </span>
                </button>

                {shortcutExpanded && (
                  <div className="mt-3 border-t border-gray-800 pt-3">
                    {availableProviderOptions.length > 0 &&
                    selectedAvailableModel ? (
                      <>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-gray-500">
                              Provider
                            </p>
                            <select
                              value={selectedAvailableProvider?.id ?? ""}
                              onChange={(event) => {
                                const nextProvider =
                                  availableProviderOptions.find(
                                    (item) => item.id === event.target.value,
                                  ) ?? null;
                                setSelectedAvailableProviderId(
                                  event.target.value,
                                );
                                setSelectedAvailableModelId(
                                  nextProvider?.models[0]?.id ?? "",
                                );
                              }}
                              className={FIELD_SELECT_CLASS}
                              aria-label="选择可用模型 Provider"
                            >
                              {availableProviderOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.providerName} ({option.availableCount}{" "}
                                  个可用)
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-gray-500">
                              模型
                            </p>
                            <select
                              value={selectedAvailableModel.id}
                              onChange={(event) =>
                                setSelectedAvailableModelId(event.target.value)
                              }
                              className={FIELD_SELECT_CLASS}
                              aria-label="选择 Provider 下的可用模型"
                            >
                              {(selectedAvailableProvider?.models ?? []).map(
                                (option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.model}
                                  </option>
                                ),
                              )}
                            </select>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <div className="rounded-xl border border-gray-800 bg-black/15 px-3 py-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                              模型名
                            </p>
                            <div className="mt-2 flex items-center gap-1.5">
                              <span className="truncate font-mono text-xs text-gray-200">
                                {selectedAvailableModel.model}
                              </span>
                              <CopyButton
                                text={selectedAvailableModel.model}
                                message="已复制模型名"
                              />
                            </div>
                          </div>
                          <div className="rounded-xl border border-gray-800 bg-black/15 px-3 py-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                              Base URL
                            </p>
                            <div className="mt-2 flex items-center gap-1.5">
                              <span className="truncate font-mono text-xs text-gray-200">
                                {maskPreviewText(
                                  selectedAvailableModel.baseUrl,
                                )}
                              </span>
                              <CopyButton
                                text={selectedAvailableModel.baseUrl}
                                message="已复制 Base URL"
                              />
                            </div>
                          </div>
                          <div className="rounded-xl border border-gray-800 bg-black/15 px-3 py-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                              API Key
                            </p>
                            <div className="mt-2 flex items-center gap-1.5">
                              <span className="truncate font-mono text-xs text-gray-200">
                                {maskKey(selectedAvailableModel.apiKey)}
                              </span>
                              <CopyButton
                                text={selectedAvailableModel.apiKey}
                                message="已复制 API Key"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                          <span className="rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-1 text-indigo-100">
                            {selectedAvailableProvider?.providerName}
                          </span>
                          <HintTooltip content="当前来自可用检测结果。" />
                          <button
                            onClick={handleApplySelectedModel}
                            className="inline-flex h-9 items-center rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
                          >
                            应用到当前配置
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-xl border border-dashed border-gray-800 bg-black/10 px-4 py-4 text-sm text-gray-500">
                        当前还没有可用模型。请先去模型列表或详情页完成检测。
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[300px] flex-1">
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
                label="清空模型配置 Base URL"
              />
            )}
          </div>
          <CopyButton
            text={modelConfig.baseUrl}
            message="已复制模型配置 Base URL"
          />
          <div className="relative min-w-[220px] flex-1">
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
                label="清空模型配置模型名"
              />
            )}
          </div>
          <CopyButton text={modelConfig.model} message="已复制模型配置模型名" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <div className="relative w-full min-w-[220px] flex-1 sm:w-[240px] sm:flex-none">
            <input
              type={apiKeyVisible ? "text" : "password"}
              value={modelConfig.apiKey}
              onChange={(event) =>
                updateModelConfig({
                  apiKey: event.target.value,
                })
              }
              placeholder="sk-..."
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
                  aria-label="清空模型配置 API Key"
                  title="清空模型配置 API Key"
                  className="text-gray-500 transition-colors hover:text-gray-300"
                  tabIndex={-1}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setApiKeyVisible((visible) => !visible)}
                aria-label={
                  apiKeyVisible
                    ? "隐藏模型配置 API Key"
                    : "显示模型配置 API Key"
                }
                title={
                  apiKeyVisible
                    ? "隐藏模型配置 API Key"
                    : "显示模型配置 API Key"
                }
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
          <CopyButton
            text={modelConfig.apiKey}
            message="已复制模型配置 API Key"
          />
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
