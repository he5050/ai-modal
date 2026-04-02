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
import {
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
import type { ConfigFormat, ConfigPath } from "../types";

interface Props {
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
  const dirty =
    contentDraft !== savedContent ||
    normalizeText(pathDraft) !==
      normalizeText(
        selectedTool && homePath
          ? toDisplayPath(selectedTool.path, homePath)
          : (selectedTool?.path ?? ""),
      );

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

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

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="shrink-0 px-6 pb-6">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-white">
            配置管理
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            管理 Claude、Codex、Gemini、OpenCode、Qwen
            的主配置文件，和规则文件分开维护。
          </p>
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

              <div className="rounded-2xl border border-gray-800 bg-gray-950/50 p-4">
                {!showCustomForm ? (
                  <button
                    onClick={() => setShowCustomForm(true)}
                    className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-700 px-4 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
                  >
                    <Plus className="h-4 w-4" />
                    新增自定义项
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="w-[180px] flex-shrink-0">
                      <input
                        value={customLabel}
                        onChange={(event) => setCustomLabel(event.target.value)}
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
                          setCustomFormat(event.target.value as ConfigFormat)
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
                    <button
                      onClick={() => {
                        setShowCustomForm(false);
                        setCustomLabel("");
                        setCustomPath("");
                        setCustomFormat("json");
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-lg border border-transparent px-2 text-sm text-gray-500 transition-colors hover:text-gray-300"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>

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
