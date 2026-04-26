import { useState } from "react";
import { formatConfigContent } from "../../lib/configFormatter";
import {
  buildClaudeWritebackUrl,
  buildGeminiWritebackUrl,
  buildOpenAiCompatibleWritebackUrl,
  buildWritebackUrl,
  inferWritebackKindFromModel,
} from "../../lib/providerBaseUrl";
import { toast } from "../../lib/toast";
import { CLAUDE_ENV_MODEL_FIELDS } from "./constants";
import type { ClaudeEnvModelField, FileDraftState, SnowRequestMethod } from "./constants";
import {
  buildClaudeModelGuessMap,
  inferSnowRequestMethod,
  pickDefaultSnowBasicModel,
  upsertEnvAssignments,
} from "./utils";
import type { ConfigGroupFileView, ConfigGroupView } from "../../types";

interface AvailableModel {
  id: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  supportedProtocols: string[];
}

interface AvailableProvider {
  id: string;
  providerName: string;
  availableCount: number;
  models: AvailableModel[];
}

interface UseApplyShortcutOptions {
  selectedGroup: ConfigGroupView | null;
  selectedFile: ConfigGroupFileView | null;
  activeContentDraft: string;
  selectedAvailableModel: AvailableModel | null;
  selectedAvailableProvider: AvailableProvider | null;
  isClaudeSettingsShortcutTarget: boolean;
  isCodexShortcutTarget: boolean;
  isGeminiShortcutTarget: boolean;
  isSnowShortcutTarget: boolean;
  isOpenCodeShortcutTarget: boolean;
  updateDraftState: (fileId: string, patch: Partial<FileDraftState>) => void;
  ensureFileDraftState: (
    file: ConfigGroupFileView | null,
  ) => Promise<FileDraftState | null>;
}

export function useApplyShortcut({
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
}: UseApplyShortcutOptions) {
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

  return {
    // Modal open states
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
    // Selection states
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
    // Handlers
    handleClaudeEnvFieldChange,
    handleApplyClaudeShortcutToDraft,
    handleApplyCodexShortcutToDraft,
    handleApplyGeminiShortcutToDraft,
    handleApplySnowShortcutToDraft,
    handleApplyOpenCodeShortcutToDraft,
    handleToggleOpenCodeModel,
    handleApplyShortcut,
  };
}
