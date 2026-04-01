import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import prettier from "prettier/standalone";
import markdownPlugin from "prettier/plugins/markdown";
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
  ACTION_GROUP_BUTTON_ACTIVE_CLASS,
  ACTION_GROUP_BUTTON_BASE_CLASS,
  ACTION_GROUP_BUTTON_INACTIVE_CLASS,
  ACTION_GROUP_WRAPPER_CLASS,
} from "../lib/actionGroupStyles";
import {
  FIELD_INPUT_CLASS,
  FIELD_MONO_INPUT_CLASS,
  FIELD_SELECT_CLASS,
} from "../lib/formStyles";
import { toast } from "../lib/toast";
import type { RulePath } from "../types";

interface Props {
  storedPaths: RulePath[];
  onPathChange: (id: string, path: string) => void;
  onAddPath: (input: {
    label: string;
    path: string;
    kind?: "file" | "directory";
  }) => void;
  onDeletePath: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

interface BuiltinTool {
  id: string;
  label: string;
  fileName: string;
  relativePath: string;
  accentClass: string;
  kind?: "file" | "directory";
}

interface ConfirmModalProps {
  title: string;
  description: string;
  chips?: string[];
  primaryLabel: string;
  secondaryLabel?: string;
  tertiaryLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onPrimary: () => void;
  onSecondary?: () => void;
  onTertiary?: () => void;
}

const BUILTIN_TOOLS: BuiltinTool[] = [
  {
    id: "claude-code",
    label: "Claude",
    fileName: "CLAUDE.md",
    relativePath: ".claude/CLAUDE.md",
    accentClass: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
  },
  {
    id: "codex",
    label: "Codex",
    fileName: "AGENTS.md",
    relativePath: ".codex/AGENTS.md",
    accentClass: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  },
  {
    id: "qwen",
    label: "Qwen",
    fileName: "QWEN.md",
    relativePath: ".qwen/QWEN.md",
    accentClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  },
  {
    id: "opencode",
    label: "OpenCode",
    fileName: "AGENTS.md",
    relativePath: ".opencode/AGENTS.md",
    accentClass: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  },
  {
    id: "gemini",
    label: "Gemini",
    fileName: "GEMINI.md",
    relativePath: ".gemini/GEMINI.md",
    accentClass: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200",
  },
];

function buildHeadingDecorations(state: EditorState) {
  const builder = new RangeSetBuilder<Decoration>();
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
    const line = state.doc.line(lineNumber);
    const headingMatch = /^(#{1,6})\s+/.exec(line.text);
    if (!headingMatch) continue;
    const level = Math.min(headingMatch[1].length, 3);
    builder.add(
      line.from,
      line.from,
      Decoration.line({ class: `cm-md-heading cm-md-heading-${level}` }),
    );
  }
  return builder.finish();
}

const headingHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations;

    constructor(view: EditorView) {
      this.decorations = buildHeadingDecorations(view.state);
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildHeadingDecorations(update.state);
      }
    }
  },
  {
    decorations: (value) => value.decorations,
  },
);

const markdownEditorTheme = EditorView.theme(
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
    ".cm-line": {
      padding: "0 2px",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "rgb(129 140 248)",
    },
    ".cm-md-heading": {
      fontWeight: "700",
    },
    ".cm-md-heading-1": {
      color: "#f8fafc",
      fontSize: "18px",
      lineHeight: "2",
      paddingTop: "6px",
    },
    ".cm-md-heading-2": {
      color: "#dbeafe",
      fontSize: "16px",
      lineHeight: "1.9",
      paddingTop: "4px",
    },
    ".cm-md-heading-3": {
      color: "#bfdbfe",
      fontSize: "14px",
      lineHeight: "1.8",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(99, 102, 241, 0.08)",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(99, 102, 241, 0.28) !important",
    },
    ".cm-tooltip": {
      border: "1px solid rgba(55, 65, 81, 1)",
      backgroundColor: "rgb(17 24 39)",
      color: "rgb(229 231 235)",
    },
  },
  { dark: true },
);

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

