import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Save,
  WandSparkles,
  X,
} from "lucide-react";
import { testModelConfig } from "../api";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_MD_CLASS,
} from "../lib/buttonStyles";
import {
  buildWritebackUrl,
  inferWritebackKindFromModel,
} from "../lib/providerBaseUrl";
import { loadPersistedJson, savePersistedJson } from "../lib/persistence";
import { FIELD_MONO_INPUT_CLASS, FIELD_SELECT_CLASS } from "../lib/formStyles";
import { logger } from "../lib/devlog";
import { toast } from "../lib/toast";
import {
  getModelProtocolBadgeClass,
  getModelProtocolLabel,
} from "./ProtocolTestUI";
import type {
  LlmRequestKind,
  ModelResult,
  ProtocolTestResult,
  Provider,
} from "../types";

const MODEL_CONFIG_KEY = "ai-modal-model-config";
const MODEL_CONFIG_DB_KEY = "model_config";

const REQUEST_KIND_OPTIONS: {
  value: LlmRequestKind;
  label: string;
  hint: string;
}[] = [
  { value: "openai-chat", label: "OpenAI Chat", hint: "通用兼容格式" },
  {
    value: "openai-responses",
    label: "OpenAI Responses",
    hint: "OpenAI/Azure 专用",
  },
  { value: "claude", label: "Claude", hint: "Anthropic 原生" },
  { value: "gemini", label: "Gemini", hint: "Google 原生" },
];

type ModelConfigRecord = {
  baseUrl: string;
  apiKey: string;
  model: string;
  requestKind: LlmRequestKind;
  lastTestResult?: ModelResult | null;
  lastTestAt?: number | null;
};

function createEmptyModelConfig(): ModelConfigRecord {
  return {
    baseUrl: "",
    apiKey: "",
    model: "",
    requestKind: "openai-chat",
    lastTestResult: null,
    lastTestAt: null,
  };
}

function formatElapsed(ts?: number | null) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHeaders(value?: Record<string, string> | null) {
  if (!value || Object.keys(value).length === 0) return null;
  return JSON.stringify(value, null, 2);
}

