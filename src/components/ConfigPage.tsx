import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  buildConfigGroups,
  inferConfigFormatFromPath,
  normalizeGroupRelativePath,
  resolveGroupAbsolutePath,
} from "../lib/configGroups";
import {
  buildClaudeWritebackUrl,
  buildGeminiWritebackUrl,
  buildOpenAiCompatibleWritebackUrl,
  buildWritebackUrl,
  inferWritebackKindFromModel,
} from "../lib/providerBaseUrl";
import {
  formatConfigContent,
  getSupportedConfigFormatsLabel,
  isSupportedConfigFormat,
} from "../lib/configFormatter";
import { toast } from "../lib/toast";
import { CopyButton } from "./CopyButton";
import { HintTooltip } from "./HintTooltip";
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
import { FIELD_MONO_INPUT_CLASS, FIELD_SELECT_CLASS } from "../lib/formStyles";
import {
  Copy,
  ExternalLink,
  FolderOpen,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  WandSparkles,
} from "lucide-react";
import type {
  ConfigGroupId,
  ConfigPath,
  Provider,
} from "../types";
import { configEditorTheme, getConfigLanguageExtensions } from "./configs/editorSetup";
import { CLAUDE_ENV_MODEL_FIELDS, SNOW_REQUEST_METHOD_OPTIONS } from "./configs/constants";
import type { ClaudeEnvModelField, SnowRequestMethod } from "./configs/constants";
import {
  toDisplayPath,
  buildClaudeModelGuessMap,
  inferSnowRequestMethod,
  pickDefaultSnowBasicModel,
  upsertEnvAssignments,
  getModelConfigLabel,
  getModelConfigResultText,
} from "./configs/utils";
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
  const [selectedGroupId, setSelectedGroupId] =
    useState<ConfigGroupId>("claude");
  const [selectedFileId, setSelectedFileId] = useState<string>("claude");
  const [pendingSwitchTarget, setPendingSwitchTarget] =
    useState<PendingSwitchTarget | null>(null);
  const [showAddFileForm, setShowAddFileForm] = useState(false);
  const [newRelativePath, setNewRelativePath] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedAvailableProviderId, setSelectedAvailableProviderId] =
    useState<string>("");

  // Apply modal states (kept inline per user request)
  const [claudeApplyModalOpen, setClaudeApplyModalOpen] = useState(false);
  const [codexApplyModalOpen, setCodexApplyModalOpen] = useState(false);
  const [geminiApplyModalOpen, setGeminiApplyModalOpen] = useState(false);
  const [snowApplyModalOpen, setSnowApplyModalOpen] = useState(false);
  const [openCodeApplyModalOpen, setOpenCodeApplyModalOpen] = useState(false);
  const [selectedCodexApplyModel, setSelectedCodexApplyModel] =
    useState<string>("");
  const [selectedGeminiApplyModel, setSelectedGeminiApplyModel] =
    useState<string>("");
  const [selectedSnowRequestMethod, setSelectedSnowRequestMethod] =
    useState<SnowRequestMethod>("responses");
  const [selectedSnowAdvancedModel, setSelectedSnowAdvancedModel] =
    useState<string>("");
  const [selectedSnowBasicModel, setSelectedSnowBasicModel] = useState<string>(
    "",
  );
  const [selectedOpenCodeModels, setSelectedOpenCodeModels] = useState<string[]>(
    [],
  );
  const [claudeEnvSelection, setClaudeEnvSelection] = useState<
    Record<ClaudeEnvModelField, string>
  >({
    ANTHROPIC_MODEL: "",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "",
    ANTHROPIC_DEFAULT_OPUS_MODEL: "",
  });

  // Model config hook
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

  // Config draft hook
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

  // Derived: config groups
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

  const dirty = modelConfigDirty || fileDirty;

  // Available provider options for shortcuts
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
        ).map((model) => {
          const result = (provider.lastResult?.results ?? []).find(
            (item) => item.available && item.model === model,
          );
          return {
            id: `${provider.id}::${model}`,
            model,
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            supportedProtocols: result?.supported_protocols ?? [],
          };
        });

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
        supportedProtocols: string[];
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

  const isClaudeSettingsShortcutTarget =
    selectedGroup?.id === "claude" && selectedFile?.id === "claude";
  const isCodexShortcutTarget = selectedGroup?.id === "codex";
  const isGeminiShortcutTarget = selectedGroup?.id === "gemini";
  const isSnowShortcutTarget = selectedGroup?.id === "snow";
  const isOpenCodeShortcutTarget = selectedGroup?.id === "opencode";

  // Wrapper handlers that pass current values to hook functions
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

  function handleOpenFile() {
    if (selectedFile) openFile(selectedFile);
  }

  function handleOpenDirectory() {
    if (selectedFile) openDirectory(selectedFile);
  }

  async function handleSaveContent() {
    if (!selectedFile) return false;
    return saveFileContent(selectedFile, activeContentDraft, onUpsertPath);
  }

  function handleDiscardContentChanges() {
    if (!selectedFile) return;
    discardChanges(selectedFile.id);
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
    if (!selectedFile && selectedGroup.files[0]) {
      setSelectedFileId(selectedGroup.files[0].id);
    }
  }, [groups, selectedFile, selectedGroup]);

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
    if (!selectedFile) return;
    if (
      draftsByFileId[selectedFile.id]?.loadedPath === selectedFile.absolutePath
    ) {
      return;
    }
    void refreshCurrent(selectedFile);
  }, [draftsByFileId, selectedFile?.id, selectedFile?.absolutePath, refreshCurrent]);

  // Switch helpers
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

  // File management
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
    if (!selectedFile) return;
    const saved = await saveFileContent(selectedFile, activeContentDraft, onUpsertPath);
    if (!saved || !pendingSwitchTarget) return;
    applySwitch(pendingSwitchTarget);
    setPendingSwitchTarget(null);
  }

  // ─── Apply shortcut logic (kept inline per user request) ───

  function handleImportSelectedAvailableModel() {
    handleImportSelectedAvailableModelFromHook(
      selectedAvailableModel,
      selectedAvailableProvider,
    );
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
      currentEnv.ANTHROPIC_BASE_URL = buildClaudeWritebackUrl(
        selectedAvailableModel.baseUrl,
      );
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

  async function handleApplyCodexShortcutToDraft() {
    if (!selectedAvailableProvider || !selectedGroup) return;
    const configTomlFile =
      selectedGroup.files.find((file) => file.id === "codex") ?? null;
    const authJsonFile =
      selectedGroup.files.find((file) => file.id === "codex::auth.json") ?? null;
    if (!configTomlFile || !authJsonFile) {
      toast("未找到 Codex 配置文件入口", "error");
      return;
    }
    try {
      const [configDraft, authDraft] = await Promise.all([
        ensureFileDraftState(configTomlFile),
        ensureFileDraftState(authJsonFile),
      ]);
      const tomlModule = await import("smol-toml");
      const parsedConfig =
        configDraft?.contentDraft.trim()
          ? tomlModule.parse(configDraft.contentDraft)
          : {};
      if (
        parsedConfig == null ||
        Array.isArray(parsedConfig) ||
        typeof parsedConfig !== "object"
      ) {
        throw new Error("当前 config.toml 顶层不是对象");
      }
      const nextConfig = {
        ...(parsedConfig as Record<string, unknown>),
        model: selectedCodexApplyModel,
        model_provider: "codex",
        model_providers: {
          ...(((parsedConfig as Record<string, unknown>).model_providers as
            | Record<string, unknown>
            | undefined) ?? {}),
          codex: {
            ...((((parsedConfig as Record<string, unknown>).model_providers as
              | Record<string, unknown>
              | undefined)?.codex as Record<string, unknown> | undefined) ?? {}),
            base_url: buildOpenAiCompatibleWritebackUrl(
              selectedAvailableProvider.models[0]?.baseUrl ?? "",
            ),
            name: "codex",
            wire_api: "responses",
          },
        },
      };
      const formattedToml = await formatConfigContent(
        tomlModule.stringify(nextConfig),
        "toml",
      );
      updateDraftState(configTomlFile.id, {
        contentDraft: formattedToml.formatted,
      });
      const parsedAuth =
        authDraft?.contentDraft.trim() ? JSON.parse(authDraft.contentDraft) : {};
      if (
        parsedAuth == null ||
        Array.isArray(parsedAuth) ||
        typeof parsedAuth !== "object"
      ) {
        throw new Error("当前 auth.json 顶层不是对象");
      }
      const nextAuth = {
        ...(parsedAuth as Record<string, unknown>),
        OPENAI_API_KEY: selectedAvailableProvider.models[0]?.apiKey ?? "",
      };
      const formattedAuth = await formatConfigContent(
        JSON.stringify(nextAuth),
        "json",
      );
      updateDraftState(authJsonFile.id, {
        contentDraft: formattedAuth.formatted,
      });
      setCodexApplyModalOpen(false);
      toast("已将 Codex 配置应用到当前草稿", "success");
    } catch (error) {
      console.error("Failed to apply Codex shortcut config", error);
      toast(
        error instanceof Error
          ? `应用失败：${error.message}`
          : "应用失败，请检查当前配置文件内容",
        "error",
      );
    }
  }

  async function handleApplyGeminiShortcutToDraft() {
    if (!selectedAvailableProvider || !selectedGroup) return;
    const settingsFile =
      selectedGroup.files.find((file) => file.id === "gemini") ?? null;
    const envFile =
      selectedGroup.files.find((file) => file.id === "gemini::.env") ?? null;
    if (!settingsFile || !envFile) {
      toast("未找到 Gemini 配置文件入口", "error");
      return;
    }
    try {
      const [settingsDraft, envDraft] = await Promise.all([
        ensureFileDraftState(settingsFile),
        ensureFileDraftState(envFile),
      ]);
      const parsedSettings =
        settingsDraft?.contentDraft.trim()
          ? JSON.parse(settingsDraft.contentDraft)
          : {};
      if (
        parsedSettings == null ||
        Array.isArray(parsedSettings) ||
        typeof parsedSettings !== "object"
      ) {
        throw new Error("当前 .settings.json 顶层不是对象");
      }
      const settingsRoot = {
        ...(parsedSettings as Record<string, unknown>),
      } as Record<string, unknown>;
      settingsRoot.model = {
        ...(settingsRoot.model &&
        typeof settingsRoot.model === "object" &&
        !Array.isArray(settingsRoot.model)
          ? (settingsRoot.model as Record<string, unknown>)
          : {}),
        name: selectedGeminiApplyModel,
      };
      settingsRoot.general = {
        ...(settingsRoot.general &&
        typeof settingsRoot.general === "object" &&
        !Array.isArray(settingsRoot.general)
          ? (settingsRoot.general as Record<string, unknown>)
          : {}),
        previewFeatures: true,
      };
      settingsRoot.security = {
        ...(settingsRoot.security &&
        typeof settingsRoot.security === "object" &&
        !Array.isArray(settingsRoot.security)
          ? (settingsRoot.security as Record<string, unknown>)
          : {}),
        auth: {
          ...(((settingsRoot.security &&
            typeof settingsRoot.security === "object" &&
            !Array.isArray(settingsRoot.security)
            ? (settingsRoot.security as Record<string, unknown>).auth
            : null) &&
          typeof (settingsRoot.security as Record<string, unknown>).auth ===
            "object" &&
          !Array.isArray(
            (settingsRoot.security as Record<string, unknown>).auth,
          )
            ? ((settingsRoot.security as Record<string, unknown>).auth as Record<
                string,
                unknown
              >)
            : {}) as Record<string, unknown>),
          selectedType: "gemini-api-key",
        },
      };
      const formattedSettings = await formatConfigContent(
        JSON.stringify(settingsRoot),
        "json",
      );
      updateDraftState(settingsFile.id, {
        contentDraft: formattedSettings.formatted,
      });
      const nextEnv = upsertEnvAssignments(envDraft?.contentDraft ?? "", {
        GEMINI_API_KEY: selectedAvailableProvider.models[0]?.apiKey ?? "",
        GOOGLE_GEMINI_BASE_URL: buildGeminiWritebackUrl(
          selectedAvailableProvider.models[0]?.baseUrl ?? "",
        ),
      });
      updateDraftState(envFile.id, {
        contentDraft: nextEnv,
      });
      setGeminiApplyModalOpen(false);
      toast("已将 Gemini 配置应用到当前草稿", "success");
    } catch (error) {
      console.error("Failed to apply Gemini shortcut config", error);
      toast(
        error instanceof Error
          ? `应用失败：${error.message}`
          : "应用失败，请检查当前配置文件内容",
        "error",
      );
    }
  }

  async function handleApplySnowShortcutToDraft() {
    if (!selectedAvailableProvider || !selectedGroup) return;
    const configFile =
      selectedGroup.files.find((file) => file.id === "snow::config.json") ??
      null;
    if (!configFile) {
      toast("未找到 Snow 配置文件入口", "error");
      return;
    }
    try {
      const draft = await ensureFileDraftState(configFile);
      const parsed =
        draft?.contentDraft.trim() ? JSON.parse(draft.contentDraft) : {};
      if (parsed == null || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error("当前 config.json 顶层不是对象");
      }
      const root = { ...(parsed as Record<string, unknown>) };
      const currentSnowcfg =
        root.snowcfg && typeof root.snowcfg === "object" && !Array.isArray(root.snowcfg)
          ? { ...(root.snowcfg as Record<string, unknown>) }
          : {};
      root.snowcfg = {
        ...currentSnowcfg,
        baseUrl:
          selectedSnowRequestMethod === "anthropic"
            ? buildClaudeWritebackUrl(
                selectedAvailableProvider.models[0]?.baseUrl ?? "",
              )
            : selectedSnowRequestMethod === "gemini"
              ? buildGeminiWritebackUrl(
                  selectedAvailableProvider.models[0]?.baseUrl ?? "",
                )
              : buildOpenAiCompatibleWritebackUrl(
                  selectedAvailableProvider.models[0]?.baseUrl ?? "",
                ),
        apiKey: selectedAvailableProvider.models[0]?.apiKey ?? "",
        requestMethod: selectedSnowRequestMethod,
        advancedModel: selectedSnowAdvancedModel,
        basicModel: selectedSnowBasicModel,
      };
      const formatted = await formatConfigContent(JSON.stringify(root), "json");
      updateDraftState(configFile.id, {
        contentDraft: formatted.formatted,
      });
      setSnowApplyModalOpen(false);
      toast("已将 Snow 配置应用到当前草稿", "success");
    } catch (error) {
      console.error("Failed to apply Snow shortcut config", error);
      toast(
        error instanceof Error
          ? `应用失败：${error.message}`
          : "应用失败，请检查当前配置文件内容",
        "error",
      );
    }
  }

  function handleToggleOpenCodeModel(model: string) {
    setSelectedOpenCodeModels((prev) =>
      prev.includes(model)
        ? prev.filter((item) => item !== model)
        : [...prev, model],
    );
  }

  async function handleApplyOpenCodeShortcutToDraft() {
    if (!selectedAvailableProvider || !selectedGroup) return;
    const opencodeFile =
      selectedGroup.files.find((file) => file.id === "opencode") ?? null;
    if (!opencodeFile) {
      toast("未找到 OpenCode 配置文件入口", "error");
      return;
    }
    try {
      const draft = await ensureFileDraftState(opencodeFile);
      const parsed =
        draft?.contentDraft.trim() ? JSON.parse(draft.contentDraft) : {};
      if (parsed == null || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error("当前 opencode.json 顶层不是对象");
      }
      const root = { ...(parsed as Record<string, unknown>) };
      const currentProviders =
        root.provider &&
        typeof root.provider === "object" &&
        !Array.isArray(root.provider)
          ? { ...(root.provider as Record<string, unknown>) }
          : {};
      currentProviders[selectedAvailableProvider.providerName] = {
        npm: "@ai-sdk/openai-compatible",
        name: selectedAvailableProvider.providerName,
        options: {
          baseURL: buildWritebackUrl(
            selectedAvailableProvider.models[0]?.baseUrl ?? "",
            inferWritebackKindFromModel(
              selectedAvailableProvider.models[0]?.model ?? "",
              selectedAvailableProvider.models[0]?.supportedProtocols,
            ),
          ),
          apiKey: selectedAvailableProvider.models[0]?.apiKey ?? "",
        },
        models: Object.fromEntries(
          selectedOpenCodeModels.map((model) => [model, { name: model }]),
        ),
      };
      root.provider = currentProviders;
      const formatted = await formatConfigContent(
        JSON.stringify(root),
        "json",
      );
      updateDraftState(opencodeFile.id, {
        contentDraft: formatted.formatted,
      });
      setOpenCodeApplyModalOpen(false);
      toast("已将 OpenCode 配置应用到当前草稿", "success");
    } catch (error) {
      console.error("Failed to apply OpenCode shortcut config", error);
      toast(
        error instanceof Error
          ? `应用失败：${error.message}`
          : "应用失败，请检查当前配置文件内容",
        "error",
      );
    }
  }

  function handleApplyShortcut() {
    if (isClaudeSettingsShortcutTarget) {
      handleOpenClaudeApplyModal();
      return;
    }
    if (isCodexShortcutTarget) {
      if (!selectedAvailableProvider) return;
      setSelectedCodexApplyModel(
        selectedAvailableProvider.models[0]?.model ?? "",
      );
      setCodexApplyModalOpen(true);
      return;
    }
    if (isGeminiShortcutTarget) {
      if (!selectedAvailableProvider) return;
      setSelectedGeminiApplyModel(
        selectedAvailableProvider.models[0]?.model ?? "",
      );
      setGeminiApplyModalOpen(true);
      return;
    }
    if (isSnowShortcutTarget) {
      if (!selectedAvailableProvider) return;
      const primaryModel = selectedAvailableProvider.models[0]?.model ?? "";
      setSelectedSnowRequestMethod(
        inferSnowRequestMethod(
          selectedAvailableProvider.models[0]?.supportedProtocols,
        ),
      );
      setSelectedSnowAdvancedModel(primaryModel);
      setSelectedSnowBasicModel(
        pickDefaultSnowBasicModel(
          selectedAvailableProvider.models.map((item) => item.model),
          primaryModel,
        ),
      );
      setSnowApplyModalOpen(true);
      return;
    }
    if (isOpenCodeShortcutTarget) {
      if (!selectedAvailableProvider) return;
      setSelectedOpenCodeModels([]);
      setOpenCodeApplyModalOpen(true);
    }
  }

  // ─── Render ───

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
                    {(isClaudeSettingsShortcutTarget ||
                      isCodexShortcutTarget ||
                      isGeminiShortcutTarget ||
                      isSnowShortcutTarget ||
                      isOpenCodeShortcutTarget) && (
                      <button
                        onClick={handleApplyShortcut}
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
                        当前还没有模型配置。点击右上角"新建"创建第一条。
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
        <ConfigConfirmModal
          title="切换当前文件？"
          description="当前文件有未保存内容。请选择直接切换，或先保存后再切换。"
          primaryLabel="切换"
          tertiaryLabel="保存"
          onPrimary={() => {
            if (!pendingSwitchTarget) return;
            applySwitch(pendingSwitchTarget);
            setPendingSwitchTarget(null);
          }}
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

      {codexApplyModalOpen && selectedAvailableProvider && (
        <CodexApplyModal
          providerName={selectedAvailableProvider.providerName}
          availableModels={selectedAvailableProvider.models.map(
            (item) => item.model,
          )}
          selectedModel={selectedCodexApplyModel}
          onChange={setSelectedCodexApplyModel}
          onConfirm={() => void handleApplyCodexShortcutToDraft()}
          onCancel={() => setCodexApplyModalOpen(false)}
        />
      )}

      {geminiApplyModalOpen && selectedAvailableProvider && (
        <GeminiApplyModal
          providerName={selectedAvailableProvider.providerName}
          availableModels={selectedAvailableProvider.models.map(
            (item) => item.model,
          )}
          selectedModel={selectedGeminiApplyModel}
          onChange={setSelectedGeminiApplyModel}
          onConfirm={() => void handleApplyGeminiShortcutToDraft()}
          onCancel={() => setGeminiApplyModalOpen(false)}
        />
      )}

      {snowApplyModalOpen && selectedAvailableProvider && (
        <SnowApplyModal
          providerName={selectedAvailableProvider.providerName}
          availableModels={selectedAvailableProvider.models.map(
            (item) => item.model,
          )}
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
