import { useState } from "react";
import { Check, WandSparkles, Key, Eye, EyeOff, Trash2 } from "lucide-react";
import { FIELD_SELECT_CLASS } from "@/lib/formStyles";
import {
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "@/lib/buttonStyles";
import {
  CLAUDE_ENV_MODEL_FIELDS,
  CLAUDE_ENV_MODEL_FIELD_LABELS,
  SNOW_REQUEST_METHOD_LABELS,
} from "./constants";
import type { ClaudeEnvModelField, SnowRequestMethod } from "./constants";

// ─── shared ───

export function SelectionCheckbox({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
        checked
          ? "border-indigo-500 bg-indigo-600 text-white"
          : "border-gray-600 bg-gray-800 text-transparent hover:border-indigo-500/60"
      }`}
    >
      <Check className="h-3 w-3" strokeWidth={3} />
    </button>
  );
}

// ─── Claude ───

export function ClaudeApplyModal({
  providerName,
  availableModels,
  selection,
  onChange,
  onConfirm,
  onCancel,
}: {
  providerName: string;
  availableModels: string[];
  selection: Record<ClaudeEnvModelField, string>;
  onChange: (field: ClaudeEnvModelField, value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-gray-800/90 bg-gray-950/95 p-6 shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-200">
            <WandSparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold tracking-tight text-white">
              应用到 Claude settings.json
            </h3>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              为当前 Provider 选择 Claude 的模型映射。当前只更新草稿，不会直接保存到磁盘。
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-gray-800 bg-black/15 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
            Provider
          </p>
          <p className="mt-2 truncate text-sm font-medium text-gray-200">
            {providerName}
          </p>
        </div>

        <div className="mt-5 space-y-2 rounded-2xl border border-gray-800 bg-black/15 px-4 py-4">
          {CLAUDE_ENV_MODEL_FIELDS.map((field) => (
            <div
              key={field}
              className="grid items-center gap-2 md:grid-cols-[120px_minmax(0,1fr)]"
            >
              <p className="text-sm font-medium text-gray-300">
                {CLAUDE_ENV_MODEL_FIELD_LABELS[field]}
              </p>
              {availableModels.length > 0 ? (
                <select
                  value={selection[field]}
                  onChange={(event) => onChange(field, event.target.value)}
                  className={FIELD_SELECT_CLASS}
                  aria-label={`选择 ${field}`}
                >
                  {availableModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={selection[field]}
                  onChange={(event) => onChange(field, event.target.value)}
                  placeholder="手动输入模型名称"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2 text-sm text-gray-200 outline-none focus:border-indigo-500/50"
                  aria-label={`输入 ${field}`}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              )}
            </div>
          ))}
          {availableModels.length === 0 && (
            <p className="text-xs text-amber-400">
              无法从 API 获取模型列表，请手动输入模型名称
            </p>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            应用到草稿
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Codex ───

export function CodexApplyModal({
  providerName,
  availableModels,
  selectedModel,
  onChange,
  onConfirm,
  onConfirmAndSave,
  onCancel,
  apiKey,
  onApiKeyChange,
  onSaveApiKey,
  onRemoveApiKey,
  isSavingKey,
}: {
  providerName: string;
  availableModels: string[];
  selectedModel: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onConfirmAndSave: () => void;
  onCancel: () => void;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  onSaveApiKey: () => void;
  onRemoveApiKey: () => void;
  isSavingKey: boolean;
}) {
  const [showKey, setShowKey] = useState(false);
  const hasExistingKey = apiKey.startsWith("sk-") && apiKey.length > 20;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
      <div className="flex h-[min(720px,88vh)] w-full max-w-xl flex-col rounded-3xl border border-gray-800/90 bg-gray-950/95 p-6 shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-200">
            <WandSparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold tracking-tight text-white">
              应用到 Codex 配置
            </h3>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              选择当前 Provider 要写入 Codex 的模型。当前只更新草稿，不会直接保存到磁盘。
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-gray-800 bg-black/15 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
            Provider
          </p>
          <p className="mt-2 truncate text-sm font-medium text-gray-200">
            {providerName}
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-gray-800 bg-black/15 px-4 py-4">
          <div className="grid items-center gap-2 md:grid-cols-[80px_minmax(0,1fr)]">
            <p className="text-sm font-medium text-gray-300">模型</p>
            {availableModels.length > 0 ? (
              <select
                value={selectedModel}
                onChange={(event) => onChange(event.target.value)}
                className={FIELD_SELECT_CLASS}
                aria-label="选择 Codex 模型"
              >
                {availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={selectedModel}
                onChange={(event) => onChange(event.target.value)}
                placeholder="手动输入模型名称，如: gpt-4o"
                className="w-full rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2 text-sm text-gray-200 outline-none focus:border-cyan-500/50"
                aria-label="输入 Codex 模型"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            )}
          </div>
          {availableModels.length === 0 && (
            <p className="mt-2 text-xs text-amber-400">
              无法从 API 获取模型列表，请手动输入模型名称
            </p>
          )}
        </div>

        {/* CODEX_API_KEY 配置 */}
        <div className="mt-5 rounded-2xl border border-gray-800 bg-black/15 px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Key className="h-4 w-4 text-cyan-400" />
            <p className="text-sm font-medium text-gray-200">CODEX_API_KEY</p>
            {hasExistingKey && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                已配置
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-3">
            将 API Key 写入 ~/.zshrc，Codex CLI 启动时会自动读取
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder="sk-..."
                className="w-full rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2 pr-10 text-sm text-gray-200 outline-none focus:border-cyan-500/50"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <button
              onClick={onSaveApiKey}
              disabled={isSavingKey || !apiKey.trim()}
              className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS} whitespace-nowrap`}
            >
              {isSavingKey ? "保存中..." : hasExistingKey ? "更新" : "保存"}
            </button>
            {hasExistingKey && (
              <button
                onClick={onRemoveApiKey}
                disabled={isSavingKey}
                className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS} px-2`}
                title="删除"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            仅应用到草稿
          </button>
          <button
            onClick={onConfirmAndSave}
            disabled={isSavingKey || !apiKey.trim()}
            className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            {isSavingKey ? "保存中..." : "应用并保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Gemini ───

export function GeminiApplyModal({
  providerName,
  availableModels,
  selectedModel,
  onChange,
  onConfirm,
  onCancel,
}: {
  providerName: string;
  availableModels: string[];
  selectedModel: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
      <div className="flex h-[min(720px,88vh)] w-full max-w-xl flex-col rounded-3xl border border-gray-800/90 bg-gray-950/95 p-6 shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-200">
            <WandSparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold tracking-tight text-white">
              应用到 Gemini 配置
            </h3>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              选择当前 Provider 要写入 Gemini 的模型。当前会同时更新
              .settings.json 与 .env 草稿，不会直接保存到磁盘。
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-gray-800 bg-black/15 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
            Provider
          </p>
          <p className="mt-2 truncate text-sm font-medium text-gray-200">
            {providerName}
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-gray-800 bg-black/15 px-4 py-4">
          <div className="grid items-center gap-2 md:grid-cols-[80px_minmax(0,1fr)]">
            <p className="text-sm font-medium text-gray-300">模型</p>
            {availableModels.length > 0 ? (
              <select
                value={selectedModel}
                onChange={(event) => onChange(event.target.value)}
                className={FIELD_SELECT_CLASS}
                aria-label="选择 Gemini 模型"
              >
                {availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={selectedModel}
                onChange={(event) => onChange(event.target.value)}
                placeholder="手动输入模型名称，如: gemini-1.5-pro"
                className="w-full rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2 text-sm text-gray-200 outline-none focus:border-fuchsia-500/50"
                aria-label="输入 Gemini 模型"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            )}
          </div>
          {availableModels.length === 0 && (
            <p className="mt-2 text-xs text-amber-400">
              无法从 API 获取模型列表，请手动输入模型名称
            </p>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            应用到草稿
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Snow ───

export function SnowApplyModal({
  providerName,
  availableModels,
  requestMethods,
  selectedRequestMethod,
  selectedAdvancedModel,
  selectedBasicModel,
  onRequestMethodChange,
  onAdvancedModelChange,
  onBasicModelChange,
  onConfirm,
  onCancel,
}: {
  providerName: string;
  availableModels: string[];
  requestMethods: SnowRequestMethod[];
  selectedRequestMethod: SnowRequestMethod;
  selectedAdvancedModel: string;
  selectedBasicModel: string;
  onRequestMethodChange: (value: SnowRequestMethod) => void;
  onAdvancedModelChange: (value: string) => void;
  onBasicModelChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
      <div className="flex h-[min(720px,88vh)] w-full max-w-2xl flex-col rounded-3xl border border-gray-800/90 bg-gray-950/95 p-6 shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-sky-500/25 bg-sky-500/10 text-sky-100">
            <WandSparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold tracking-tight text-white">
              应用到 Snow 配置
            </h3>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              选择 Snow 的请求模式与模型映射。当前只更新 config.json 草稿，不会直接保存到磁盘。
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-gray-800 bg-black/15 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
            Provider
          </p>
          <p className="mt-2 truncate text-sm font-medium text-gray-200">
            {providerName}
          </p>
        </div>

        <div className="mt-5 space-y-3 rounded-2xl border border-gray-800 bg-black/15 px-4 py-4">
          <div className="grid items-center gap-2 md:grid-cols-[120px_minmax(0,1fr)]">
            <p className="text-sm font-medium text-gray-300">请求模式</p>
            <select
              value={selectedRequestMethod}
              onChange={(event) =>
                onRequestMethodChange(event.target.value as SnowRequestMethod)
              }
              className={FIELD_SELECT_CLASS}
              aria-label="选择 Snow 请求模式"
            >
              {requestMethods.map((method) => (
                <option key={method} value={method}>
                  {SNOW_REQUEST_METHOD_LABELS[method]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid items-center gap-2 md:grid-cols-[120px_minmax(0,1fr)]">
            <p className="text-sm font-medium text-gray-300">高级模型</p>
            {availableModels.length > 0 ? (
              <select
                value={selectedAdvancedModel}
                onChange={(event) => onAdvancedModelChange(event.target.value)}
                className={FIELD_SELECT_CLASS}
                aria-label="选择 Snow advancedModel"
              >
                {availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={selectedAdvancedModel}
                onChange={(event) => onAdvancedModelChange(event.target.value)}
                placeholder="手动输入模型名称"
                className="w-full rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2 text-sm text-gray-200 outline-none focus:border-sky-500/50"
                aria-label="输入 Snow advancedModel"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            )}
          </div>

          <div className="grid items-center gap-2 md:grid-cols-[120px_minmax(0,1fr)]">
            <p className="text-sm font-medium text-gray-300">基础模型</p>
            {availableModels.length > 0 ? (
              <select
                value={selectedBasicModel}
                onChange={(event) => onBasicModelChange(event.target.value)}
                className={FIELD_SELECT_CLASS}
                aria-label="选择 Snow basicModel"
              >
                {availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={selectedBasicModel}
                onChange={(event) => onBasicModelChange(event.target.value)}
                placeholder="手动输入模型名称"
                className="w-full rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2 text-sm text-gray-200 outline-none focus:border-sky-500/50"
                aria-label="输入 Snow basicModel"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            )}
          </div>
          {availableModels.length === 0 && (
            <p className="text-xs text-amber-400">
              无法从 API 获取模型列表，请手动输入模型名称
            </p>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            应用到草稿
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── OpenCode ───

export function OpenCodeApplyModal({
  providerName,
  models,
  selectedModels,
  onToggle,
  onConfirm,
  onCancel,
}: {
  providerName: string;
  models: string[];
  selectedModels: string[];
  onToggle: (model: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-3xl border border-gray-800/90 bg-gray-950/95 p-6 shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10 text-amber-200">
            <WandSparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold tracking-tight text-white">
              应用到 OpenCode 配置
            </h3>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              选择要接入当前 Provider 的模型。当前只更新草稿，不会直接保存到磁盘。
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-gray-800 bg-black/15 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
            Provider
          </p>
          <p className="mt-2 truncate text-sm font-medium text-gray-200">
            {providerName}
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-gray-800 bg-black/15 px-4 py-4">
          <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
            {models.map((model) => {
              const checked = selectedModels.includes(model);
              return (
                <label
                  key={model}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-gray-900/60"
                >
                  <SelectionCheckbox
                    checked={checked}
                    onToggle={() => onToggle(model)}
                  />
                  <span className="font-mono text-sm">{model}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            应用到草稿
          </button>
        </div>
      </div>
    </div>
  );
}
