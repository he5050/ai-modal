import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage, foldService } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { toml as tomlMode } from "@codemirror/legacy-modes/mode/toml";
import { dirname, homeDir } from "@tauri-apps/api/path";
import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { testModelConfig } from "../api";
import { loadPersistedJson, savePersistedJson } from "../lib/persistence";
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  FolderOpen,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { FIELD_MONO_INPUT_CLASS, FIELD_SELECT_CLASS } from "../lib/formStyles";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_DANGER_OUTLINE_CLASS,
  BUTTON_GHOST_CLASS,
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_MD_CLASS,
  BUTTON_SIZE_SM_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../lib/buttonStyles";
import {
  formatConfigContent,
  getSupportedConfigFormatsLabel,
  isSupportedConfigFormat,
} from "../lib/configFormatter";
import {
  buildConfigGroups,
  inferConfigFormatFromPath,
  normalizeGroupRelativePath,
  resolveGroupAbsolutePath,
} from "../lib/configGroups";
import { toast } from "../lib/toast";
import { CopyButton } from "./CopyButton";
import { HintTooltip } from "./HintTooltip";
import type {
  ConfigFormat,
  ConfigGroupId,
  ConfigPath,
  ModelResult,
  Provider,
} from "../types";

interface Props {
  providers: Provider[];
  storedPaths: ConfigPath[];
  onUpsertPath: (path: ConfigPath) => void;
  onDeletePath: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

interface ModelConfigRecord {
  id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  lastTestResult?: ModelResult | null;
  lastTestAt?: number | null;
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

interface ConfirmModalProps {
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel?: string;
  tertiaryLabel?: string;
  emphasisText?: string;
  primaryTone?: "danger" | "default";
  onPrimary: () => void;
  onSecondary?: () => void;
  onTertiary?: () => void;
}

type ClaudeEnvModelField =
  | "ANTHROPIC_MODEL"
  | "ANTHROPIC_DEFAULT_HAIKU_MODEL"
  | "ANTHROPIC_DEFAULT_SONNET_MODEL"
  | "ANTHROPIC_DEFAULT_OPUS_MODEL";

const MODEL_CONFIGS_KEY = "ai-modal-model-configs";
const MODEL_CONFIGS_DB_KEY = "model_configs";
const CLAUDE_ENV_MODEL_FIELDS: ClaudeEnvModelField[] = [
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
];
const CLAUDE_ENV_MODEL_FIELD_LABELS: Record<ClaudeEnvModelField, string> = {
  ANTHROPIC_MODEL: "主模型",
  ANTHROPIC_DEFAULT_HAIKU_MODEL: "Haiku 默认模型",
  ANTHROPIC_DEFAULT_SONNET_MODEL: "Sonnet 默认模型",
  ANTHROPIC_DEFAULT_OPUS_MODEL: "Opus 默认模型",
};

const configEditorTheme = EditorView.theme(
  {
    "&": {
      height: "520px",
      borderRadius: "1rem",
      border: "1px solid rgba(31, 41, 55, 1)",
      backgroundColor: "rgb(3 7 18)",
      overflow: "hidden",
    },
    "&.cm-focused": {
      outline: "none",
      borderColor: "rgb(99 102 241)",
    },
    ".cm-scroller": {
      height: "100%",
      overflow: "auto",
      scrollbarWidth: "thin",
      scrollbarColor: "rgba(75, 85, 99, 0.9) rgba(17, 24, 39, 0.9)",
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
    },
    ".cm-scroller::-webkit-scrollbar": {
      width: "10px",
      height: "10px",
    },
    ".cm-scroller::-webkit-scrollbar-track": {
      backgroundColor: "rgba(17, 24, 39, 0.92)",
    },
    ".cm-scroller::-webkit-scrollbar-thumb": {
      backgroundColor: "rgba(75, 85, 99, 0.9)",
      borderRadius: "999px",
      border: "2px solid rgba(17, 24, 39, 0.92)",
    },
    ".cm-scroller::-webkit-scrollbar-thumb:hover": {
      backgroundColor: "rgba(99, 102, 241, 0.72)",
    },
    ".cm-scroller::-webkit-scrollbar-corner": {
      backgroundColor: "rgba(17, 24, 39, 0.92)",
    },
    ".cm-gutters": {
      backgroundColor: "rgb(3 7 18)",
      borderRight: "1px solid rgba(31, 41, 55, 0.8)",
      color: "rgb(75 85 99)",
    },
    ".cm-content": {
      padding: "16px",
      caretColor: "#f8fafc",
      fontSize: "13px",
      lineHeight: "1.75",
      color: "rgb(229 231 235)",
    },
    ".cm-placeholder": {
      color: "rgb(75 85 99)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "rgb(129 140 248)",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(99, 102, 241, 0.08)",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(99, 102, 241, 0.28) !important",
    },
  },
  { dark: true },
);

const tomlLanguage = StreamLanguage.define(tomlMode);
const tomlSectionHeaderPattern = /^\[\[?.+\]\]?$/;
const tomlFoldExtension = foldService.of((state, lineStart) => {
  const currentLine = state.doc.lineAt(lineStart);
  const currentText = currentLine.text.trim();
  if (!tomlSectionHeaderPattern.test(currentText)) return null;

  let lastContentLine = currentLine.number;
  for (
    let lineNumber = currentLine.number + 1;
    lineNumber <= state.doc.lines;
    lineNumber += 1
  ) {
    const line = state.doc.line(lineNumber);
    const text = line.text.trim();
    if (tomlSectionHeaderPattern.test(text)) break;
    if (text.length > 0) lastContentLine = lineNumber;
  }

  if (lastContentLine === currentLine.number) return null;
  return {
    from: currentLine.to,
    to: state.doc.line(lastContentLine).to,
  };
});

function getConfigLanguageExtensions(format: ConfigFormat) {
  switch (format) {
    case "toml":
      return [tomlLanguage, tomlFoldExtension];
    case "yaml":
      return [yaml()];
    case "xml":
      return [xml()];
    case "json":
    default:
      return [json()];
  }
}

async function detectExists(path: string) {
  try {
    return await exists(path);
  } catch {
    return false;
  }
}

function normalizeText(value: string) {
  return value.trim();
}

function toDisplayPath(value: string, homePath: string) {
  return value.startsWith(homePath)
    ? `~${value.slice(homePath.length)}`
    : value;
}

function createEmptyModelConfig(): ModelConfigRecord {
  return {
    id: `model-config-${Date.now()}`,
    baseUrl: "",
    apiKey: "",
    model: "",
    lastTestResult: null,
    lastTestAt: null,
  };
}

function getModelConfigLabel(config: ModelConfigRecord) {
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

function getModelConfigResultText(result?: ModelResult | null) {
  if (!result) return "尚未测试";
  return result.response_text?.trim() || result.error || "—";
}

function buildClaudeModelGuessMap(
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

function ConfirmModal({
  title,
  description,
  primaryLabel,
  secondaryLabel,
  tertiaryLabel,
  emphasisText,
  primaryTone = "default",
  onPrimary,
  onSecondary,
  onTertiary,
}: ConfirmModalProps) {
  const primaryButtonClass =
    primaryTone === "danger"
      ? BUTTON_DANGER_OUTLINE_CLASS
      : BUTTON_PRIMARY_CLASS;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-gray-800/90 bg-gray-950/95 p-6 shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10 text-amber-300">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold tracking-tight text-white">
              {title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-gray-400">{description}</p>
          </div>
        </div>

        {emphasisText && (
          <div className="mt-5 rounded-2xl border border-indigo-500/20 bg-indigo-500/8 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-indigo-200/80">
              建议操作
            </p>
            <p className="mt-1 text-sm leading-6 text-indigo-100">
              {emphasisText}
            </p>
          </div>
        )}

        <div className="mt-5 space-y-2">
          {tertiaryLabel && onTertiary && (
            <button
              onClick={onTertiary}
              className={`flex w-full rounded-xl px-4 py-3 text-sm font-semibold ${BUTTON_PRIMARY_CLASS}`}
            >
              {tertiaryLabel}
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            {secondaryLabel && onSecondary && (
              <button
                onClick={onSecondary}
                className={`flex w-full bg-gray-900/80 ${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              >
                {secondaryLabel}
              </button>
            )}
            <button
              onClick={onPrimary}
              className={`flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${primaryButtonClass}`}
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClaudeApplyModal({
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
            </div>
          ))}
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

interface FileDraftState {
  contentDraft: string;
  savedContent: string;
  fileExists: boolean;
  loading: boolean;
  loadedPath: string;
}

interface PendingSwitchTarget {
  groupId: ConfigGroupId;
  fileId: string;
}

export function ConfigPage({
  providers,
  storedPaths,
  onUpsertPath,
  onDeletePath,
  onDirtyChange,
}: Props) {
  const [selectedGroupId, setSelectedGroupId] =
    useState<ConfigGroupId>("claude");
  const [selectedFileId, setSelectedFileId] = useState<string>("claude");
  const [pendingSwitchTarget, setPendingSwitchTarget] =
    useState<PendingSwitchTarget | null>(null);
  const [draftsByFileId, setDraftsByFileId] = useState<
    Record<string, FileDraftState>
  >({});
  const [saving, setSaving] = useState(false);
  const [showAddFileForm, setShowAddFileForm] = useState(false);
  const [newRelativePath, setNewRelativePath] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [homePath, setHomePath] = useState("");
  const [selectedAvailableProviderId, setSelectedAvailableProviderId] =
    useState<string>("");
  const [modelConfigs, setModelConfigs] = useState<ModelConfigRecord[]>([]);
  const [savedModelConfigs, setSavedModelConfigs] = useState<
    ModelConfigRecord[]
  >([]);
  const [selectedModelConfigId, setSelectedModelConfigId] =
    useState<string>("");
  const [testingModelConfig, setTestingModelConfig] = useState(false);
  const [modelConfigsReady, setModelConfigsReady] = useState(false);
  const [claudeApplyModalOpen, setClaudeApplyModalOpen] = useState(false);
  const [claudeEnvSelection, setClaudeEnvSelection] = useState<
    Record<ClaudeEnvModelField, string>
  >({
    ANTHROPIC_MODEL: "",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "",
    ANTHROPIC_DEFAULT_OPUS_MODEL: "",
  });

  useEffect(() => {
    let active = true;

    async function loadHomePath() {
      try {
        const resolved = await homeDir();
        if (active) setHomePath(resolved.replace(/\/$/, ""));
      } catch (error) {
        console.error("Failed to resolve home directory", error);
        toast("无法解析用户主目录", "error");
      }
    }

    void loadHomePath();
    return () => {
      active = false;
    };
  }, []);

  const groups = useMemo(
    () => (homePath ? buildConfigGroups(storedPaths, homePath) : []),
    [homePath, storedPaths],
  );
  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null;
  const selectedFile =
    selectedGroup?.files.find((file) => file.id === selectedFileId) ??
    selectedGroup?.files[0] ??
    null;
  const editorExtensions = useMemo(
    () => [
      ...getConfigLanguageExtensions(selectedFile?.format ?? "json"),
      configEditorTheme,
    ],
    [selectedFile?.format],
  );
  const activeDraft = selectedFile ? draftsByFileId[selectedFile.id] : null;
  const activeContentDraft = activeDraft?.contentDraft ?? "";
  const activeFileExists = activeDraft?.fileExists ?? false;
  const activeLoading = activeDraft?.loading ?? false;

  function getFileDirty(fileId: string) {
    const draft = draftsByFileId[fileId];
    if (!draft) return false;
    return draft.contentDraft !== draft.savedContent;
  }

  const modelConfigDirty =
    JSON.stringify(modelConfigs) !== JSON.stringify(savedModelConfigs);
  const dirty =
    modelConfigDirty ||
    Object.keys(draftsByFileId).some((fileId) => getFileDirty(fileId));
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
  const selectedAvailableModel = selectedAvailableProvider?.models[0] ?? null;
  const selectedModelConfig =
    modelConfigs.find((item) => item.id === selectedModelConfigId) ??
    modelConfigs[0] ??
    null;
  const isClaudeSettingsShortcutTarget =
    selectedGroup?.id === "claude" && selectedFile?.id === "claude";

  function updateDraftState(fileId: string, patch: Partial<FileDraftState>) {
    setDraftsByFileId((prev) => ({
      ...prev,
      [fileId]: {
        contentDraft: "",
        savedContent: "",
        fileExists: false,
        loading: false,
        loadedPath: "",
        ...prev[fileId],
        ...patch,
      },
    }));
  }

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (groups.length === 0) return;
    if (!selectedGroup) {
      setSelectedGroupId(groups[0].id);
      setSelectedFileId(groups[0].files[0]?.id ?? "");
      return;
    }

    if (!selectedFile && selectedGroup.files[0]) {
      setSelectedFileId(selectedGroup.files[0].id);
    }
  }, [groups, selectedFile, selectedGroup]);

  useEffect(() => {
    let active = true;

    async function loadModelConfigs() {
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

    void loadModelConfigs();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (availableProviderOptions.length === 0) {
      setSelectedAvailableProviderId("");
      return;
    }

    const providerStillExists = availableProviderOptions.some(
      (item) => item.id === selectedAvailableProviderId,
    );
    if (!providerStillExists) {
      setSelectedAvailableProviderId(availableProviderOptions[0].id);
    }
  }, [availableProviderOptions, selectedAvailableProviderId]);

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

  async function refreshCurrent(file = selectedFile) {
    if (!file) return;

    updateDraftState(file.id, {
      loading: true,
      loadedPath: file.absolutePath,
    });
    try {
      const present = await detectExists(file.absolutePath);
      if (!present) {
        updateDraftState(file.id, {
          contentDraft: "",
          savedContent: "",
          fileExists: false,
          loading: false,
          loadedPath: file.absolutePath,
        });
        return;
      }

      const content = await readTextFile(file.absolutePath);
      updateDraftState(file.id, {
        contentDraft: content,
        savedContent: content,
        fileExists: true,
        loading: false,
        loadedPath: file.absolutePath,
      });
    } catch (error) {
      console.error("Failed to read config file", error);
      toast("读取配置文件失败", "error");
      updateDraftState(file.id, {
        loading: false,
        loadedPath: file.absolutePath,
      });
    }
  }

  useEffect(() => {
    if (!selectedFile) return;
    if (
      draftsByFileId[selectedFile.id]?.loadedPath === selectedFile.absolutePath
    ) {
      return;
    }
    void refreshCurrent(selectedFile);
  }, [draftsByFileId, selectedFile]);

  function applySwitch(target: PendingSwitchTarget) {
    setSelectedGroupId(target.groupId);
    setSelectedFileId(target.fileId);
  }

  function requestSwitch(target: PendingSwitchTarget) {
    if (!selectedFile || !getFileDirty(selectedFile.id)) {
      applySwitch(target);
      return;
    }
    setPendingSwitchTarget(target);
  }

  function handleRequestGroupSwitch(groupId: ConfigGroupId) {
    const nextGroup = groups.find((group) => group.id === groupId);
    const nextFileId = nextGroup?.files[0]?.id;
    if (!nextGroup || !nextFileId) return;
    requestSwitch({ groupId, fileId: nextFileId });
  }

  function handleRequestFileSwitch(fileId: string) {
    if (!selectedGroup) return;
    requestSwitch({ groupId: selectedGroup.id, fileId });
  }

  async function handleFormat() {
    if (!activeContentDraft || !selectedFile) return;
    try {
      if (!isSupportedConfigFormat(selectedFile.format)) {
        toast(
          `当前仅对 ${getSupportedConfigFormatsLabel()} 配置提供标准格式化`,
          "warning",
        );
        return;
      }

      const result = await formatConfigContent(
        activeContentDraft,
        selectedFile.format,
      );
      updateDraftState(selectedFile.id, { contentDraft: result.formatted });
      toast(
        result.normalizedPunctuation
          ? `已格式化 ${selectedFile.format.toUpperCase()} 配置，并自动将中文语法符号转换为英文符号`
          : `已格式化 ${selectedFile.format.toUpperCase()} 配置`,
        "success",
      );
    } catch (error) {
      console.error("Failed to format config", error);
      toast(
        error instanceof Error
          ? `配置格式化失败：${error.message}`
          : "配置格式化失败",
        "error",
      );
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(activeContentDraft);
      toast("已复制当前配置内容", "success");
    } catch (error) {
      console.error("Failed to copy config", error);
      toast("复制失败", "error");
    }
  }

  async function handleOpenFile() {
    if (!selectedFile) return;
    try {
      await openPath(selectedFile.absolutePath);
    } catch (error) {
      console.error("Failed to open config file", error);
      toast("打开文件失败", "error");
    }
  }

  async function handleOpenDirectory() {
    if (!selectedFile) return;
    try {
      const folder = await dirname(selectedFile.absolutePath);
      await openPath(folder);
    } catch (error) {
      console.error("Failed to open config directory", error);
      toast("打开目录失败", "error");
    }
  }

  async function handleSaveContent() {
    if (!selectedFile) return false;

    setSaving(true);
    try {
      const folder = await dirname(selectedFile.absolutePath);
      await mkdir(folder, { recursive: true });
      await writeTextFile(selectedFile.absolutePath, activeContentDraft);
      onUpsertPath({
        id: selectedFile.id,
        label: selectedFile.label,
        path: selectedFile.absolutePath,
        isBuiltin: selectedFile.isBuiltin,
        kind: "file",
        format: selectedFile.format,
      });
      updateDraftState(selectedFile.id, {
        savedContent: activeContentDraft,
        fileExists: true,
      });
      toast("配置文件已保存", "success");
      return true;
    } catch (error) {
      console.error("Failed to save config file", error);
      toast("保存失败，请检查路径与权限范围", "error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleDiscardContentChanges() {
    if (!selectedFile || !activeDraft) return;
    updateDraftState(selectedFile.id, {
      contentDraft: activeDraft.savedContent,
    });
    toast("已丢弃当前未保存更改", "info");
  }

  function handleAddGroupFile() {
    if (!selectedGroup || !homePath) return;

    const relativePath = normalizeGroupRelativePath(newRelativePath);
    if (!relativePath) {
      toast("只允许当前目录下的相对路径，且不能包含 ../", "warning");
      return;
    }

    const nextId = `${selectedGroup.id}::${relativePath}`;
    const absolutePath = resolveGroupAbsolutePath(
      homePath,
      selectedGroup.rootDir,
      relativePath,
    );
    if (selectedGroup.files.some((file) => file.id === nextId)) {
      toast("该文件已在当前分组中存在", "warning");
      return;
    }

    onUpsertPath({
      id: nextId,
      label: relativePath.split("/").pop() ?? relativePath,
      path: absolutePath,
      isBuiltin: false,
      kind: "file",
      format: inferConfigFormatFromPath(absolutePath),
    });
    setShowAddFileForm(false);
    setNewRelativePath("");
    setSelectedFileId(nextId);
    toast("已新增组内配置文件", "success");
  }

  function handleDeleteCurrentCustomPath() {
    if (!selectedFile || selectedFile.isBuiltin) return;
    setShowDeleteConfirm(false);
    onDeletePath(selectedFile.id);
    const fallbackFile =
      selectedGroup?.files.find((file) => file.id !== selectedFile.id) ?? null;
    if (fallbackFile) {
      setSelectedFileId(fallbackFile.id);
    }
    toast("已删除当前自定义配置文件入口", "success");
  }

  async function handleSaveAndSwitch() {
    const saved = await handleSaveContent();
    if (!saved || !pendingSwitchTarget) return;
    applySwitch(pendingSwitchTarget);
    setPendingSwitchTarget(null);
  }

  function handleDiscardAndSwitch() {
    if (!selectedFile || !pendingSwitchTarget) return;
    updateDraftState(selectedFile.id, {
      contentDraft: activeDraft?.savedContent ?? "",
    });
    applySwitch(pendingSwitchTarget);
    setPendingSwitchTarget(null);
  }

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

  function handleImportSelectedAvailableModel() {
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

  function handleOpenClaudeApplyModal() {
    if (
      !selectedAvailableModel ||
      !selectedAvailableProvider ||
      !isClaudeSettingsShortcutTarget
    ) {
      return;
    }

    setClaudeEnvSelection(
      buildClaudeModelGuessMap(
        selectedAvailableProvider.models.map((item) => item.model),
        selectedAvailableModel.model,
      ),
    );
    setClaudeApplyModalOpen(true);
  }

  function handleClaudeEnvFieldChange(
    field: ClaudeEnvModelField,
    value: string,
  ) {
    setClaudeEnvSelection((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleApplyClaudeShortcutToDraft() {
    if (
      !selectedFile ||
      !selectedAvailableModel ||
      !selectedAvailableProvider ||
      !isClaudeSettingsShortcutTarget
    ) {
      return;
    }

    try {
      const currentContent = activeContentDraft.trim();
      const parsed =
        currentContent.length > 0 ? JSON.parse(currentContent) : {};

      if (parsed == null || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error("当前 settings.json 顶层不是对象");
      }

      const root = { ...parsed } as Record<string, unknown>;
      const currentEnv =
        root.env && typeof root.env === "object" && !Array.isArray(root.env)
          ? { ...(root.env as Record<string, unknown>) }
          : {};

      currentEnv.ANTHROPIC_BASE_URL = selectedAvailableModel.baseUrl;
      currentEnv.ANTHROPIC_AUTH_TOKEN = selectedAvailableModel.apiKey;
      for (const field of CLAUDE_ENV_MODEL_FIELDS) {
        currentEnv[field] = claudeEnvSelection[field];
      }

      root.env = currentEnv;
      const formatted = await formatConfigContent(
        JSON.stringify(root),
        "json",
      );
      updateDraftState(selectedFile.id, {
        contentDraft: formatted.formatted,
      });
      setClaudeApplyModalOpen(false);
      toast("已将 Claude 模型映射应用到当前草稿", "success");
    } catch (error) {
      console.error("Failed to apply Claude shortcut config", error);
      toast(
        error instanceof Error
          ? `应用失败：${error.message}`
          : "应用失败，请先确保当前 settings.json 是合法 JSON",
        "error",
      );
    }
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

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="shrink-0 px-6 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight text-white">
              配置管理
            </h2>
            <HintTooltip content="管理 Claude、Codex、Gemini、OpenCode、Qwen、Snow 的主配置文件，和规则文件分开维护。" />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <section className="min-w-0 rounded-2xl border border-gray-800 bg-gray-900/80">
          {selectedGroup && selectedFile && (
            <div className="space-y-5 px-5 py-5">
              <div className="grid grid-cols-[210px_minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <select
                    value={selectedGroup.id}
                    onChange={(event) =>
                      handleRequestGroupSwitch(
                        event.target.value as ConfigGroupId,
                      )
                    }
                    aria-label="选择工具"
                    className={FIELD_SELECT_CLASS}
                  >
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <input
                    value={toDisplayPath(selectedFile.absolutePath, homePath)}
                    readOnly
                    placeholder={`/Users/you/.../${selectedFile.fileName}`}
                    aria-label="配置文件路径"
                    className={`${FIELD_MONO_INPUT_CLASS} cursor-default opacity-80`}
                  />
                </div>

                <div className="flex flex-nowrap items-center gap-2">
                  <button
                    onClick={handleOpenDirectory}
                    className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_MD_CLASS}`}
                  >
                    <FolderOpen className="h-4 w-4" />
                    打开目录
                  </button>
                  <button
                    onClick={handleOpenFile}
                    disabled={!activeFileExists}
                    className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_MD_CLASS}`}
                  >
                    <ExternalLink className="h-4 w-4" />
                    文件
                  </button>
                  {!selectedFile.isBuiltin && (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className={`${BUTTON_DANGER_OUTLINE_CLASS} ${BUTTON_SIZE_MD_CLASS}`}
                    >
                      <Trash2 className="h-4 w-4" />
                      删除
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-800/80 bg-gray-950/30 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-gray-200">
                          组内文件
                        </p>
                        <HintTooltip content="左侧按工具分组，当前组内的所有配置文件都在这里以 Tab 切换。" />
                      </div>
                    </div>
                    {!showAddFileForm && (
                      <button
                        onClick={() => setShowAddFileForm(true)}
                        className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                      >
                        <Plus className="h-4 w-4" />
                        添加文件
                      </button>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {selectedGroup.files.map((file) => {
                      const fileDirty = getFileDirty(file.id);
                      const isActive = file.id === selectedFile.id;
                      return (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() => handleRequestFileSwitch(file.id)}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                            isActive
                              ? "border-indigo-500/40 bg-indigo-500/15 text-white"
                              : "border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white"
                          }`}
                        >
                          <span>{file.fileName}</span>
                          {fileDirty && (
                            <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] text-indigo-100">
                              未保存
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {showAddFileForm && (
                    <div className="mt-3 rounded-xl border border-gray-800/80 bg-black/15 px-3 py-3">
                      <div className="mb-2 flex items-center justify-end gap-3">
                        <button
                          onClick={() => {
                            setShowAddFileForm(false);
                            setNewRelativePath("");
                          }}
                          className={`${BUTTON_GHOST_CLASS} h-8 px-2 text-sm text-gray-500 hover:text-gray-300`}
                        >
                          取消
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="min-w-[280px] flex-1">
                          <input
                            value={newRelativePath}
                            onChange={(event) =>
                              setNewRelativePath(event.target.value)
                            }
                            placeholder="hooks/custom.json"
                            className={FIELD_MONO_INPUT_CLASS}
                          />
                        </div>
                        <button
                          onClick={handleAddGroupFile}
                          className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_MD_CLASS}`}
                        >
                          保存
                        </button>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-gray-500">
                        请输入当前组根目录下的相对路径，系统会自动解析到{" "}
                        <span className="font-mono text-gray-400">
                          {toDisplayPath(
                            resolveGroupAbsolutePath(
                              homePath,
                              selectedGroup.rootDir,
                            ),
                            homePath,
                          )}
                        </span>
                        。
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-4 rounded-xl border border-gray-800/80 bg-gray-950/30 px-4 py-4">
                {availableProviderOptions.length > 0 && selectedAvailableModel ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-200">
                        快捷模型
                      </p>
                      <HintTooltip content="这里只选 Provider；具体模型映射在弹窗里完成。" />
                    </div>
                    <div className="w-[240px]">
                      <select
                        value={selectedAvailableProvider?.id ?? ""}
                        onChange={(event) => {
                          setSelectedAvailableProviderId(event.target.value);
                        }}
                        className={FIELD_SELECT_CLASS}
                        aria-label="选择快捷模型 Provider"
                      >
                        {availableProviderOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.providerName} ({option.availableCount} 个可用)
                          </option>
                        ))}
                      </select>
                    </div>
                    {isClaudeSettingsShortcutTarget && (
                      <button
                        onClick={handleOpenClaudeApplyModal}
                        className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                      >
                        应用
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">
                    当前还没有可用模型。请先去模型列表或详情页完成检测。
                  </div>
                )}
              </div>

              {false && (
                <div>
                  <div className="mb-4 rounded-xl border border-gray-800/80 bg-gray-950/30 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-200">
                          模型配置
                        </p>
                        <p className="mt-1 text-xs leading-5 text-gray-500">
                          保存可复用的地址 / Key / 模型组合，并支持直接测试。
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedModelConfig && (
                          <button
                            onClick={() => void handleDeleteModelConfig()}
                            className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-500/30 px-3 text-sm text-red-200 transition-colors hover:border-red-400/40 hover:text-white"
                          >
                            <Trash2 className="h-4 w-4" />
                            删除
                          </button>
                        )}
                        <button
                          onClick={handleCreateModelConfig}
                          className="inline-flex h-9 items-center gap-2 rounded-lg border border-indigo-500/35 bg-indigo-500/10 px-3 text-sm text-indigo-100 transition-colors hover:border-indigo-300/70 hover:bg-indigo-400/18 hover:text-white"
                        >
                          <Plus className="h-4 w-4" />
                          新建
                        </button>
                      </div>
                    </div>

                    {modelConfigs.length > 0 && selectedModelConfig ? (
                      <>
                        <div className="mt-3">
                          <select
                            value={selectedModelConfig.id}
                            onChange={(event) =>
                              setSelectedModelConfigId(event.target.value)
                            }
                            className={FIELD_SELECT_CLASS}
                            aria-label="选择模型配置"
                          >
                            {modelConfigs.map((config) => (
                              <option key={config.id} value={config.id}>
                                {getModelConfigLabel(config)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2.5">
                          <div className="min-w-[300px] flex-1">
                            <input
                              value={selectedModelConfig.baseUrl}
                              onChange={(event) =>
                                updateSelectedModelConfig({
                                  baseUrl: event.target.value,
                                })
                              }
                              placeholder="https://api.example.com/v1"
                              className={FIELD_MONO_INPUT_CLASS}
                            />
                          </div>
                          <CopyButton
                            text={selectedModelConfig.baseUrl}
                            message="已复制模型配置 Base URL"
                          />
                          <div className="min-w-[220px] flex-1">
                            <input
                              value={selectedModelConfig.model}
                              onChange={(event) =>
                                updateSelectedModelConfig({
                                  model: event.target.value,
                                })
                              }
                              placeholder="模型名称"
                              className={FIELD_MONO_INPUT_CLASS}
                            />
                          </div>
                          <CopyButton
                            text={selectedModelConfig.model}
                            message="已复制模型配置模型名"
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2.5">
                          <div className="min-w-[320px] flex-1">
                            <input
                              value={selectedModelConfig.apiKey}
                              onChange={(event) =>
                                updateSelectedModelConfig({
                                  apiKey: event.target.value,
                                })
                              }
                              placeholder="sk-..."
                              className={FIELD_MONO_INPUT_CLASS}
                            />
                          </div>
                          <CopyButton
                            text={selectedModelConfig.apiKey}
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
                              !selectedModelConfig.baseUrl.trim() ||
                              !selectedModelConfig.apiKey.trim() ||
                              !selectedModelConfig.model.trim()
                            }
                            className="inline-flex h-11 items-center gap-2 rounded-lg border border-indigo-500/35 bg-indigo-500/10 px-3 text-sm text-indigo-100 transition-colors hover:border-indigo-300/70 hover:bg-indigo-400/18 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            测试
                          </button>
                          <button
                            onClick={handleImportSelectedAvailableModel}
                            disabled={!selectedAvailableModel}
                            className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            带入当前所选模型
                          </button>
                        </div>

                        <div className="mt-3 rounded-xl border border-gray-800 bg-black/15 px-3 py-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {(() => {
                              const result = selectedModelConfig.lastTestResult;
                              return (
                                <>
                                  <span
                                    className={`rounded-full px-2.5 py-1 ${
                                      result?.available
                                        ? "bg-emerald-500/15 text-emerald-300"
                                        : result
                                          ? "bg-red-500/15 text-red-300"
                                          : "bg-gray-800 text-gray-400"
                                    }`}
                                  >
                                    {result
                                      ? result!.available
                                        ? "最近测试可用"
                                        : "最近测试失败"
                                      : "尚未测试"}
                                  </span>
                                  {selectedModelConfig.lastTestAt != null && (
                                    <span className="text-gray-500">
                                      {new Date(
                                        selectedModelConfig.lastTestAt!,
                                      ).toLocaleString("zh-CN", {
                                        hour12: false,
                                      })}
                                    </span>
                                  )}
                                  {result?.latency_ms != null && (
                                    <span className="text-gray-500">
                                      {result!.latency_ms} ms
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                          <div className="mt-2 flex items-start gap-1.5">
                            <span className="max-w-[540px] truncate text-xs text-gray-400">
                              {getModelConfigResultText(
                                selectedModelConfig.lastTestResult,
                              )}
                            </span>
                            {selectedModelConfig.lastTestResult && (
                              <CopyButton
                                text={getModelConfigResultText(
                                  selectedModelConfig.lastTestResult,
                                )}
                                message="已复制模型配置测试结果"
                              />
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 rounded-xl border border-dashed border-gray-800 bg-black/10 px-4 py-4 text-sm text-gray-500">
                        当前还没有模型配置。点击右上角“新建”创建第一条。
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs uppercase tracking-[0.2em] text-gray-500">
                      内容
                    </label>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs ${selectedGroup.accentClass}`}
                    >
                      {selectedFile.fileName}
                    </span>
                    <span className="rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-300">
                      {selectedFile.format.toUpperCase()}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        activeFileExists
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-200"
                      }`}
                    >
                      {activeFileExists ? "文件存在" : "文件不存在"}
                    </span>
                    {selectedFile && getFileDirty(selectedFile.id) && (
                      <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs text-indigo-200">
                        有未保存改动
                      </span>
                    )}
                    {activeLoading && (
                      <span className="rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-400">
                        正在刷新
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleDiscardContentChanges}
                      disabled={!selectedFile || !getFileDirty(selectedFile.id)}
                      className={`${BUTTON_DANGER_OUTLINE_CLASS} ${BUTTON_SIZE_SM_CLASS}`}
                    >
                      <RotateCcw className="h-4 w-4" />
                      丢弃更改
                    </button>
                    <button
                      onClick={handleFormat}
                      disabled={!activeContentDraft}
                      className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_SM_CLASS}`}
                      title="格式化配置"
                    >
                      <WandSparkles className="h-4 w-4" />
                      格式化
                    </button>
                    <button
                      onClick={handleCopy}
                      disabled={!activeContentDraft}
                      className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_SM_CLASS}`}
                    >
                      <Copy className="h-4 w-4" />
                      复制
                    </button>
                    <button
                      onClick={handleSaveContent}
                      disabled={saving}
                      className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_SM_CLASS}`}
                    >
                      <Save className="h-4 w-4" />
                      保存
                    </button>
                  </div>
                </div>

                <CodeMirror
                  value={activeContentDraft}
                  onChange={(value) =>
                    selectedFile &&
                    updateDraftState(selectedFile.id, { contentDraft: value })
                  }
                  extensions={editorExtensions}
                  theme={oneDark}
                  editable
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    dropCursor: false,
                    allowMultipleSelections: false,
                    highlightActiveLineGutter: false,
                  }}
                  placeholder={
                    activeLoading
                      ? "正在读取配置文件..."
                      : "当前路径下还没有配置内容，你可以直接输入并保存。"
                  }
                  className="text-[#c2cad6]"
                />
              </div>
            </div>
          )}
        </section>
      </div>

