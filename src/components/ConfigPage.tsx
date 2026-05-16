import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  buildConfigGroups,
  inferConfigFormatFromPath,
  normalizeGroupRelativePath,
  resolveGroupAbsolutePath,
} from "../lib/configGroups";
import {
  formatConfigContent,
  getSupportedConfigFormatsLabel,
  isSupportedConfigFormat,
} from "../lib/configFormatter";
import { toast } from "../lib/toast";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_MD_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../lib/buttonStyles";
import { FIELD_SELECT_CLASS, FIELD_MONO_INPUT_CLASS } from "../lib/formStyles";
import type { ConfigGroupId, ConfigPath, Provider } from "../types";
import { HintTooltip } from "./HintTooltip";
import { EmptyState } from "./ui";
import { SNOW_REQUEST_METHOD_OPTIONS } from "./configs/constants";
import { toDisplayPath, getModelConfigLabel, getModelConfigResultText } from "./configs/utils";
import { ConfigConfirmModal } from "./configs/ConfirmModal";
import {
  ClaudeApplyModal,
  CodexApplyModal,
  GeminiApplyModal,
  SnowApplyModal,
  OpenCodeApplyModal,
} from "./configs/applyModals";
import { useConfigDraft } from "./configs/useConfigDraft";
import { useModelConfig } from "./configs/useModelConfig";
import { useApplyShortcut } from "./configs/useApplyShortcut";
import { ConfigToolbar } from "./configs/components/ConfigToolbar";
import { ConfigFileTabs } from "./configs/components/ConfigFileTabs";
import { ConfigEditorPanel } from "./configs/components/ConfigEditorPanel";

