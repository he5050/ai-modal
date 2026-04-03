import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage, foldService } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { toml as tomlMode } from "@codemirror/legacy-modes/mode/toml";
import prettier from "prettier/standalone";
import babelPlugin from "prettier/plugins/babel";
import estreePlugin from "prettier/plugins/estree";
import { dirname, homeDir } from "@tauri-apps/api/path";
import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { open as pickPath } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { testModelConfig } from "../api";
import { loadPersistedJson, savePersistedJson } from "../lib/persistence";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FilePenLine,
  FolderOpen,
  Plus,
  Save,
  Trash2,
  WandSparkles,
} from "lucide-react";
import {
  FIELD_INPUT_CLASS,
  FIELD_MONO_INPUT_CLASS,
  FIELD_SELECT_CLASS,
} from "../lib/formStyles";
import { toast } from "../lib/toast";
import { CopyButton } from "./CopyButton";
import { HintTooltip } from "./HintTooltip";
import type { ConfigFormat, ConfigPath, ModelResult, Provider } from "../types";

interface Props {
  providers: Provider[];
  storedPaths: ConfigPath[];
  onPathChange: (id: string, path: string) => void;
  onAddPath: (input: {
    label: string;
    path: string;
    format?: ConfigFormat;
  }) => void;
  onDeletePath: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

interface BuiltinConfig {
  id: string;
  label: string;
  fileName: string;
  relativePath: string;
  accentClass: string;
  format: ConfigFormat;
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
  onPrimary: () => void;
  onSecondary?: () => void;
}

const BUILTIN_CONFIGS: BuiltinConfig[] = [
  {
    id: "claude",
    label: "Claude",
    fileName: "settings.json",
    relativePath: ".claude/settings.json",
    accentClass: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
    format: "json",
  },
  {
    id: "codex",
    label: "Codex",
    fileName: "config.toml",
    relativePath: ".codex/config.toml",
    accentClass: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
    format: "toml",
  },
  {
    id: "gemini",
    label: "Gemini",
    fileName: "settings.json",
    relativePath: ".gemini/settings.json",
    accentClass: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200",
    format: "json",
  },
  {
    id: "opencode",
    label: "OpenCode",
    fileName: "opencode.json",
    relativePath: ".config/opencode/opencode.json",
    accentClass: "border-amber-500/30 bg-amber-500/10 text-amber-100",
    format: "json",
  },
  {
    id: "qwen",
    label: "Qwen",
    fileName: "settings.json",
    relativePath: ".qwen/settings.json",
    accentClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    format: "json",
  },
];

const MODEL_CONFIGS_KEY = "ai-modal-model-configs";
const MODEL_CONFIGS_DB_KEY = "model_configs";

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

function toAbsolutePath(value: string, homePath: string) {
  return value.startsWith("~/") ? `${homePath}${value.slice(1)}` : value;
}

function buildDefaultPath(homePath: string, relativePath: string) {
  return `${homePath.replace(/\/$/, "")}/${relativePath}`;
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

function ConfirmModal({
  title,
  description,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-gray-400">{description}</p>
        <div className="mt-6 space-y-2">
          <button
            onClick={onPrimary}
            className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            {primaryLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button
              onClick={onSecondary}
              className="flex w-full items-center justify-center rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConfigPage({
  providers,
  storedPaths,
  onPathChange,
  onAddPath,
  onDeletePath,
  onDirtyChange,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>("claude");
  const [pendingSelectedId, setPendingSelectedId] = useState<string | null>(
    null,
  );
  const [pathDraft, setPathDraft] = useState("");
  const [contentDraft, setContentDraft] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [fileExists, setFileExists] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customPath, setCustomPath] = useState("");
  const [customFormat, setCustomFormat] = useState<ConfigFormat>("json");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [homePath, setHomePath] = useState("");
  const [selectedAvailableProviderId, setSelectedAvailableProviderId] =
    useState<string>("");
  const [selectedAvailableModelId, setSelectedAvailableModelId] =
    useState<string>("");
  const [modelConfigs, setModelConfigs] = useState<ModelConfigRecord[]>([]);
  const [savedModelConfigs, setSavedModelConfigs] = useState<
    ModelConfigRecord[]
  >([]);
  const [selectedModelConfigId, setSelectedModelConfigId] =
    useState<string>("");
  const [testingModelConfig, setTestingModelConfig] = useState(false);
  const [modelConfigsReady, setModelConfigsReady] = useState(false);
  const [shortcutExpanded, setShortcutExpanded] = useState(false);

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

  const tools = useMemo(() => {
    const builtin = BUILTIN_CONFIGS.map((tool) => {
      const stored = storedPaths.find((item) => item.id === tool.id);
      return {
        ...tool,
        path:
          stored?.path && stored.path.startsWith("/")
            ? stored.path
            : homePath
              ? buildDefaultPath(homePath, tool.relativePath)
              : "",
        isBuiltin: true,
      };
    });
    const custom = storedPaths
      .filter((item) => !item.isBuiltin)
      .map((item) => ({
        id: item.id,
        label: item.label,
        fileName:
          item.format === "toml"
            ? "config.toml"
            : item.format === "yaml"
              ? "config.yaml"
              : item.format === "xml"
                ? "config.xml"
                : "config.json",
        relativePath: item.path,
        accentClass: "border-gray-500/30 bg-gray-500/10 text-gray-200",
        format: item.format ?? "json",
        path: item.path,
        isBuiltin: false,
      }));
    return [...builtin, ...custom];
  }, [homePath, storedPaths]);
  const selectedTool =
    tools.find((tool) => tool.id === selectedId) ?? tools[0] ?? null;
  const editorExtensions = useMemo(
    () => [
      ...getConfigLanguageExtensions(selectedTool?.format ?? "json"),
      configEditorTheme,
    ],
    [selectedTool?.format],
  );
  const normalizedLabels = useMemo(
    () => new Set(tools.map((tool) => normalizeText(tool.label).toLowerCase())),
    [tools],
  );
  const normalizedPaths = useMemo(
    () =>
      new Set(tools.map((tool) => normalizeText(tool.path)).filter(Boolean)),
    [tools],
  );
  const modelConfigDirty =
    JSON.stringify(modelConfigs) !== JSON.stringify(savedModelConfigs);
  const dirty =
    modelConfigDirty ||
    contentDraft !== savedContent ||
    normalizeText(pathDraft) !==
      normalizeText(
        selectedTool && homePath
          ? toDisplayPath(selectedTool.path, homePath)
          : (selectedTool?.path ?? ""),
      );
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
  const selectedModelConfig =
    modelConfigs.find((item) => item.id === selectedModelConfigId) ??
    modelConfigs[0] ??
    null;

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

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
                return typeof item?.id === "string";
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

  async function refreshCurrent(tool = selectedTool, targetPath?: string) {
    if (!tool || !homePath) return;
    const path = normalizeText(
      toAbsolutePath(targetPath ?? tool.path, homePath),
    );
    if (!path) {
      setFileExists(false);
      setSavedContent("");
      setContentDraft("");
      return;
    }

    setRefreshing(true);
    setLoadingContent(true);
    try {
      const present = await detectExists(path);
      setFileExists(present);
      if (!present) {
        setSavedContent("");
        setContentDraft("");
        return;
      }

      const content = await readTextFile(path);
      setSavedContent(content);
      setContentDraft(content);
    } catch (error) {
      console.error("Failed to read config file", error);
      toast("读取配置文件失败", "error");
    } finally {
      setLoadingContent(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!selectedTool || !homePath) return;
    setPathDraft(toDisplayPath(selectedTool.path, homePath));
    void refreshCurrent(selectedTool, selectedTool.path);
  }, [homePath, selectedTool?.id, selectedTool?.path]);

  useEffect(() => {
    if (!selectedTool && tools.length > 0) {
      setSelectedId(tools[0].id);
    }
  }, [selectedTool, tools]);

  async function handleFormat() {
    if (!contentDraft || !selectedTool) return;
    if (selectedTool.format !== "json") {
      toast("当前仅对 JSON 配置提供标准格式化", "warning");
      return;
    }
    try {
      const formatted = await prettier.format(contentDraft, {
        parser: "json",
        plugins: [babelPlugin, estreePlugin],
      });
      setContentDraft(formatted);
      toast("已格式化 JSON 配置", "success");
    } catch (error) {
      console.error("Failed to format config", error);
      toast("配置格式化失败", "error");
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(contentDraft);
      toast("已复制当前配置内容", "success");
    } catch (error) {
      console.error("Failed to copy config", error);
      toast("复制失败", "error");
    }
  }

  async function handleOpenFile() {
    if (!selectedTool || !homePath) return;
    try {
      await openPath(toAbsolutePath(pathDraft, homePath));
    } catch (error) {
      console.error("Failed to open config file", error);
      toast("打开文件失败", "error");
    }
  }

  async function handleOpenDirectory() {
    if (!selectedTool || !homePath) return;
    try {
      const folder = await dirname(toAbsolutePath(pathDraft, homePath));
      await openPath(folder);
    } catch (error) {
      console.error("Failed to open config directory", error);
      toast("打开目录失败", "error");
    }
  }

  async function handleSavePath() {
    if (!selectedTool || !homePath) return;
    const nextPath = normalizeText(toAbsolutePath(pathDraft, homePath));
    if (!nextPath) {
      toast("路径不能为空", "warning");
      return;
    }
    onPathChange(selectedTool.id, nextPath);
    toast("路径已更新", "success");
  }

  async function handlePickCurrentPath() {
    if (!selectedTool || !homePath) return;
    try {
      const picked = await pickPath({
        directory: false,
        multiple: false,
        filters:
          selectedTool.format === "toml"
            ? [{ name: "TOML", extensions: ["toml"] }]
            : selectedTool.format === "yaml"
              ? [{ name: "YAML", extensions: ["yaml", "yml"] }]
              : selectedTool.format === "xml"
                ? [{ name: "XML", extensions: ["xml"] }]
                : [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof picked === "string") {
        setPathDraft(toDisplayPath(picked, homePath));
      }
    } catch (error) {
      console.error("Failed to pick config path", error);
      toast("选择路径失败", "error");
    }
  }

  async function handleSaveContent() {
    if (!selectedTool || !homePath) return;
    const nextPath = normalizeText(toAbsolutePath(pathDraft, homePath));
    if (!nextPath) {
      toast("请先填写配置文件路径", "warning");
      return;
    }

    setSaving(true);
    try {
      const folder = await dirname(nextPath);
      await mkdir(folder, { recursive: true });
      await writeTextFile(nextPath, contentDraft);
      onPathChange(selectedTool.id, nextPath);
      setSavedContent(contentDraft);
      setFileExists(true);
      toast("配置文件已保存", "success");
    } catch (error) {
      console.error("Failed to save config file", error);
      toast("保存失败，请检查路径与权限范围", "error");
    } finally {
      setSaving(false);
    }
  }

  function inferFormatFromPath(path: string): ConfigFormat {
    const normalized = path.toLowerCase();
    if (normalized.endsWith(".toml")) return "toml";
    if (normalized.endsWith(".yaml") || normalized.endsWith(".yml"))
      return "yaml";
    if (normalized.endsWith(".xml")) return "xml";
    return "json";
  }

  function handleAddCustomPath() {
    if (!homePath) return;
    const label = normalizeText(customLabel);
    const path = normalizeText(toAbsolutePath(customPath, homePath));
    if (!label || !path) {
      toast("请填写自定义名称与路径", "warning");
      return;
    }
    if (normalizedLabels.has(label.toLowerCase())) {
      toast("名称已存在，请更换一个名称", "warning");
      return;
    }
    if (normalizedPaths.has(path)) {
      toast("路径已存在，请不要重复添加同一个文件", "warning");
      return;
    }
    onAddPath({
      label,
      path,
      format: customFormat || inferFormatFromPath(path),
    });
    setCustomLabel("");
    setCustomPath("");
    setCustomFormat("json");
    setShowCustomForm(false);
    toast("已新增自定义配置项", "success");
  }

  async function handlePickCustomPath() {
    if (!homePath) return;
    try {
      const picked = await pickPath({
        directory: false,
        multiple: false,
        filters: [
          {
            name: "Config",
            extensions: ["json", "toml", "yaml", "yml", "xml"],
          },
        ],
      });
      if (typeof picked === "string") {
        setCustomPath(toDisplayPath(picked, homePath));
        setCustomFormat(inferFormatFromPath(picked));
      }
    } catch (error) {
      console.error("Failed to pick custom config path", error);
      toast("选择文件失败", "error");
    }
  }

  function handleDeleteCurrentCustomPath() {
    if (!selectedTool || selectedTool.isBuiltin) return;
    setShowDeleteConfirm(false);
    onDeletePath(selectedTool.id);
    setSelectedId(BUILTIN_CONFIGS[0].id);
    toast("已删除自定义配置项", "success");
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
            <HintTooltip content="管理 Claude、Codex、Gemini、OpenCode、Qwen 的主配置文件，和规则文件分开维护。" />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <section className="min-w-0 rounded-2xl border border-gray-800 bg-gray-900/80">
          {selectedTool && (
            <div className="space-y-5 px-5 py-5">
              <div className="grid grid-cols-[210px_minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <select
                    value={selectedId}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      if (nextId === selectedId) return;
                      if (dirty) {
                        setPendingSelectedId(nextId);
                        return;
                      }
                      setSelectedId(nextId);
                    }}
                    aria-label="选择工具"
                    className={FIELD_SELECT_CLASS}
                  >
                    {tools.map((tool) => (
                      <option key={tool.id} value={tool.id}>
                        {tool.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <input
                    value={pathDraft}
                    onChange={(event) => setPathDraft(event.target.value)}
                    placeholder={`/Users/you/.../${selectedTool.fileName}`}
                    aria-label="配置文件路径"
                    className={FIELD_MONO_INPUT_CLASS}
                  />
                </div>

                <div className="flex flex-nowrap items-center gap-2">
                  <button
                    onClick={handlePickCurrentPath}
                    className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
                  >
                    选择文件
                  </button>
                  <button
                    onClick={handleSavePath}
                    className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
                  >
                    <FilePenLine className="h-4 w-4" />
                    保存
                  </button>
                  <button
                    onClick={handleOpenDirectory}
                    className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
                  >
                    <FolderOpen className="h-4 w-4" />
                    打开目录
                  </button>
                  <button
                    onClick={handleOpenFile}
                    disabled={!fileExists}
                    className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ExternalLink className="h-4 w-4" />
                    文件
                  </button>
                  {!selectedTool.isBuiltin && (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="inline-flex h-11 items-center gap-2 rounded-lg border border-red-500/30 px-3 text-sm text-red-200 transition-colors hover:border-red-400/40 hover:text-white"
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
                          自定义配置项
                        </p>
                        <HintTooltip content="为额外配置文件添加独立入口，方便切换和维护。" />
                      </div>
                    </div>
                    {!showCustomForm && (
                      <button
                        onClick={() => setShowCustomForm(true)}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-indigo-500/35 bg-indigo-500/10 px-3 text-sm text-indigo-100 transition-colors hover:border-indigo-300/70 hover:bg-indigo-400/18 hover:text-white"
                      >
                        <Plus className="h-4 w-4" />
                        新增
                      </button>
                    )}
                  </div>

                  {showCustomForm && (
                    <div className="mt-3 rounded-xl border border-gray-800/80 bg-black/15 px-3 py-3">
                      <div className="mb-2 flex items-center justify-end gap-3">
                        <button
                          onClick={() => {
                            setShowCustomForm(false);
                            setCustomLabel("");
                            setCustomPath("");
                            setCustomFormat("json");
                          }}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-transparent px-2 text-sm text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
                        >
                          取消
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="w-[170px] flex-shrink-0">
                          <input
                            value={customLabel}
                            onChange={(event) =>
                              setCustomLabel(event.target.value)
                            }
                            placeholder="自定义名称"
                            className={FIELD_INPUT_CLASS}
                          />
                        </div>
                        <div className="min-w-[280px] flex-1">
                          <input
                            value={customPath}
                            onChange={(event) => {
                              const nextPath = event.target.value;
                              setCustomPath(nextPath);
                              setCustomFormat(
                                inferFormatFromPath(
                                  toAbsolutePath(nextPath, homePath),
                                ),
                              );
                            }}
                            placeholder="/Users/you/custom/config.json"
                            className={FIELD_MONO_INPUT_CLASS}
                          />
                        </div>
                        <div className="w-[120px] flex-shrink-0">
                          <select
                            value={customFormat}
                            onChange={(event) =>
                              setCustomFormat(
                                event.target.value as ConfigFormat,
                              )
                            }
                            className={FIELD_SELECT_CLASS}
                          >
                            <option value="json">JSON</option>
                            <option value="toml">TOML</option>
                            <option value="yaml">YAML</option>
                            <option value="xml">XML</option>
                          </select>
                        </div>
                        <button
                          onClick={handlePickCustomPath}
                          className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
                        >
                          选择文件
                        </button>
                        <button
                          onClick={handleAddCustomPath}
                          className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-4 rounded-xl border border-gray-800/80 bg-gray-950/30 px-4 py-4">
                <button
                  type="button"
                  onClick={() => setShortcutExpanded((prev) => !prev)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-200">
                        可用模型快捷选择
                      </p>
                      <HintTooltip content="从已检测可用的模型里快速取用 URL、Key 和模型名。" />
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

                {shortcutExpanded &&
                  (availableProviderOptions.length > 0 &&
                  selectedAvailableModel ? (
                    <>
                      <div className="mt-3 grid gap-3 border-t border-gray-800 pt-3 md:grid-cols-2">
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
                              {maskPreviewText(selectedAvailableModel.baseUrl)}
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
                      </div>
                    </>
                  ) : (
                    <div className="mt-3 rounded-xl border border-dashed border-gray-800 bg-black/10 px-4 py-4 text-sm text-gray-500">
                      当前还没有可用模型。请先去模型列表或详情页完成检测。
                    </div>
                  ))}
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
                            <span
                              className={`rounded-full px-2.5 py-1 ${
                                selectedModelConfig.lastTestResult?.available
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : selectedModelConfig.lastTestResult
                                    ? "bg-red-500/15 text-red-300"
                                    : "bg-gray-800 text-gray-400"
                              }`}
                            >
                              {selectedModelConfig.lastTestResult
                                ? selectedModelConfig.lastTestResult.available
                                  ? "最近测试可用"
                                  : "最近测试失败"
                                : "尚未测试"}
                            </span>
                            {selectedModelConfig.lastTestAt && (
                              <span className="text-gray-500">
                                {new Date(
                                  selectedModelConfig.lastTestAt,
                                ).toLocaleString("zh-CN", { hour12: false })}
                              </span>
                            )}
                            {selectedModelConfig.lastTestResult?.latency_ms !=
                              null && (
                              <span className="text-gray-500">
                                {selectedModelConfig.lastTestResult.latency_ms}{" "}
                                ms
                              </span>
                            )}
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
                      className={`rounded-full border px-2.5 py-1 text-xs ${selectedTool.accentClass}`}
                    >
                      {selectedTool.fileName}
                    </span>
                    <span className="rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-300">
                      {selectedTool.format.toUpperCase()}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        fileExists
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-200"
                      }`}
                    >
                      {fileExists ? "文件存在" : "文件不存在"}
                    </span>
                    {dirty && (
                      <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs text-indigo-200">
                        有未保存改动
                      </span>
                    )}
                    {refreshing && (
                      <span className="rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-400">
                        正在刷新
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleFormat}
                      disabled={!contentDraft}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      title="格式化配置"
                    >
                      <WandSparkles className="h-4 w-4" />
                      格式化
                    </button>
                    <button
                      onClick={handleCopy}
                      disabled={!contentDraft}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Copy className="h-4 w-4" />
                      复制
                    </button>
                    <button
                      onClick={handleSaveContent}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      保存
                    </button>
                  </div>
                </div>

                <CodeMirror
                  value={contentDraft}
                  onChange={(value) => setContentDraft(value)}
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
                    loadingContent
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

      {pendingSelectedId && (
        <ConfirmModal
          title="切换当前配置项？"
          description="当前配置项有未保存内容，切换后这些改动会丢失。确认继续吗？"
          primaryLabel="放弃并切换"
          secondaryLabel="继续编辑"
          onPrimary={() => {
            setSelectedId(pendingSelectedId);
            setPendingSelectedId(null);
          }}
          onSecondary={() => setPendingSelectedId(null)}
        />
      )}

      {showDeleteConfirm && selectedTool && !selectedTool.isBuiltin && (
        <ConfirmModal
          title="删除自定义项？"
          description={`将移除当前自定义配置项“${selectedTool.label}”的入口配置，不会删除磁盘上的实际文件。`}
          primaryLabel="确认删除"
          secondaryLabel="取消"
          onPrimary={handleDeleteCurrentCustomPath}
          onSecondary={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