      {pendingSwitchTarget && selectedFile && (
        <ConfirmModal
          title="切换当前文件？"
          description="当前文件有未保存内容，切换前请选择处理方式。"
          primaryLabel="放弃并切换"
          secondaryLabel="继续编辑"
          tertiaryLabel="先保存再切换"
          emphasisText="优先保存后再切换，避免当前修改直接丢失。"
          primaryTone="danger"
          onPrimary={handleDiscardAndSwitch}
          onSecondary={() => setPendingSwitchTarget(null)}
          onTertiary={() => void handleSaveAndSwitch()}
        />
      )}

      {showDeleteConfirm && selectedFile && !selectedFile.isBuiltin && (
        <ConfirmModal
          title="删除当前组内文件？"
          description={`将移除当前文件“${selectedFile.label}”的入口配置，不会删除磁盘上的实际文件。`}
          primaryLabel="确认删除"
          secondaryLabel="取消"
          onPrimary={handleDeleteCurrentCustomPath}
          onSecondary={() => setShowDeleteConfirm(false)}
        />
      )}

      {claudeApplyModalOpen &&
        selectedAvailableModel &&
        selectedAvailableProvider && (
          <ClaudeApplyModal
            providerName={selectedAvailableProvider.providerName}
            availableModels={selectedAvailableProvider.models.map(
              (item) => item.model,
            )}
            selection={claudeEnvSelection}
            onChange={handleClaudeEnvFieldChange}
            onConfirm={() => void handleApplyClaudeShortcutToDraft()}
            onCancel={() => setClaudeApplyModalOpen(false)}
          />
        )}
    </div>
  );
}