interface Props {
  providers: Provider[];
  storedPaths: ConfigPath[];
  onUpsertPath: (path: ConfigPath) => void;
  onDeletePath: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
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
  const [selectedGroupId, setSelectedGroupId] = useState<ConfigGroupId>("claude");
  const [selectedFileId, setSelectedFileId] = useState<string>("claude");
  const [pendingSwitchTarget, setPendingSwitchTarget] = useState<PendingSwitchTarget | null>(null);
  const [showAddFileForm, setShowAddFileForm] = useState(false);
  const [newRelativePath, setNewRelativePath] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedAvailableProviderId, setSelectedAvailableProviderId] = useState<string>("");

  const {
    modelConfigs,
    selectedModelConfig,
    setSelectedModelConfigId,
    modelConfigDirty,
    testingModelConfig,
    handleCreateModelConfig,
    handleSaveModelConfig,
    handleDeleteModelConfig,
    handleImportSelectedAvailableModel: handleImportSelectedAvailableModelFromHook,
    handleTestCurrentModelConfig,
    updateSelectedModelConfig,
  } = useModelConfig();

  const {
    draftsByFileId,
    saving,
    homePath,
    dirty: fileDirty,
    getFileDirty,
    updateDraftState,
    refreshCurrent,
    ensureFileDraftState,
    saveFileContent,
    openFile,
    openDirectory,
    discardChanges,
  } = useConfigDraft();

  const groups = useMemo(() => (homePath ? buildConfigGroups(storedPaths, homePath) : []), [homePath, storedPaths]);
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null;
  const selectedFile = selectedGroup?.files.find((file) => file.id === selectedFileId) ?? selectedGroup?.files[0] ?? null;

  const activeDraft = selectedFile ? draftsByFileId[selectedFile.id] : null;
  const activeContentDraft = activeDraft?.contentDraft ?? "";
  const activeFileExists = activeDraft?.fileExists ?? false;
  const activeLoading = activeDraft?.loading ?? false;

  const dirty = modelConfigDirty || fileDirty;

  const availableProviderOptions = useMemo(
    () =>
      providers
        .map((provider) => {
          const models = Array.from(
            new Set(
              (provider.lastResult?.results ?? [])
                .filter((result) => result.available)
                .map((result) => result.model)
                .filter(Boolean),
            ),
          ).map((model) => {
            const result = (provider.lastResult?.results ?? []).find((item) => item.available && item.model === model);
            return {
              id: `${provider.id}::${model}`,
              model,
              baseUrl: provider.baseUrl,
              apiKey: provider.apiKey,
              supportedProtocols: result?.supported_protocols ?? [],
            };
          });
          return models.length > 0
            ? { id: provider.id, providerName: provider.name, availableCount: models.length, models }
            : null;
        })
        .filter(Boolean) as {
          id: string;
          providerName: string;
          availableCount: number;
          models: { id: string; model: string; baseUrl: string; apiKey: string; supportedProtocols: string[] }[];
        }[],
    [providers],
  );

  const selectedAvailableProvider =
    availableProviderOptions.find((item) => item.id === selectedAvailableProviderId) ?? availableProviderOptions[0] ?? null;
  const selectedAvailableModel = selectedAvailableProvider?.models[0] ?? null;

  const isClaudeSettingsShortcutTarget = selectedGroup?.id === "claude" && selectedFile?.id === "claude";
  const isCodexShortcutTarget = selectedGroup?.id === "codex";
  const isGeminiShortcutTarget = selectedGroup?.id === "gemini";
  const isSnowShortcutTarget = selectedGroup?.id === "snow";
  const isOpenCodeShortcutTarget = selectedGroup?.id === "opencode";

  const {
    claudeApplyModalOpen,
    codexApplyModalOpen,
    geminiApplyModalOpen,
    snowApplyModalOpen,
    openCodeApplyModalOpen,
    setClaudeApplyModalOpen,
    setCodexApplyModalOpen,
    setGeminiApplyModalOpen,
    setSnowApplyModalOpen,
    setOpenCodeApplyModalOpen,
    selectedCodexApplyModel,
    setSelectedCodexApplyModel,
    selectedGeminiApplyModel,
    setSelectedGeminiApplyModel,
    selectedSnowRequestMethod,
    setSelectedSnowRequestMethod,
    selectedSnowAdvancedModel,
    setSelectedSnowAdvancedModel,
    selectedSnowBasicModel,
    setSelectedSnowBasicModel,
    selectedOpenCodeModels,
    claudeEnvSelection,
    handleClaudeEnvFieldChange,
    handleApplyClaudeShortcutToDraft,
    handleApplyCodexShortcutToDraft,
    handleApplyGeminiShortcutToDraft,
    handleApplySnowShortcutToDraft,
    handleApplyOpenCodeShortcutToDraft,
    handleToggleOpenCodeModel,
    handleApplyShortcut,
  } = useApplyShortcut({
    selectedGroup,
    selectedFile,
    activeContentDraft,
    selectedAvailableModel,
    selectedAvailableProvider,
    isClaudeSettingsShortcutTarget,
    isCodexShortcutTarget,
    isGeminiShortcutTarget,
    isSnowShortcutTarget,
    isOpenCodeShortcutTarget,
    updateDraftState,
    ensureFileDraftState,
  });

  async function handleFormat() {
    if (!activeContentDraft || !selectedFile) return;
    try {
      if (!isSupportedConfigFormat(selectedFile.format)) {
        toast(`当前仅对 ${getSupportedConfigFormatsLabel()} 配置提供标准格式化`, "warning");
        return;
      }
      const result = await formatConfigContent(activeContentDraft, selectedFile.format);
      updateDraftState(selectedFile.id, { contentDraft: result.formatted });
      toast(
        result.normalizedPunctuation
          ? `已格式化 ${selectedFile.format.toUpperCase()} 配置，并自动将中文语法符号转换为英文符号`
          : `已格式化 ${selectedFile.format.toUpperCase()} 配置`,
        "success",
      );
    } catch (error) {
      console.error("Failed to format config", error);
      toast(error instanceof Error ? `配置格式化失败：${error.message}` : "配置格式化失败", "error");
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(activeContentDraft);
      toast("已复制当前配置内容", "success");
    } catch {
      toast("复制失败", "error");
    }
  }

  async function handleSaveContent() {
    if (!selectedFile) return false;
    return saveFileContent(selectedFile, activeContentDraft, onUpsertPath);
  }

  // Effects
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
    if (!selectedFile && selectedGroup.files[0]) setSelectedFileId(selectedGroup.files[0].id);
  }, [groups, selectedFile, selectedGroup]);

  useEffect(() => {
    if (availableProviderOptions.length === 0) { setSelectedAvailableProviderId(""); return; }
    const exists = availableProviderOptions.some((item) => item.id === selectedAvailableProviderId);
    if (!exists) setSelectedAvailableProviderId(availableProviderOptions[0].id);
  }, [availableProviderOptions, selectedAvailableProviderId]);

  useEffect(() => {
    if (!selectedFile) return;
    if (draftsByFileId[selectedFile.id]?.loadedPath === selectedFile.absolutePath) return;
    void refreshCurrent(selectedFile);
  }, [draftsByFileId, selectedFile?.id, selectedFile?.absolutePath, refreshCurrent]);

  // Switch helpers
  function applySwitch(target: PendingSwitchTarget) {
    setSelectedGroupId(target.groupId);
    setSelectedFileId(target.fileId);
  }

  function requestSwitch(target: PendingSwitchTarget) {
    if (!selectedFile || !getFileDirty(selectedFile.id)) { applySwitch(target); return; }
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

  // File management
  function handleAddGroupFile() {
    if (!selectedGroup || !homePath) return;
    const relativePath = normalizeGroupRelativePath(newRelativePath);
    if (!relativePath) { toast("只允许当前目录下的相对路径，且不能包含 ../", "warning"); return; }
    const nextId = `${selectedGroup.id}::${relativePath}`;
    const absolutePath = resolveGroupAbsolutePath(homePath, selectedGroup.rootDir, relativePath);
    if (selectedGroup.files.some((file) => file.id === nextId)) { toast("该文件已在当前分组中存在", "warning"); return; }
    onUpsertPath({ id: nextId, label: relativePath.split("/").pop() ?? relativePath, path: absolutePath, isBuiltin: false, kind: "file", format: inferConfigFormatFromPath(absolutePath) });
    setShowAddFileForm(false);
    setNewRelativePath("");
    setSelectedFileId(nextId);
    toast("已新增组内配置文件", "success");
  }

  function handleDeleteCurrentCustomPath() {
    if (!selectedFile || selectedFile.isBuiltin) return;
    setShowDeleteConfirm(false);
    onDeletePath(selectedFile.id);
    const fallbackFile = selectedGroup?.files.find((file) => file.id !== selectedFile.id) ?? null;
    if (fallbackFile) setSelectedFileId(fallbackFile.id);
    toast("已删除当前自定义配置文件入口", "success");
  }

  async function handleSaveAndSwitch() {
    if (!selectedFile) return;
    const saved = await saveFileContent(selectedFile, activeContentDraft, onUpsertPath);
    if (!saved || !pendingSwitchTarget) return;
    applySwitch(pendingSwitchTarget);
    setPendingSwitchTarget(null);
  }

  function handleImportSelectedAvailableModel() {
    handleImportSelectedAvailableModelFromHook(selectedAvailableModel, selectedAvailableProvider);
  }

  // ─── Render ───

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="shrink-0 px-6 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight text-white">配置管理</h2>
            <HintTooltip content="管理 Claude、Codex、Gemini、OpenCode、Qwen、Snow 的主配置文件，和规则文件分开维护。" />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <section className="min-w-0 rounded-2xl border border-gray-800 bg-gray-900/80">
          {selectedGroup && selectedFile && (
            <div className="space-y-5 px-5 py-5">
              <ConfigToolbar
                groups={groups.map(({ id, label }) => ({ id, label }))}
                selectedGroup={selectedGroup.id}
                selectedFile={selectedFile}
                homePath={homePath}
                onGroupChange={handleRequestGroupSwitch}
                onOpenDirectory={() => { if (selectedFile) openDirectory(selectedFile); }}
                onOpenFile={() => { if (selectedFile) openFile(selectedFile); }}
                onDeleteClick={() => setShowDeleteConfirm(true)}
                fileExists={activeFileExists}
              />

              <ConfigFileTabs
                files={selectedGroup.files.map(({ id, fileName }) => ({ id, fileName }))}
                selectedFileId={selectedFile.id}
                showAddForm={showAddFileForm}
                newRelativePath={newRelativePath}
                homePath={homePath}
                groupRootDir={selectedGroup.rootDir}
                getFileDirty={getFileDirty}
                onSwitchFile={handleRequestFileSwitch}
                onShowAddForm={(show) => setShowAddFileForm(show)}
                onNewPathChange={setNewRelativePath}
                onCancelAdd={() => { setShowAddFileForm(false); setNewRelativePath(""); }}
                onSaveAdd={handleAddGroupFile}
                toDisplayPath={toDisplayPath}
                resolveGroupAbsolutePath={resolveGroupAbsolutePath}
              />

              {/* Quick model selector */}
              <div className="rounded-xl border border-gray-800/80 bg-gray-950/30 px-4 py-4">
                {availableProviderOptions.length > 0 && selectedAvailableModel ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-200">快捷模型</p>
                      <HintTooltip content="这里只选 Provider；具体模型映射在弹窗里完成。" />
                    </div>
                    <div className="w-[240px]">
                      <select value={selectedAvailableProvider?.id ?? ""} onChange={(event) => setSelectedAvailableProviderId(event.target.value)} className={FIELD_SELECT_CLASS} aria-label="选择快捷模型 Provider">
                        {availableProviderOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.providerName} ({option.availableCount} 个可用)
                          </option>
                        ))}
                      </select>
                    </div>
                    {(isClaudeSettingsShortcutTarget || isCodexShortcutTarget || isGeminiShortcutTarget || isSnowShortcutTarget || isOpenCodeShortcutTarget) && (
                      <button onClick={handleApplyShortcut} className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
                        应用
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">当前还没有可用模型。请先去模型列表或详情页完成检测。</div>
                )}
              </div>

              {/* Model config section (currently disabled) */}
              {false && (
                <div className="rounded-xl border border-gray-800/80 bg-gray-950/30 px-4 py-4">
                  <EmptyState title="当前还没有模型配置" description="点击右上角新建创建第一条" className="mt-3 text-left" />
                </div>
              )}

              <ConfigEditorPanel
                value={activeContentDraft}
                onChange={(value) => selectedFile && updateDraftState(selectedFile.id, { contentDraft: value })}
                format={selectedFile.format}
                loading={activeLoading}
                fileName={selectedFile.fileName}
                fileExists={activeFileExists}
                hasDirty={!!(selectedFile && getFileDirty(selectedFile.id))}
                accentClass={selectedGroup.accentClass}
                onDiscard={() => { if (selectedFile) discardChanges(selectedFile.id); }}
                onFormat={handleFormat}
                onCopy={handleCopy}
                onSave={() => void handleSaveContent()}
              />
            </div>
          )}
        </section>
      </div>

      {/* Modals */}
      {pendingSwitchTarget && selectedFile && (
        <ConfigConfirmModal
          title="切换当前文件？"
          description="当前文件有未保存内容。请选择直接切换，或先保存后再切换。"
          primaryLabel="切换"
          tertiaryLabel="保存"
          onPrimary={() => { if (pendingSwitchTarget) { applySwitch(pendingSwitchTarget); setPendingSwitchTarget(null); } }}
          onTertiary={() => void handleSaveAndSwitch()}
        />
      )}

      {showDeleteConfirm && selectedFile && !selectedFile.isBuiltin && (
        <ConfigConfirmModal
          title="删除当前组内文件？"
          description={`将移除当前文件"${selectedFile.label}"的入口配置，不会删除磁盘上的实际文件。`}
          primaryLabel="确认删除"
          secondaryLabel="取消"
          onPrimary={handleDeleteCurrentCustomPath}
          onSecondary={() => setShowDeleteConfirm(false)}
        />
      )}

      {claudeApplyModalOpen && selectedAvailableModel && selectedAvailableProvider && (
        <ClaudeApplyModal
          providerName={selectedAvailableProvider.providerName}
          availableModels={selectedAvailableProvider.models.map((item) => item.model)}
          selection={claudeEnvSelection}
          onChange={handleClaudeEnvFieldChange}
          onConfirm={() => void handleApplyClaudeShortcutToDraft()}
          onCancel={() => setClaudeApplyModalOpen(false)}
        />
      )}

      {codexApplyModalOpen && selectedAvailableProvider && (
        <CodexApplyModal
          providerName={selectedAvailableProvider.providerName}
          availableModels={selectedAvailableProvider.models.map((item) => item.model)}
          selectedModel={selectedCodexApplyModel}
          onChange={setSelectedCodexApplyModel}
          onConfirm={() => void handleApplyCodexShortcutToDraft()}
          onCancel={() => setCodexApplyModalOpen(false)}
        />
      )}

      {geminiApplyModalOpen && selectedAvailableProvider && (
        <GeminiApplyModal
          providerName={selectedAvailableProvider.providerName}
          availableModels={selectedAvailableProvider.models.map((item) => item.model)}
          selectedModel={selectedGeminiApplyModel}
          onChange={setSelectedGeminiApplyModel}
          onConfirm={() => void handleApplyGeminiShortcutToDraft()}
          onCancel={() => setGeminiApplyModalOpen(false)}
        />
      )}

      {snowApplyModalOpen && selectedAvailableProvider && (
        <SnowApplyModal
          providerName={selectedAvailableProvider.providerName}
          availableModels={selectedAvailableProvider.models.map((item) => item.model)}
          requestMethods={SNOW_REQUEST_METHOD_OPTIONS}
          selectedRequestMethod={selectedSnowRequestMethod}
          selectedAdvancedModel={selectedSnowAdvancedModel}
          selectedBasicModel={selectedSnowBasicModel}
          onRequestMethodChange={setSelectedSnowRequestMethod}
          onAdvancedModelChange={setSelectedSnowAdvancedModel}
          onBasicModelChange={setSelectedSnowBasicModel}
          onConfirm={() => void handleApplySnowShortcutToDraft()}
          onCancel={() => setSnowApplyModalOpen(false)}
        />
      )}

      {openCodeApplyModalOpen && selectedAvailableProvider && (
        <OpenCodeApplyModal
          providerName={selectedAvailableProvider.providerName}
          models={selectedAvailableProvider.models.map((item) => item.model)}
          selectedModels={selectedOpenCodeModels}
          onToggle={handleToggleOpenCodeModel}
          onConfirm={() => void handleApplyOpenCodeShortcutToDraft()}
          onCancel={() => setOpenCodeApplyModalOpen(false)}
        />
      )}
    </div>
  );
}
