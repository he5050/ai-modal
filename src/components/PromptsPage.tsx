import { useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Copy, Download, Eye, Plus, Search, Trash2, Upload, X } from "lucide-react";
import {
  BUTTON_ICON_MD_CLASS,
  BUTTON_DANGER_OUTLINE_CLASS,
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../lib/buttonStyles";
import {
  buildPromptCategories,
  mergeImportedPrompts,
  parsePromptImportJson,
  serializePromptRecords,
  summarizePromptImport,
} from "../lib/promptStore";
import { toast } from "../lib/toast";
import type { PromptRecord } from "../types";

interface Props {
  prompts: PromptRecord[];
  onCreate: () => void;
  onOpenDetail: (id: string, mode: "detail" | "edit") => void;
  onDelete: (id: string) => void;
  onImport: (nextPrompts: PromptRecord[]) => void;
}

function summarizePromptContent(content: string) {
  return content.replace(/\s+/g, " ").trim();
}

function formatPromptTime(timestamp: number | null) {
  if (timestamp == null) return "暂无更新";
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hour}:${minute}`;
}

function DeletePromptDialog({
  prompt,
  onCancel,
  onConfirm,
}: {
  prompt: PromptRecord;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-white">确认删除提示词</h3>
        <p className="mt-2 text-sm leading-6 text-gray-400">
          将删除 <span className="font-medium text-gray-200">{prompt.title}</span>
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

export function PromptsPage({
  prompts,
  onCreate,
  onOpenDetail,
  onDelete,
  onImport,
}: Props) {
  const [selectedTag, setSelectedTag] = useState("全部");
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PromptRecord | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const tags = buildPromptCategories(prompts);
  const filtered = prompts.filter((item) => {
    const matchesTag = selectedTag === "全部" || item.tags.includes(selectedTag);
    const keyword = query.trim().toLowerCase();
    const haystack = [item.title, item.content, ...item.tags].join("\n").toLowerCase();
    const matchesQuery = keyword === "" || haystack.includes(keyword);
    return matchesTag && matchesQuery;
  });

  async function copyPromptContent(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      toast("提示词已复制", "success");
    } catch (error) {
      console.error("Failed to copy prompt", error);
      toast("复制提示词失败", "error");
    }
  }

  async function handleExportJson() {
    try {
      const targetPath = await save({
        title: "导出提示词库",
        defaultPath: "ai-modal-prompts.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!targetPath) return;
      await writeTextFile(targetPath, serializePromptRecords(prompts));
      toast("提示词库已导出", "success");
    } catch (error) {
      console.error("Failed to export prompts", error);
      toast("导出提示词失败", "error");
    }
  }

  async function handleImportFile(file: File) {
    try {
      const text = await file.text();
      const parsed = parsePromptImportJson(text);
      const merged = mergeImportedPrompts(prompts, parsed.valid);
      const summary = {
        ...merged.summary,
        skipped: merged.summary.skipped + parsed.skipped,
      };
      onImport(merged.nextRecords);
      toast(summarizePromptImport(summary), "success");
    } catch (error) {
      console.error("Failed to import prompts", error);
      toast(
        error instanceof Error ? error.message : "导入提示词失败",
        "error",
      );
    }
  }

  const emptyListMessage =
    prompts.length === 0
      ? "当前还没有提示词。你可以先新增一条，或者导入一个 JSON 提示词库。"
      : "当前筛选下还没有匹配的提示词。";

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="shrink-0 px-6 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <h2 className="text-base font-semibold tracking-tight text-white">
              提示词管理
            </h2>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              标签浏览、搜索定位和资产级导入导出。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImportFile(file);
                event.currentTarget.value = "";
              }}
            />
            <button
              onClick={() => importInputRef.current?.click()}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS} bg-black/10 text-gray-300`}
            >
              <Upload className="h-3.5 w-3.5" />
              导入
            </button>
            <button
              onClick={() => void handleExportJson()}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS} bg-black/10 text-gray-300`}
            >
              <Download className="h-3.5 w-3.5" />
              导出
            </button>
            <button
              onClick={onCreate}
              className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              <Plus className="h-3.5 w-3.5" />
              新增
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/80 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、内容或标签"
                className="h-10 w-full rounded-xl border border-gray-700 bg-gray-950/85 px-3 pl-9 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map((item) => (
              <button
                key={item.key}
                onClick={() => setSelectedTag(item.key)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${
                  selectedTag === item.key
                    ? "border-indigo-500/45 bg-indigo-500/12 text-white"
                    : "border-gray-800 bg-black/10 text-gray-300 hover:border-gray-700 hover:text-white"
                }`}
                aria-label={item.label}
              >
                <span className="font-medium">{item.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    selectedTag === item.key
                      ? "bg-white/10 text-white/80"
                      : "bg-gray-800 text-gray-400"
                  }`}
                >
                  {item.count}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-gray-800/90 bg-black/10">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-sm text-gray-500">
                {emptyListMessage}
              </div>
            ) : (
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b border-gray-800/70 bg-gray-950/25">
                    <th className="w-[40%] px-4 py-2 text-left text-[11px] font-medium tracking-wide text-gray-500">
                      标题
                    </th>
                    <th className="w-[28%] px-4 py-2 text-left text-[11px] font-medium tracking-wide text-gray-500">
                      标签
                    </th>
                    <th className="w-[14%] px-4 py-2 text-left text-[11px] font-medium tracking-wide text-gray-500">
                      更新时间
                    </th>
                    <th className="w-[18%] px-4 py-2 text-right text-[11px] font-medium tracking-wide text-gray-500">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, index) => (
                    <tr
                      key={item.id}
                      className={`transition-colors hover:bg-gray-800/20 ${
                        index < filtered.length - 1
                          ? "border-b border-gray-800/50"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-2.5 align-top">
                        <div className="truncate text-sm font-medium text-white">
                          {item.title}
                        </div>
                        <div className="mt-1 truncate text-xs leading-5 text-gray-500">
                          {summarizePromptContent(item.content) || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          {item.tags.length > 0 ? (
                            item.tags.map((tag) => (
                              <span
                                key={`${item.id}-${tag}`}
                                className="rounded-full border border-gray-700 bg-gray-950 px-2 py-0.5 text-[10px] text-gray-400"
                              >
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-600">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 align-top text-xs text-gray-500">
                        <span className="whitespace-nowrap">
                          {formatPromptTime(item.updatedAt)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onOpenDetail(item.id, "detail")}
                            className={BUTTON_ICON_MD_CLASS}
                            aria-label={`详情${item.title}`}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => void copyPromptContent(item.content)}
                            className={BUTTON_ICON_MD_CLASS}
                            aria-label={`复制${item.title}`}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(item)}
                            className={`${BUTTON_ICON_MD_CLASS} border-red-500/30 text-red-200 hover:border-red-400/40 hover:text-white`}
                            aria-label={`删除${item.title}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {deleteTarget && (
        <DeletePromptDialog
          prompt={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            onDelete(deleteTarget.id);
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}
