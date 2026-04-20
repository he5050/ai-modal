import { useEffect, useMemo, useRef, useState } from "react";
import { animate, spring } from "animejs";
import {
  ArrowLeft,
  Copy,
  FilePenLine,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  BUTTON_DANGER_CLASS,
  BUTTON_DANGER_OUTLINE_CLASS,
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_SM_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../lib/buttonStyles";
import {
  createEmptyPrompt,
  parsePromptCategories,
  serializePromptCategories,
} from "../lib/promptStore";
import { toast } from "../lib/toast";
import type { PromptRecord } from "../types";

interface Props {
  prompt: PromptRecord | null;
  mode: "detail" | "edit" | "create";
  availableCategories: string[];
  onBack: () => void;
  onSave: (prompt: PromptRecord) => void;
  onDelete: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

function createDraft(prompt: PromptRecord | null) {
  return prompt
    ? { ...prompt }
    : createEmptyPrompt(Date.now(), "");
}

function serializeDraftComparable(record: PromptRecord) {
  return JSON.stringify({
    id: record.id,
    title: record.title,
    content: record.content,
    category: record.category,
    tags: record.tags,
    note: record.note,
  });
}

function parseTagsInput(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildDraftCategoryValue(selectedValues: string[], inputValue: string) {
  return serializePromptCategories([
    ...selectedValues,
    ...parsePromptCategories(inputValue),
  ]);
}

function formatPromptTime(timestamp: number | null) {
  if (timestamp == null) return "暂无更新";
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

function DeletePromptDialog({
  title,
  onCancel,
  onConfirm,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-white">确认删除提示词</h3>
        <p className="mt-2 text-sm leading-6 text-gray-400">
          将删除 <span className="font-medium text-gray-200">{title}</span>
          ，该操作不可撤销。
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            <X className="h-3.5 w-3.5" />
            取消
          </button>
          <button
            onClick={onConfirm}
            className={`${BUTTON_DANGER_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}

export function PromptDetailPage({
  prompt,
  mode,
  availableCategories,
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
  const [draftCategorySelections, setDraftCategorySelections] = useState<string[]>(
    parsePromptCategories(prompt?.category ?? ""),
  );
  const [draftCategoryInput, setDraftCategoryInput] = useState("");
  const [tagsInput, setTagsInput] = useState((prompt?.tags ?? []).join(", "));
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const dirty = useMemo(
    () =>
      serializeDraftComparable(draft) !== serializeDraftComparable(baselineDraft),
    [baselineDraft, draft],
  );

  const draftCategoryPreview = useMemo(
    () =>
      parsePromptCategories(
        buildDraftCategoryValue(draftCategorySelections, draftCategoryInput),
      ),
    [draftCategoryInput, draftCategorySelections],
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
    setDraftCategorySelections(parsePromptCategories(nextDraft.category));
    setDraftCategoryInput("");
    setTagsInput(nextDraft.tags.join(", "));
    setViewMode(mode === "detail" ? "detail" : "edit");
    setDeleteConfirmOpen(false);
  }, [mode, prompt]);

  useEffect(() => {
    onDirtyChange(viewMode === "edit" ? dirty : false);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange, viewMode]);

  function applyDraftCategories(selectedValues: string[], inputValue: string) {
    setDraftCategorySelections(selectedValues);
    setDraftCategoryInput(inputValue);
    setDraft((current) => ({
      ...current,
      category: buildDraftCategoryValue(selectedValues, inputValue),
    }));
  }

  async function copyPromptContent(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      toast("提示词已复制", "success");
    } catch (error) {
      console.error("Failed to copy prompt", error);
      toast("复制提示词失败", "error");
    }
  }

  function handleSave() {
    const title = draft.title.trim();
    const content = draft.content.trim();
    const category =
      serializePromptCategories(
        parsePromptCategories(
          buildDraftCategoryValue(draftCategorySelections, draftCategoryInput),
        ),
      ) || "未分类";

    if (!title || !content) {
      toast("标题和内容不能为空", "warning");
      return;
    }

    const now = Date.now();
    const nextPrompt: PromptRecord = {
      ...draft,
      title,
      content,
      category,
      tags: parseTagsInput(tagsInput),
      note: draft.note.trim(),
      createdAt: prompt?.createdAt ?? draft.createdAt ?? now,
      updatedAt: now,
    };

    onSave(nextPrompt);
    setBaselineDraft(nextPrompt);
    setDraft(nextPrompt);
    setDraftCategorySelections(parsePromptCategories(nextPrompt.category));
    setDraftCategoryInput("");
    setTagsInput(nextPrompt.tags.join(", "));
    setViewMode("detail");
    toast("提示词已保存", "success");
  }

  const panelTitle =
    mode === "create" ? "新增提示词" : viewMode === "detail" ? "提示词详情" : "编辑提示词";
  const activeTitle =
    (viewMode === "detail" && prompt ? prompt.title : draft.title).trim() ||
    "未命名提示词";
  const activeCategories =
    viewMode === "detail" && prompt
      ? parsePromptCategories(prompt.category)
      : draftCategoryPreview;
  const activeTags =
    viewMode === "detail" && prompt ? prompt.tags : parseTagsInput(tagsInput);
  const activeContent =
    viewMode === "detail" && prompt ? prompt.content : draft.content;
  const activeNote = viewMode === "detail" && prompt ? prompt.note : draft.note;
  const updatedLabel =
    viewMode === "detail" && prompt
      ? formatPromptTime(prompt.updatedAt)
      : prompt
        ? formatPromptTime(prompt.updatedAt)
        : "保存后生成";
  const metaChips = [
    `${activeCategories.length} 个分类`,
    `${activeTags.length} 个标签`,
    `${activeContent.trim().length} 字内容`,
    updatedLabel,
  ];

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
                  ? "查看当前提示词内容与分类信息。"
                  : "编辑内容后保存，返回列表继续管理。"}
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
              <button
                onClick={handleSave}
                className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              >
                <Save className="h-3.5 w-3.5" />
                保存
              </button>
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
              <span>{activeCategories.length} 个分类</span>
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
            <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-800/80 bg-gray-950/45 px-4 py-4">
                  <div className="text-xs uppercase tracking-widest text-gray-500">
                    分类
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {parsePromptCategories(prompt.category).map((category) => (
                      <span
                        key={`detail-category-${category}`}
                        className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-100"
                      >
                        {category}
                      </span>
                    ))}
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
                          className="rounded-full border border-gray-700 bg-black/10 px-2 py-1 text-[10px] text-gray-300"
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-gray-400">暂无标签</span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-800/80 bg-gray-950/45 px-4 py-4">
                  <div className="text-xs uppercase tracking-widest text-gray-500">
                    备注
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-200">
                    {prompt.note || "暂无备注"}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-800/90 bg-[linear-gradient(180deg,rgba(3,7,18,0.98)_0%,rgba(6,10,24,0.92)_100%)] px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="border-b border-gray-800/80 pb-4">
                  <div className="text-xs uppercase tracking-widest text-gray-500">
                    提示词正文
                  </div>
                  <div className="mt-2 text-lg font-semibold tracking-tight text-white">
                    {prompt.title}
                  </div>
                </div>
                <div className="mt-5 whitespace-pre-wrap text-[15px] leading-8 text-gray-100">
                  {prompt.content}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-800/80 bg-gray-950/45 px-4 py-4">
                <label className="mb-1.5 block text-xs text-gray-500">标题</label>
                <input
                  aria-label="标题"
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
                  <label className="mb-1.5 block text-xs text-gray-500">分类</label>
                  <input
                    aria-label="分类"
                    value={draftCategoryInput}
                    onChange={(event) =>
                      applyDraftCategories(
                        draftCategorySelections,
                        event.target.value,
                      )
                    }
                    placeholder="输入新分类，支持逗号或斜杠分隔"
                    className="h-11 w-full rounded-xl border border-gray-700 bg-black/20 px-3 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-indigo-500"
                  />
                  {draftCategoryPreview.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {draftCategoryPreview.map((category) => (
                        <span
                          key={`draft-category-${category}`}
                          className="rounded-full border border-indigo-500/35 bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-100"
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  )}
                  {availableCategories.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {availableCategories.map((category) => {
                        const active = draftCategoryPreview.includes(category);
                        return (
                          <button
                            key={`available-category-${category}`}
                            type="button"
                            aria-label={`选择分类${category}`}
                            onClick={() => {
                              const nextSelections = active
                                ? draftCategorySelections.filter(
                                    (item) => item !== category,
                                  )
                                : [...draftCategorySelections, category];
                              applyDraftCategories(
                                nextSelections,
                                draftCategoryInput,
                              );
                            }}
                            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                              active
                                ? "border-indigo-500/45 bg-indigo-500/12 text-white"
                                : "border-gray-700 bg-black/10 text-gray-300 hover:border-gray-600 hover:text-white"
                            }`}
                          >
                            {category}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-gray-800/80 bg-gray-950/45 px-4 py-4">
                    <label className="mb-1.5 block text-xs text-gray-500">标签</label>
                    <input
                      aria-label="标签"
                      value={tagsInput}
                      onChange={(event) => setTagsInput(event.target.value)}
                      placeholder="多个标签用逗号分隔"
                      className="h-11 w-full rounded-xl border border-gray-700 bg-black/20 px-3 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-indigo-500"
                    />
                </div>

                <div className="rounded-xl border border-gray-800/80 bg-gray-950/45 px-4 py-4">
                <label className="mb-1.5 block text-xs text-gray-500">备注</label>
                <textarea
                  aria-label="备注"
                  value={draft.note}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  className="min-h-[112px] w-full rounded-xl border border-gray-700 bg-black/20 px-3 py-3 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-indigo-500"
                />
              </div>
              </div>

              <div className="rounded-2xl border border-gray-800/90 bg-[linear-gradient(180deg,rgba(3,7,18,0.98)_0%,rgba(6,10,24,0.92)_100%)] px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="border-b border-gray-800/80 pb-4">
                  <div className="text-xs uppercase tracking-widest text-gray-500">
                    提示词正文
                  </div>
                  <div className="mt-2 text-lg font-semibold tracking-tight text-white">
                    {draft.title.trim() || "未命名提示词"}
                  </div>
                </div>
                <div className="mt-4">
                <label className="mb-1.5 block text-xs text-gray-500">内容</label>
                <textarea
                  aria-label="内容"
                  value={draft.content}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      content: event.target.value,
                    }))
                  }
                  className="min-h-[520px] w-full rounded-xl border border-gray-700 bg-black/20 px-4 py-4 text-[15px] leading-8 text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-indigo-500"
                />
              </div>
              </div>
            </div>
          )}
          </div>
        </section>
      </div>

      {deleteConfirmOpen && prompt && (
        <DeletePromptDialog
          title={prompt.title}
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