function TestResultDebugPanel({
  result,
  expanded,
  onToggle,
}: {
  result: ModelResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const protocolResults = result.protocol_results ?? [];
  const hasProtocols = protocolResults.length > 0;
  const errorSnippet = result.error
    ? result.error.length > 80
      ? result.error.slice(0, 80) + "..."
      : result.error
    : null;

  return (
    <div className="border-t border-gray-800/60">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-gray-800/30"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
        )}
        <span className="text-xs text-gray-500">
          测试详情
          {hasProtocols && (
            <span className="ml-1.5 text-gray-600">
              ({protocolResults.length} 个协议)
            </span>
          )}
          {!hasProtocols && errorSnippet && (
            <span className="ml-2 text-red-400/80">{errorSnippet}</span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="space-y-2 px-4 pb-3">
          {hasProtocols ? (
            protocolResults.map((pr) => (
              <ProtocolDebugCard key={pr.protocol} pr={pr} />
            ))
          ) : (
            <pre className="max-h-40 overflow-auto rounded-lg border border-gray-800 bg-black/20 p-3 text-xs leading-5 text-gray-400 whitespace-pre-wrap break-all">
              {result.response_text?.trim() ||
                result.error ||
                "无返回内容"}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function ProtocolDebugCard({ pr }: { pr: ProtocolTestResult }) {
  const [open, setOpen] = useState(false);
  const responseText = pr.response_text?.trim() || pr.error || "";

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-gray-800/30"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-gray-500" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-gray-500" />
        )}
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${getModelProtocolBadgeClass(pr.protocol)}`}
        >
          {getModelProtocolLabel(pr.protocol)}
        </span>
        <span
          className={`text-xs ${pr.available ? "text-emerald-400" : "text-red-400"}`}
        >
          {pr.available ? "支持" : "不支持"}
        </span>
        {pr.latency_ms != null && (
          <span className="text-[11px] text-gray-500">{pr.latency_ms}ms</span>
        )}
        {pr.response_status != null && (
          <span className="text-[11px] text-gray-600">
            HTTP {pr.response_status}
          </span>
        )}
        {!open && pr.error && (
          <span className="flex-1 truncate text-[11px] text-red-400/70">
            {pr.error}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-gray-800/50 px-3 py-2 space-y-2">
          {/* 关键信息 */}
          <div className="grid gap-1.5 text-xs">
            {pr.request_url && (
              <div className="flex gap-2">
                <span className="shrink-0 w-20 text-gray-600">Request</span>
                <span className="font-mono text-gray-400 break-all">
                  {pr.request_method ?? "POST"} {pr.request_url}
                </span>
              </div>
            )}
            {pr.response_status != null && (
              <div className="flex gap-2">
                <span className="shrink-0 w-20 text-gray-600">Status</span>
                <span
                  className={`font-mono ${pr.response_status < 400 ? "text-gray-400" : "text-red-400"}`}
                >
                  {pr.response_status}
                </span>
              </div>
            )}
            {pr.latency_ms != null && (
              <div className="flex gap-2">
                <span className="shrink-0 w-20 text-gray-600">Latency</span>
                <span className="font-mono text-gray-400">{pr.latency_ms}ms</span>
              </div>
            )}
            {pr.error && (
              <div className="flex gap-2">
                <span className="shrink-0 w-20 text-gray-600">Error</span>
                <span className="text-red-400 break-all">{pr.error}</span>
              </div>
            )}
          </div>

          {/* 详细数据 */}
          <DebugSubSection title="Request Body" value={pr.request_body} />
          <DebugSubSection title="Response Body" value={responseText} />
          <DebugSubSection
            title="Request Headers"
            value={formatHeaders(pr.request_headers)}
          />
          <DebugSubSection
            title="Response Headers"
            value={formatHeaders(pr.response_headers)}
          />
        </div>
      )}
    </div>
  );
}

function DebugSubSection({
  title,
  value,
}: {
  title: string;
  value?: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (!value || value === "—") return null;

  return (
    <div className="rounded border border-gray-800/50 bg-black/15">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-2.5 py-1.5 text-left transition-colors hover:bg-gray-800/20"
      >
        <span className="text-[10px] uppercase tracking-widest text-gray-600">
          {title}
        </span>
        {open ? (
          <ChevronDown className="h-3 w-3 text-gray-600" />
        ) : (
          <ChevronRight className="h-3 w-3 text-gray-600" />
        )}
      </button>
      {open && (
        <div className="border-t border-gray-800/40 px-2.5 py-2">
          <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-5 text-gray-500">
            {value}
          </pre>
        </div>
      )}
    </div>
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
      <div className="w-full max-w-xl rounded-2xl border border-gray-800/90 bg-gray-950/95 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-200">
              <WandSparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">快捷应用</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                从已检测可用的模型中选一个，自动填入配置
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 text-gray-400 transition-colors hover:border-gray-600 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {providerOptions.length > 0 && selectedProvider && selectedModel ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-widest text-gray-500">
                Provider
              </p>
              <select
                value={selectedProvider.id}
                onChange={(e) => onProviderChange(e.target.value)}
                className={FIELD_SELECT_CLASS}
              >
                {providerOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.providerName} ({opt.availableCount} 可用)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-widest text-gray-500">
                Model
              </p>
              <select
                value={selectedModel.id}
                onChange={(e) => onModelChange(e.target.value)}
                className={FIELD_SELECT_CLASS}
              >
                {selectedProvider.models.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.model}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-gray-800 px-3 py-3 text-xs text-gray-500">
            还没有可用模型，请先去模型检测完成测试。
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
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
            <Check className="h-3.5 w-3.5" />
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
  const [testResultExpanded, setTestResultExpanded] = useState(false);

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
          requestKind:
            typeof parsed.requestKind === "string"
              ? (parsed.requestKind as LlmRequestKind)
              : "openai-chat",
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
      toast("已保存", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[LLM 配置] 保存失败：${message}`);
      toast("保存失败", "error");
    }
  }

  function handleApplySelectedModel() {
    if (!selectedAvailableModel) return;
    const kind = inferWritebackKindFromModel(
      selectedAvailableModel.model,
      selectedAvailableModel.supportedProtocols,
    );
    const requestKind: LlmRequestKind =
      kind === "openai" ? "openai-chat" : kind;
    setModelConfig((prev) => ({
      ...prev,
      baseUrl: buildWritebackUrl(selectedAvailableModel.baseUrl, kind),
      apiKey: selectedAvailableModel.apiKey,
      model: selectedAvailableModel.model,
      requestKind,
      lastTestResult: null,
      lastTestAt: null,
    }));
    toast("已填入，请保存", "success");
  }

  async function handleTestCurrentModelConfig() {
    if (
      !modelConfig.baseUrl.trim() ||
      !modelConfig.apiKey.trim() ||
      !modelConfig.model.trim()
    )
      return;

    setTestingModelConfig(true);
    setTestResultExpanded(false);
    logger.info(
      `[LLM 配置] 测试：${modelConfig.baseUrl} / ${modelConfig.model}`,
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
        logger.warn(
          `[LLM 配置] 连接失败：${result.response_text?.trim() || result.error || "未知错误"}`,
        );
      }
      toast(
        result.available ? "测试通过" : "测试失败",
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

  const lastResult = modelConfig.lastTestResult;
  const lastTestAt = modelConfig.lastTestAt;

  return (
    <section className="mt-6">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-gray-500">
        LLM 配置
      </h3>
      <div className="rounded-xl border border-gray-800 bg-gray-900">
        {/* 第一行：请求类型 + URL + Token + Model */}
        <div className="grid gap-3 p-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-widest text-gray-500">
              请求类型
            </label>
            <select
              value={modelConfig.requestKind}
              onChange={(e) =>
                updateModelConfig({
                  requestKind: e.target.value as LlmRequestKind,
                })
              }
              className={FIELD_SELECT_CLASS}
            >
              {REQUEST_KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-widest text-gray-500">
              Base URL
            </label>
            <div className="relative">
              <input
                value={modelConfig.baseUrl}
                onChange={(e) => updateModelConfig({ baseUrl: e.target.value })}
                placeholder="https://api.openai.com"
                className={`${FIELD_MONO_INPUT_CLASS} pr-8`}
              />
              {modelConfig.baseUrl && (
                <button
                  type="button"
                  onClick={() => updateModelConfig({ baseUrl: "" })}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-300"
                  tabIndex={-1}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-widest text-gray-500">
              Token
            </label>
            <div className="relative">
              <input
                type={apiKeyVisible ? "text" : "password"}
                value={modelConfig.apiKey}
                onChange={(e) => updateModelConfig({ apiKey: e.target.value })}
                placeholder="sk-..."
                className={`${FIELD_MONO_INPUT_CLASS} pr-14`}
              />
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                {modelConfig.apiKey && (
                  <button
                    type="button"
                    onClick={() => updateModelConfig({ apiKey: "" })}
                    className="text-gray-500 transition-colors hover:text-gray-300"
                    tabIndex={-1}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setApiKeyVisible((v) => !v)}
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
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-widest text-gray-500">
              Model
            </label>
            <div className="relative">
              <input
                value={modelConfig.model}
                onChange={(e) => updateModelConfig({ model: e.target.value })}
                placeholder="gpt-4.1-mini"
                className={`${FIELD_MONO_INPUT_CLASS} pr-8`}
              />
              {modelConfig.model && (
                <button
                  type="button"
                  onClick={() => updateModelConfig({ model: "" })}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-300"
                  tabIndex={-1}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 第二行：操作按钮 + 状态 */}
        <div className="flex items-center justify-between border-t border-gray-800/60 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuickApplyOpen(true)}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_MD_CLASS}`}
            >
              <WandSparkles className="h-3.5 w-3.5" />
              快捷应用
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* 测试结果状态指示 */}
            {lastResult && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  lastResult.available
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-red-500/15 text-red-300"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    lastResult.available ? "bg-emerald-400" : "bg-red-400"
                  }`}
                />
                {lastResult.available ? "已连接" : "连接失败"}
                {lastResult.latency_ms != null && (
                  <span className="text-gray-500">{lastResult.latency_ms}ms</span>
                )}
                {lastTestAt && (
                  <span className="text-gray-600">
                    {formatElapsed(lastTestAt)}
                  </span>
                )}
              </span>
            )}
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
              {testingModelConfig ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              {testingModelConfig ? "测试中..." : "测试"}
            </button>
            <button
              onClick={() => void handleSaveModelConfig()}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_MD_CLASS}`}
            >
              <Save className="h-3.5 w-3.5" />
              保存
            </button>
          </div>
        </div>

        {/* 测试结果详情（可折叠） */}
        {lastResult && (
          <TestResultDebugPanel
            result={lastResult}
            expanded={testResultExpanded}
            onToggle={() => setTestResultExpanded((v) => !v)}
          />
        )}
      </div>

      {quickApplyOpen && (
        <QuickApplyModal
          providerOptions={availableProviderOptions}
          selectedProviderId={selectedAvailableProvider?.id ?? ""}
          selectedModelId={selectedAvailableModel?.id ?? ""}
          onProviderChange={(value) => {
            const nextProvider =
              availableProviderOptions.find((item) => item.id === value) ??
              null;
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
