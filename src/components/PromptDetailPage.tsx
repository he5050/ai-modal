import { useEffect, useMemo, useRef, useState } from "react";
import { animate, spring } from "animejs";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import {
  ArrowLeft,
  Copy,
  Eye,
  FilePenLine,
  Save,
  Trash2,
  WandSparkles,
} from "lucide-react";
import {
  BUTTON_DANGER_CLASS,
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../lib/buttonStyles";
import { renderMarkdownToHtml } from "../lib/promptMarkdown";
import { parsePromptCategories } from "../lib/promptStore";
import { toast } from "../lib/toast";
import { DeletePromptDialog } from "./prompts/DeletePromptDialog";
import { createDraft, formatPromptTime, serializeDraftComparable } from "./prompts/utils";
import type { PromptRecord } from "../types";

interface Props {
  prompt: PromptRecord | null;
  mode: "detail" | "edit" | "create";
  availableTags: string[];
  onBack: () => void;
  onSave: (prompt: PromptRecord) => void;
  onDelete: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

const promptMarkdownEditorTheme = EditorView.theme(
  {
    "&": {
      minHeight: "520px",
      borderRadius: "1rem",
      border: "1px solid rgba(55, 65, 81, 0.9)",
      backgroundColor: "rgba(2, 6, 23, 0.82)",
      overflow: "hidden",
    },
    "&.cm-focused": {
      outline: "none",
      borderColor: "rgb(99 102 241)",
    },
    ".cm-scroller": {
      minHeight: "520px",
      overflow: "auto",
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
    },
    ".cm-gutters": {
      backgroundColor: "rgba(2, 6, 23, 0.88)",
      borderRight: "1px solid rgba(55, 65, 81, 0.7)",
      color: "rgb(75 85 99)",
    },
    ".cm-content": {
      padding: "18px",
      fontSize: "14px",
      lineHeight: "1.85",
      color: "rgb(226 232 240)",
      caretColor: "#f8fafc",
    },
    ".cm-placeholder": {
      color: "rgb(107 114 128)",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(99, 102, 241, 0.08)",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(99, 102, 241, 0.24) !important",
    },
  },
  { dark: true },
);

export function PromptDetailPage({
  prompt,
  mode,
  availableTags,
  onBack,
  onSave,
  onDelete,
  onDirtyChange,
}: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"detail" | "edit">(
    mode === "detail" ? "detail" : "edit",
  );
  const [draft, setDraft] = useState<PromptRecord>(createDraft(prompt));
  const [baselineDraft, setBaselineDraft] = useState<PromptRecord>(
    createDraft(prompt),
  );
  const [tagsInput, setTagsInput] = useState((prompt?.tags ?? []).join(", "));
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<"write" | "preview">("write");

  const editorExtensions = useMemo(
    () => [markdown(), promptMarkdownEditorTheme],
    [],
  );
  const draftTags = useMemo(
    () => parsePromptCategories(tagsInput),
    [tagsInput],
  );
  const dirty = useMemo(
    () =>
      serializeDraftComparable(draft) !== serializeDraftComparable(baselineDraft),
    [baselineDraft, draft],
  );

  useEffect(() => {
    if (pageRef.current) {
      animate(pageRef.current, {
        opacity: [0, 1],
        translateY: [8, 0],
        ease: spring({ stiffness: 280, damping: 22 }),
        duration: 320,
      });
    }
  }, [prompt?.id, mode]);

  useEffect(() => {
    const nextDraft = createDraft(prompt);
    setDraft(nextDraft);
    setBaselineDraft(nextDraft);
    setTagsInput(nextDraft.tags.join(", "));
    setViewMode(mode === "detail" ? "detail" : "edit");
    setEditorTab("write");
    setDeleteConfirmOpen(false);
  }, [mode, prompt]);

  useEffect(() => {
    onDirtyChange(viewMode === "edit" ? dirty : false);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange, viewMode]);

  async function copyPromptContent(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      toast("提示词已复制", "success");
    } catch (error) {
      console.error("Failed to copy prompt", error);
      toast("复制提示词失败", "error");
    }
  }

  async function handleFormatMarkdown() {
    if (!draft.content.trim()) return;
    try {
      const [{ default: prettier }, markdownPluginModule] = await Promise.all([
        import("prettier/standalone"),
        import("prettier/plugins/markdown"),
      ]);
      const formatted = await prettier.format(draft.content, {
        parser: "markdown",
        plugins: [markdownPluginModule.default ?? markdownPluginModule],
      });
      setDraft((current) => ({
        ...current,
        content: formatted,
      }));
      toast("已按标准 Markdown formatter 格式化", "success");
    } catch (error) {
      console.error("Failed to format markdown", error);
      toast("Markdown 格式化失败", "error");
    }
  }

  function handleSave() {
    const title = draft.title.trim();
    const content = draft.content.trim();
    const tags = parsePromptCategories(tagsInput);

    if (!title || !content) {
      toast("标题和内容不能为空", "warning");
      return;
    }

    const now = Date.now();
    const nextPrompt: PromptRecord = {
      ...draft,
      title,
      content,
      tags,
      createdAt: prompt?.createdAt ?? draft.createdAt ?? now,
      updatedAt: now,
    };

    onSave(nextPrompt);
    setBaselineDraft(nextPrompt);
    setDraft(nextPrompt);
    setTagsInput(nextPrompt.tags.join(", "));
    setViewMode("detail");
    toast("提示词已保存", "success");
  }

  const panelTitle =
    mode === "create" ? "新增提示词" : viewMode === "detail" ? "提示词详情" : "编辑提示词";
  const activeTags = viewMode === "detail" && prompt ? prompt.tags : draftTags;
  const activeContent =
    viewMode === "detail" && prompt ? prompt.content : draft.content;
  const updatedLabel =
    viewMode === "detail" && prompt
      ? formatPromptTime(prompt.updatedAt)
      : prompt
        ? formatPromptTime(prompt.updatedAt)
        : "保存后生成";
  const metaChips = [
    `${activeTags.length} 个标签`,
    `${activeContent.trim().length} 字内容`,
    updatedLabel,
  ];
  const renderedMarkdown = useMemo(
    () => renderMarkdownToHtml(activeContent),
    [activeContent],
  );

  return (
    <div
      ref={pageRef}
      style={{ opacity: 0 }}
      className="flex h-full min-h-0 w-full min-w-0 flex-col"
    >
      <div className="shrink-0 px-6 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-4">
            <button
              onClick={onBack}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              返回提示词列表
            </button>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-white">
                {panelTitle}
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {viewMode === "detail"
                  ? "查看当前提示词内容与标签信息。"
                  : "编辑 Markdown 内容后保存，返回列表继续管理。"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {metaChips.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-gray-800/80 bg-black/15 px-2.5 py-1 text-[11px] text-gray-400"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {prompt && viewMode === "detail" && (
              <>
                <button
                  onClick={() => void copyPromptContent(prompt.content)}
                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  <Copy className="h-3.5 w-3.5" />
                  复制
                </button>
                <button
                  onClick={() => setViewMode("edit")}
                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                  aria-label="编辑当前提示词"
                >
                  <FilePenLine className="h-3.5 w-3.5" />
                  编辑
                </button>
              </>
            )}
            {(viewMode === "edit" || mode === "create") && (
              <>
                <button
                  onClick={handleFormatMarkdown}
                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  <WandSparkles className="h-3.5 w-3.5" />
                  格式化
                </button>
                <button
                  onClick={handleSave}
                  className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  <Save className="h-3.5 w-3.5" />
                  保存
                </button>
              </>
            )}
            {prompt && (
              <button
                onClick={() => setDeleteConfirmOpen(true)}
                className={`${BUTTON_DANGER_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                aria-label="删除当前提示词"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <section className="rounded-2xl border border-gray-800 bg-gray-900/80">
          <div className="flex items-center justify-between border-b border-gray-800/60 px-5 py-4">
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span>{activeTags.length} 个标签</span>
              <span>{activeContent.trim().length} 字内容</span>
            </div>
            {viewMode === "edit" ? (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                  dirty
                    ? "bg-amber-500/15 text-amber-300"
                    : "bg-emerald-500/15 text-emerald-300"
                }`}
              >
                {dirty ? "未保存" : "已同步"}
              </span>
            ) : null}
          </div>

          <div className="px-5 py-5">
            {viewMode === "detail" && prompt ? (
              <div className="space-y-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
                  <div className="rounded-xl border border-gray-800/80 bg-gray-950/45 px-4 py-4">
                    <div className="text-xs uppercase tracking-widest text-gray-500">
                      名称
                    </div>
                    <div className="mt-2 text-lg font-semibold tracking-tight text-white">
                      {prompt.title}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-800/80 bg-gray-950/45 px-4 py-4">
                    <div className="text-xs uppercase tracking-widest text-gray-500">
                      标签
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {prompt.tags.length > 0 ? (
                        prompt.tags.map((tag) => (
                          <span
                            key={`detail-tag-${tag}`}
                            className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-100"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-gray-400">暂无标签</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-800/90 bg-[linear-gradient(180deg,rgba(3,7,18,0.98)_0%,rgba(6,10,24,0.92)_100%)] px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <div className="border-b border-gray-800/80 pb-4">
                    <div className="text-xs uppercase tracking-widest text-gray-500">
                      Markdown 正文
                    </div>
                  </div>
                  <div className="mt-5 whitespace-pre-wrap text-[15px] leading-8 text-gray-100">
                    <div
                      data-testid="prompt-markdown-preview"
                      className="markdown-preview"
                      dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
                  <div className="rounded-xl border border-gray-800/80 bg-gray-950/45 px-4 py-4">
                    <label className="mb-1.5 block text-xs text-gray-500">名称</label>
                    <input
                      aria-label="名称"
                      value={draft.title}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      className="h-11 w-full rounded-xl border border-gray-700 bg-black/20 px-3 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-indigo-500"
                    />
                  </div>

                  <div className="rounded-xl border border-gray-800/80 bg-gray-950/45 px-4 py-4">
                    <label className="mb-1.5 block text-xs text-gray-500">标签</label>
                    <input
                      aria-label="标签"
                      value={tagsInput}
                      onChange={(event) => setTagsInput(event.target.value)}
                      placeholder="多个标签用逗号、斜杠或换行分隔"
                      className="h-11 w-full rounded-xl border border-gray-700 bg-black/20 px-3 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-indigo-500"
                    />
                    {draftTags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {draftTags.map((tag) => (
                          <span
                            key={`draft-tag-${tag}`}
                            className="rounded-full border border-indigo-500/35 bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-100"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {availableTags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {availableTags.map((tag) => {
                          const active = draftTags.includes(tag);
                          return (
                            <button
                              key={`available-tag-${tag}`}
                              type="button"
                              aria-label={`选择标签${tag}`}
                              onClick={() => {
                                const next = active
                                  ? draftTags.filter((item) => item !== tag)
                                  : [...draftTags, tag];
                                setTagsInput(next.join(", "));
                              }}
                              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                                active
                                  ? "border-indigo-500/45 bg-indigo-500/12 text-white"
                                  : "border-gray-700 bg-black/10 text-gray-300 hover:border-gray-600 hover:text-white"
                              }`}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-800/90 bg-[linear-gradient(180deg,rgba(3,7,18,0.98)_0%,rgba(6,10,24,0.92)_100%)] px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <div className="border-b border-gray-800/80 pb-4">
                    <div className="text-xs uppercase tracking-widest text-gray-500">
                      Markdown 正文
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <label className="block text-xs text-gray-500">
                        内容（Markdown）
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditorTab("write")}
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                            editorTab === "write"
                              ? "border-indigo-500/45 bg-indigo-500/12 text-white"
                              : "border-gray-700 bg-black/10 text-gray-300 hover:border-gray-600 hover:text-white"
                          }`}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditorTab("preview")}
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                            editorTab === "preview"
                              ? "border-indigo-500/45 bg-indigo-500/12 text-white"
                              : "border-gray-700 bg-black/10 text-gray-300 hover:border-gray-600 hover:text-white"
                          }`}
                        >
                          <Eye className="mr-1 inline h-3.5 w-3.5" />
                          预览
                        </button>
                      </div>
                    </div>
                    {editorTab === "write" ? (
                      <CodeMirror
                        value={draft.content}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            content: value,
                          }))
                        }
                        extensions={editorExtensions}
                        theme={oneDark}
                        basicSetup={{
                          lineNumbers: true,
                          foldGutter: true,
                          dropCursor: false,
                          allowMultipleSelections: false,
                          indentOnInput: true,
                          highlightActiveLineGutter: false,
                        }}
                        placeholder="输入 Markdown 提示词正文，支持标题、列表、代码块等语法。"
                      />
                    ) : (
                      <div
                        data-testid="prompt-markdown-preview"
                        className="min-h-[520px] rounded-2xl border border-gray-800 bg-black/25 px-5 py-5"
                        dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {deleteConfirmOpen && prompt && (
        <DeletePromptDialog
          prompt={prompt}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={() => {
            onDelete(prompt.id);
            setDeleteConfirmOpen(false);
          }}
        />
      )}
    </div>
  );
}