function isAbsolutePath(value: string | undefined) {
  return typeof value === "string" && value.startsWith("/");
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
  chips,
  primaryLabel,
  secondaryLabel,
  tertiaryLabel,
  danger = false,
  busy = false,
  onPrimary,
  onSecondary,
  onTertiary,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-gray-400">{description}</p>
        {chips && chips.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-300"
              >
                {chip}
              </span>
            ))}
          </div>
        )}
        <div className="mt-6 space-y-2">
          <button
            onClick={onPrimary}
            disabled={busy}
            className={`flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              danger
                ? "bg-red-500 text-white hover:bg-red-400"
                : "bg-indigo-600 text-white hover:bg-indigo-500"
            }`}
          >
            {primaryLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button
              onClick={onSecondary}
              disabled={busy}
              className="flex w-full items-center justify-center rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
        {tertiaryLabel && onTertiary && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={onTertiary}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
            >
              {tertiaryLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function RulesPage({
  storedPaths,
  onPathChange,
  onAddPath,
  onDeletePath,
  onDirtyChange,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>("claude-code");
  const [pendingSelectedId, setPendingSelectedId] = useState<string | null>(
    null,
  );
  const [pathDraft, setPathDraft] = useState("");
  const [contentDraft, setContentDraft] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [fileExists, setFileExists] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, setRefreshing] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customPath, setCustomPath] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [syncTargetIds, setSyncTargetIds] = useState<string[]>([]);
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [syncing, setSyncing] = useState(false);
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
    const builtin = BUILTIN_TOOLS.map((tool) => {
      const stored = storedPaths.find((item) => item.id === tool.id);
      return {
        ...tool,
        path: isAbsolutePath(stored?.path)
          ? stored!.path
          : homePath
            ? buildDefaultPath(homePath, tool.relativePath)
            : "",
        isBuiltin: true,
        kind: stored?.kind ?? tool.kind ?? "file",
      };
    });
    const custom = storedPaths
      .filter((item) => !item.isBuiltin)
      .map((item) => ({
        id: item.id,
        label: item.label,
        fileName: item.kind === "directory" ? "directory" : "custom",
        accentClass: "border-gray-500/30 bg-gray-500/10 text-gray-200",
        path: item.path,
        isBuiltin: false,
        kind: item.kind ?? "file",
      }));
    return [...builtin, ...custom];
  }, [homePath, storedPaths]);

  const selectedTool =
    tools.find((tool) => tool.id === selectedId) ?? tools[0] ?? null;
  const normalizedLabels = useMemo(
    () => new Set(tools.map((tool) => normalizeText(tool.label).toLowerCase())),
    [tools],
  );
  const normalizedPaths = useMemo(
    () =>
      new Set(tools.map((tool) => normalizeText(tool.path)).filter(Boolean)),
    [tools],
  );
  const syncCandidates = useMemo(
    () =>
      tools.filter(
        (tool) => tool.id !== selectedId && tool.kind !== "directory",
      ),
    [tools, selectedId],
  );
  const editorExtensions = useMemo(
    () => [markdown(), headingHighlightPlugin, markdownEditorTheme],
    [],
  );
  const dirty =
    contentDraft !== savedContent ||
    normalizeText(pathDraft) !==
      normalizeText(
        selectedTool && homePath
          ? toDisplayPath(selectedTool.path, homePath)
          : (selectedTool?.path ?? ""),
      );

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

      if (tool.kind === "directory") {
        setSavedContent("");
        setContentDraft("");
        return;
      }

      const content = await readTextFile(path);
      setSavedContent(content);
      setContentDraft(content);
    } catch (error) {
      console.error("Failed to read rule file", error);
      toast("读取规则文件失败", "error");
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

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    setSyncTargetIds((prev) =>
      prev.filter((id) => syncCandidates.some((tool) => tool.id === id)),
    );
  }, [syncCandidates]);

  async function handleFormat() {
    if (!contentDraft) return;
    try {
      const formatted = await prettier.format(contentDraft, {
        parser: "markdown",
        plugins: [markdownPlugin],
      });
      setContentDraft(formatted);
      toast("已按标准 Markdown formatter 格式化", "success");
    } catch (error) {
      console.error("Failed to format markdown", error);
      toast("Markdown 格式化失败", "error");
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(contentDraft);
      toast("已复制当前规则内容", "success");
    } catch (error) {
      console.error("Failed to copy content", error);
      toast("复制失败", "error");
    }
  }

  async function handleOpenFile() {
    if (!selectedTool || !homePath) return;
    try {
      await openPath(toAbsolutePath(pathDraft, homePath));
    } catch (error) {
      console.error("Failed to open rule file", error);
      toast("打开文件失败", "error");
    }
  }

  async function handleOpenDirectory() {
    if (!selectedTool || !homePath) return;
    try {
      const folder = await dirname(toAbsolutePath(pathDraft, homePath));
      await openPath(folder);
    } catch (error) {
      console.error("Failed to open rule directory", error);
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
        directory: selectedTool.kind === "directory",
        multiple: false,
        filters:
          selectedTool.kind === "directory"
            ? undefined
            : [{ name: "Markdown", extensions: ["md"] }],
      });
      if (typeof picked === "string") {
        setPathDraft(toDisplayPath(picked, homePath));
      }
    } catch (error) {
      console.error("Failed to pick current path", error);
      toast("选择路径失败", "error");
    }
  }

  async function handleSaveContent() {
    if (!selectedTool || !homePath) return;
    const nextPath = normalizeText(toAbsolutePath(pathDraft, homePath));
    if (!nextPath) {
      toast("请先填写规则文件路径", "warning");
      return;
    }
    if (selectedTool.kind === "directory") {
      toast("目录类型规则项不支持直接编辑内容", "warning");
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
      toast("规则文件已保存", "success");
    } catch (error) {
      console.error("Failed to save rule file", error);
      toast("保存失败，请检查路径与权限范围", "error");
    } finally {
      setSaving(false);
    }
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
    onAddPath({ label, path });
    setCustomLabel("");
    setCustomPath("");
    setShowCustomForm(false);
    toast("已新增自定义规则项", "success");
  }

  async function handlePickCustomPath() {
    if (!homePath) return;
    try {
      const picked = await pickPath({
        directory: false,
        multiple: false,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (typeof picked === "string") {
        setCustomPath(toDisplayPath(picked, homePath));
      }
    } catch (error) {
      console.error("Failed to pick custom path", error);
      toast("选择文件失败", "error");
    }
  }

  function handleDeleteCurrentCustomPath() {
    if (!selectedTool || selectedTool.isBuiltin) return;
    setShowDeleteConfirm(false);
    onDeletePath(selectedTool.id);
    setSelectedId(BUILTIN_TOOLS[0].id);
    toast("已删除自定义规则项", "success");
  }

  function toggleSyncTarget(id: string) {
    setSyncTargetIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  async function executeSync(sourceContentOverride?: string) {
    if (!selectedTool || !homePath) return;
    const sourcePath = normalizeText(toAbsolutePath(pathDraft, homePath));
    const targets = syncCandidates.filter((tool) =>
      syncTargetIds.includes(tool.id),
    );

    if (!sourcePath || !fileExists) {
      toast("源文件不存在，无法同步", "warning");
      return;
    }
    if (selectedTool.kind === "directory") {
      toast("目录型规则项不能作为同步源", "warning");
      return;
    }
    if (!targets.length) {
      toast("请至少选择一个同步目标", "warning");
      return;
    }

    setSyncing(true);
    try {
      const sourceContent =
        sourceContentOverride ?? (await readTextFile(sourcePath));
      const results = await Promise.allSettled(
        targets.map(async (target) => {
          const targetPath = normalizeText(
            toAbsolutePath(target.path, homePath),
          );
          const folder = await dirname(targetPath);
          await mkdir(folder, { recursive: true });
          await writeTextFile(targetPath, sourceContent);
          return target.label;
        }),
      );

      const success = results.filter(
        (item) => item.status === "fulfilled",
      ) as PromiseFulfilledResult<string>[];
      const failed = results.filter((item) => item.status === "rejected");
      setShowSyncConfirm(false);

      if (failed.length === 0) {
        toast(`已同步到 ${success.length} 个目标`, "success");
        return;
      }

      const names = success.map((item) => item.value).join("、");
      const failedNames = failed
        .map((_, index) => targets[index]?.label)
        .filter(Boolean)
        .join("、");
      toast(
        names
          ? `部分同步成功：${names}${failedNames ? `；失败：${failedNames}` : `，另有 ${failed.length} 个目标失败`}`
          : `同步失败：${failedNames || `${failed.length} 个目标未写入`}`,
        "warning",
      );
    } catch (error) {
      console.error("Failed to sync rule file", error);
      toast("同步失败，请检查源文件与目标路径", "error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="shrink-0 px-6 pb-6">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-white">
            规则管理
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            在单个工具维度查看、编辑和保存规则文件，路径切换后立即绑定对应配置。
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
                    aria-label="规则文件路径"
                    className={FIELD_MONO_INPUT_CLASS}
                  />
                </div>

                <div className="flex flex-nowrap items-center gap-2">
                  <button
                    onClick={handlePickCurrentPath}
                    className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
                  >
                    {selectedTool.kind === "directory"
                      ? "选择目录"
                      : "选择文件"}
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
                        onChange={(event) => setCustomPath(event.target.value)}
                        placeholder="/Users/you/custom/rules.md"
                        className={FIELD_MONO_INPUT_CLASS}
                      />
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
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-lg border border-transparent px-2 text-sm text-gray-500 transition-colors hover:text-gray-300"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-gray-800 bg-gray-950/50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-gray-200">同步到</p>
                  <button
                    onClick={() => {
                      if (dirty) {
                        setShowSyncConfirm(true);
                        return;
                      }
                      void executeSync();
                    }}
                    disabled={
                      !syncTargetIds.length ||
                      !fileExists ||
                      selectedTool.kind === "directory" ||
                      syncing
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Save className="h-4 w-4" />
                    同步
                  </button>
                </div>
                <div className={`${ACTION_GROUP_WRAPPER_CLASS} flex-wrap`}>
                  {syncCandidates.map((tool) => (
                    <button
                      type="button"
                      key={tool.id}
                      onClick={() => toggleSyncTarget(tool.id)}
                      className={`${ACTION_GROUP_BUTTON_BASE_CLASS} ${
                        syncTargetIds.includes(tool.id)
                          ? ACTION_GROUP_BUTTON_ACTIVE_CLASS
                          : ACTION_GROUP_BUTTON_INACTIVE_CLASS
                      }`}
                    >
                      {syncTargetIds.includes(tool.id) && (
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-300" />
                      )}
                      <span>{tool.label}</span>
                    </button>
                  ))}
                </div>
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
                      {selectedTool.isBuiltin
                        ? selectedTool.fileName
                        : "自定义"}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        fileExists
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-200"
                      }`}
                    >
                      {fileExists
                        ? selectedTool.kind === "directory"
                          ? "目录存在"
                          : "文件存在"
                        : selectedTool.kind === "directory"
                          ? "目录不存在"
                          : "文件不存在"}
                    </span>
                    {dirty && (
                      <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs text-indigo-200">
                        有未保存改动
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleFormat}
                      disabled={
                        !contentDraft || selectedTool.kind === "directory"
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      title="格式化 Markdown"
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
                  editable={selectedTool.kind !== "directory"}
                  readOnly={selectedTool.kind === "directory"}
                  basicSetup={{
                    lineNumbers: false,
                    foldGutter: false,
                    dropCursor: false,
                    allowMultipleSelections: false,
                    indentOnInput: true,
                    highlightActiveLineGutter: false,
                  }}
                  placeholder={
                    selectedTool.kind === "directory"
                      ? "当前规则项是目录类型，支持路径管理与打开目录，不支持直接编辑目录内容。"
                      : loadingContent
                        ? "正在读取文件内容..."
                        : "当前路径下还没有文件内容，你可以直接输入并保存。"
                  }
                  className="rules-markdown-editor text-[#c2cad6]"
                />
              </div>
            </div>
          )}
        </section>
      </div>

      {pendingSelectedId && (
        <ConfirmModal
          title="切换当前规则项？"
          description="当前规则项有未保存内容，切换后这些改动会丢失。确认继续吗？"
          primaryLabel="放弃并切换"
          secondaryLabel="继续编辑"
          onPrimary={() => {
            setSelectedId(pendingSelectedId);
            setPendingSelectedId(null);
          }}
          onSecondary={() => setPendingSelectedId(null)}
        />
      )}

      {showSyncConfirm && selectedTool && (
        <ConfirmModal
          title="确认同步"
          description="当前规则项存在未保存改动。请选择本次同步使用哪一份内容。"
          chips={syncCandidates
            .filter((tool) => syncTargetIds.includes(tool.id))
            .map((tool) => tool.label)}
          primaryLabel="先保存再同步"
          secondaryLabel="直接同步当前编辑内容"
          tertiaryLabel="取消"
          busy={syncing}
          onPrimary={async () => {
            await handleSaveContent();
            await executeSync(contentDraft);
          }}
          onSecondary={() => {
            void executeSync(contentDraft);
          }}
          onTertiary={() => setShowSyncConfirm(false)}
        />
      )}

      {showDeleteConfirm && selectedTool && !selectedTool.isBuiltin && (
        <ConfirmModal
          title="删除自定义项？"
          description={`将移除当前自定义规则项“${selectedTool.label}”的入口配置，不会删除磁盘上的实际文件。`}
          primaryLabel="确认删除"
          tertiaryLabel="取消"
          danger
          onPrimary={handleDeleteCurrentCustomPath}
          onTertiary={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
