import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  FilePenLine,
  FolderOpen,
  Link2,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { open as pickPath } from "@tauri-apps/plugin-dialog";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_DANGER_OUTLINE_CLASS,
  BUTTON_GHOST_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_MD_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../lib/buttonStyles";
import {
  FIELD_INPUT_CLASS,
  FIELD_MONO_INPUT_CLASS,
  FIELD_SELECT_CLASS,
} from "../lib/formStyles";
import { toast } from "../lib/toast";
import { HintTooltip } from "./HintTooltip";
import { ConfirmModal } from "./ConfirmModal";
import { RuleEditor } from "./rules/RuleEditor";
import { useRuleFile } from "./rules/useRuleFile";
import { useRuleWatch } from "./rules/useRuleWatch";
import { useSync } from "./rules/useSync";
import { normalizeText, toAbsolutePath, toDisplayPath } from "./rules/utils";
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

export function RulesPage({
  storedPaths,
  onPathChange,
  onAddPath,
  onDeletePath,
  onDirtyChange,
}: Props) {
  const {
    homePath,
    tools,
    selectedTool,
    selectedId,
    setSelectedId,
    pathDraft,
    setPathDraft,
    contentDraft,
    setContentDraft,
    fileExists,
    loadingContent,
    saving,
    dirty,
    dirtyRef,
    refreshCurrent,
    handleSaveContent,
    handleSavePath,
    handlePickCurrentPath,
    handleOpenFile,
    handleOpenDirectory,
  } = useRuleFile({ storedPaths, onPathChange });

  useRuleWatch({
    selectedTool,
    homePath,
    dirtyRef,
    refreshCurrent,
  });

  const { syncCandidates, syncTargetIds, toggleSyncTarget, syncing, executeSync } =
    useSync({
      tools,
      selectedId,
      homePath,
      pathDraft,
      fileExists,
      selectedTool,
    });

  // ── local UI state ──
  const [customLabel, setCustomLabel] = useState("");
  const [customPath, setCustomPath] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [pendingSelectedId, setPendingSelectedId] = useState<string | null>(
    null,
  );
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const normalizedLabels = useMemo(
    () => new Set(tools.map((tool) => normalizeText(tool.label).toLowerCase())),
    [tools],
  );
  const normalizedPaths = useMemo(
    () =>
      new Set(tools.map((tool) => normalizeText(tool.path)).filter(Boolean)),
    [tools],
  );

  // ── dirty reporting ──
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  // ── custom path handlers ──
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
    setSelectedId("claude-code");
    toast("已删除自定义规则项", "success");
  }

  // ── render ──
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="shrink-0 px-6 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight text-white">
              规则管理
            </h2>
            <HintTooltip content="在单个工具维度查看、编辑和保存规则文件，路径切换后立即绑定对应配置。" />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <section className="min-w-0 rounded-2xl border border-gray-800 bg-gray-900/80">
          {selectedTool && (
            <div className="space-y-5 px-5 py-5">
              {/* ── path bar ── */}
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
                    className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_MD_CLASS}`}
                  >
                    <FolderOpen className="h-4 w-4" />
                    {selectedTool.kind === "directory"
                      ? "选择目录"
                      : "选择文件"}
                  </button>
                  <button
                    onClick={handleSavePath}
                    className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_MD_CLASS}`}
                  >
                    <FilePenLine className="h-4 w-4" />
                    保存
                  </button>
                  <button
                    onClick={handleOpenDirectory}
                    className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_MD_CLASS}`}
                  >
                    <FolderOpen className="h-4 w-4" />
                    打开目录
                  </button>
                  <button
                    onClick={handleOpenFile}
                    disabled={!fileExists}
                    className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_MD_CLASS}`}
                  >
                    <ExternalLink className="h-4 w-4" />
                    文件
                  </button>
                  {!selectedTool.isBuiltin && (
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

              {/* ── sync panel ── */}
              <div className="rounded-xl border border-gray-800/80 bg-gray-950/30 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-gray-200">
                          同步目标
                        </p>
                        <HintTooltip content="点选卡片后同步。" />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!showCustomForm && (
                        <button
                          onClick={() => setShowCustomForm(true)}
                          className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                        >
                          <Plus className="h-4 w-4" />
                          新增
                        </button>
                      )}
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
                        className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          syncTargetIds.length > 0
                            ? "border-indigo-300/70 bg-indigo-500/16 text-indigo-50 shadow-[0_0_0_1px_rgba(165,180,252,0.18),0_10px_24px_rgba(79,70,229,0.12)] hover:border-indigo-200 hover:bg-indigo-400/24 hover:text-white"
                            : "border-gray-700 bg-black/10 text-gray-200 hover:border-indigo-300/55 hover:bg-indigo-400/12 hover:text-white"
                        }`}
                      >
                        <Link2 className="h-4 w-4" />
                        {syncTargetIds.length > 0
                          ? `同步(${syncTargetIds.length}个)`
                          : "同步"}
                      </button>
                    </div>
                  </div>

                  {/* ── custom path form ── */}
                  {showCustomForm && (
                    <div className="mt-3 rounded-xl border border-gray-800/80 bg-black/15 px-3 py-3">
                      <div className="mb-2 flex items-center justify-end gap-3">
                        <button
                          onClick={() => {
                            setShowCustomForm(false);
                            setCustomLabel("");
                            setCustomPath("");
                          }}
                          className={`${BUTTON_GHOST_CLASS} h-8 px-2 text-sm text-gray-500 hover:text-gray-300`}
                        >
                          <X className="h-4 w-4" />
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
                        <div className="min-w-[240px] flex-1">
                          <input
                            value={customPath}
                            onChange={(event) =>
                              setCustomPath(event.target.value)
                            }
                            placeholder="/Users/you/custom/rules.md"
                            className={FIELD_MONO_INPUT_CLASS}
                          />
                        </div>
                        <button
                          onClick={handlePickCustomPath}
                          className={`${BUTTON_SECONDARY_CLASS} h-10 px-3 text-sm`}
                        >
                          <FolderOpen className="h-4 w-4" />
                          选择文件
                        </button>
                        <button
                          onClick={handleAddCustomPath}
                          className={`${BUTTON_ACCENT_OUTLINE_CLASS} h-10 px-3 text-sm`}
                        >
                          <Save className="h-4 w-4" />
                          保存
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── sync target grid ── */}
                  <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-5">
                    {syncCandidates.map((tool) => {
                      const selected = syncTargetIds.includes(tool.id);
                      return (
                        <button
                          type="button"
                          key={tool.id}
                          onClick={() => toggleSyncTarget(tool.id)}
                          className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                            selected
                              ? "border-indigo-300/80 bg-indigo-400/16 text-indigo-50 shadow-[0_0_0_1px_rgba(165,180,252,0.22),0_10px_24px_rgba(79,70,229,0.12)]"
                              : "border-gray-800 bg-black/15 text-gray-300 hover:border-gray-700 hover:text-white"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13px] font-medium">
                              {tool.label}
                            </span>
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${
                                selected ? "bg-indigo-100" : "bg-gray-700"
                              }`}
                            />
                          </div>
                          <p
                            className={`mt-0.5 text-[10px] ${
                              selected ? "text-indigo-100/90" : "text-gray-500"
                            }`}
                          >
                            {selected ? "已选中" : "点击选择"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── editor ── */}
              <RuleEditor
                contentDraft={contentDraft}
                onContentChange={setContentDraft}
                fileExists={fileExists}
                loadingContent={loadingContent}
                dirty={dirty}
                saving={saving}
                isDirectory={selectedTool.kind === "directory"}
                isBuiltin={selectedTool.isBuiltin}
                fileName={selectedTool.fileName}
                accentClass={selectedTool.accentClass}
                onSave={handleSaveContent}
              />
            </div>
          )}
        </section>
      </div>

      {/* ── modals ── */}
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
          description={`将移除当前自定义规则项"${selectedTool.label}"的入口配置，不会删除磁盘上的实际文件。`}
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
