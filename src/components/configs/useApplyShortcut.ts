import { useState, useEffect } from "react"
import { logger } from "@/lib/devlog"
import { formatConfigContent } from "@/lib/configFormatter"
import { listModels, getCodexApiKey, setCodexApiKey as saveCodexApiKey, removeCodexApiKey } from "@/api"
import {
	buildClaudeWritebackUrl,
	buildGeminiWritebackUrl,
	buildOpenAiCompatibleWritebackUrl,
	buildWritebackUrl,
	inferWritebackKindFromModel,
} from "@/lib/providerBaseUrl"
import { toast } from "@/lib/toast"
import { CLAUDE_ENV_MODEL_FIELDS } from "./constants"
import type { ClaudeEnvModelField, FileDraftState, SnowRequestMethod } from "./constants"
import {
	buildClaudeModelGuessMap,
	inferSnowRequestMethod,
	pickDefaultSnowBasicModel,
	upsertEnvAssignments,
} from "./utils"
import type { ConfigGroupFileView, ConfigGroupView } from "@/types"

interface AvailableModel {
	id: string
	model: string
	baseUrl: string
	apiKey: string
	supportedProtocols: string[]
}

interface AvailableProvider {
	id: string
	providerName: string
	availableCount: number
	models: AvailableModel[]
}

interface UseApplyShortcutOptions {
	selectedGroup: ConfigGroupView | null
	selectedFile: ConfigGroupFileView | null
	activeContentDraft: string
	selectedAvailableModel: AvailableModel | null
	selectedAvailableProvider: AvailableProvider | null
	isClaudeSettingsShortcutTarget: boolean
	isCodexShortcutTarget: boolean
	isGeminiShortcutTarget: boolean
	isSnowShortcutTarget: boolean
	isOpenCodeShortcutTarget: boolean
	updateDraftState: (fileId: string, patch: Partial<FileDraftState>) => void
	ensureFileDraftState: (file: ConfigGroupFileView | null) => Promise<FileDraftState | null>
	saveFileContent?: (file: ConfigGroupFileView, content: string) => Promise<boolean>
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
	saveFileContent,
}: UseApplyShortcutOptions) {
	const [claudeApplyModalOpen, setClaudeApplyModalOpen] = useState(false)
	const [codexApplyModalOpen, setCodexApplyModalOpen] = useState(false)
	const [geminiApplyModalOpen, setGeminiApplyModalOpen] = useState(false)
	const [snowApplyModalOpen, setSnowApplyModalOpen] = useState(false)
	const [openCodeApplyModalOpen, setOpenCodeApplyModalOpen] = useState(false)
	const [selectedCodexApplyModel, setSelectedCodexApplyModel] = useState<string>("")
	const [selectedGeminiApplyModel, setSelectedGeminiApplyModel] = useState<string>("")
	const [selectedSnowRequestMethod, setSelectedSnowRequestMethod] = useState<SnowRequestMethod>("responses")
	const [selectedSnowAdvancedModel, setSelectedSnowAdvancedModel] = useState<string>("")
	const [selectedSnowBasicModel, setSelectedSnowBasicModel] = useState<string>("")
	const [selectedOpenCodeModels, setSelectedOpenCodeModels] = useState<string[]>([])
	const [claudeEnvSelection, setClaudeEnvSelection] = useState<Record<ClaudeEnvModelField, string>>({
		ANTHROPIC_MODEL: "",
		ANTHROPIC_DEFAULT_HAIKU_MODEL: "",
		ANTHROPIC_DEFAULT_SONNET_MODEL: "",
		ANTHROPIC_DEFAULT_OPUS_MODEL: "",
	})
	// 保存当前应用的 Provider 和模型数据（用于自定义 Provider）
	const [activeApplyProvider, setActiveApplyProvider] = useState<AvailableProvider | null>(null)
	const [activeApplyModel, setActiveApplyModel] = useState<AvailableModel | null>(null)
	// 从 v1/models 接口获取的模型列表（当自定义 Provider 模型为空时使用）
	const [fetchedModelsFromApi, setFetchedModelsFromApi] = useState<string[]>([])
	const [isFetchingModels, setIsFetchingModels] = useState(false)

	// Codex API Key 管理 - 从当前 Provider 自动填充
	const [codexApiKey, setCodexApiKey] = useState<string>("")
	const [isSavingCodexKey, setIsSavingCodexKey] = useState(false)

	// 当弹窗打开时，从当前 Provider 获取 API Key
	useEffect(() => {
		if (codexApplyModalOpen) {
			// 优先从 activeApplyProvider（自定义 Provider）或 selectedAvailableProvider 获取 apiKey
			const providerToUse = activeApplyProvider ?? selectedAvailableProvider
			const apiKeyFromProvider = providerToUse?.models[0]?.apiKey ?? ""
			setCodexApiKey(apiKeyFromProvider)
		}
	}, [codexApplyModalOpen, activeApplyProvider, selectedAvailableProvider])

	async function handleSaveCodexApiKey() {
		if (!codexApiKey.trim()) return
		setIsSavingCodexKey(true)
		try {
			const result = await saveCodexApiKey(codexApiKey.trim())
			if (result.success) {
				toast(result.message, "success")
			} else {
				toast(result.message, "error")
			}
		} catch (e) {
			toast("保存失败: " + String(e), "error")
		} finally {
			setIsSavingCodexKey(false)
		}
	}

	async function handleRemoveCodexApiKey() {
		setIsSavingCodexKey(true)
		try {
			const result = await removeCodexApiKey()
			if (result.success) {
				setCodexApiKey("")
				toast(result.message, "success")
			} else {
				toast(result.message, "error")
			}
		} catch (e) {
			toast("删除失败: " + String(e), "error")
		} finally {
			setIsSavingCodexKey(false)
		}
	}

	function handleOpenClaudeApplyModal() {
		if (!selectedAvailableModel || !selectedAvailableProvider || !isClaudeSettingsShortcutTarget) {
			return
		}
		setClaudeEnvSelection(
			buildClaudeModelGuessMap(
				selectedAvailableProvider.models.map((item) => item.model),
				selectedAvailableModel.model,
			),
		)
		setClaudeApplyModalOpen(true)
	}

	function handleClaudeEnvFieldChange(field: ClaudeEnvModelField, value: string) {
		setClaudeEnvSelection((prev) => ({
			...prev,
			[field]: value,
		}))
	}

	async function handleApplyClaudeShortcutToDraft() {
		if (!selectedFile || !selectedAvailableModel || !selectedAvailableProvider || !isClaudeSettingsShortcutTarget) {
			return
		}
		try {
			const currentContent = activeContentDraft.trim()
			const parsed = currentContent.length > 0 ? JSON.parse(currentContent) : {}
			if (parsed == null || Array.isArray(parsed) || typeof parsed !== "object") {
				throw new Error("当前 settings.json 顶层不是对象")
			}
			const root = { ...parsed } as Record<string, unknown>
			const currentEnv =
				root.env && typeof root.env === "object" && !Array.isArray(root.env)
					? { ...(root.env as Record<string, unknown>) }
					: {}
			currentEnv.ANTHROPIC_BASE_URL = buildClaudeWritebackUrl(selectedAvailableModel.baseUrl)
			currentEnv.ANTHROPIC_AUTH_TOKEN = selectedAvailableModel.apiKey
			for (const field of CLAUDE_ENV_MODEL_FIELDS) {
				currentEnv[field] = claudeEnvSelection[field]
			}
			root.env = currentEnv
			const formatted = await formatConfigContent(JSON.stringify(root), "json")
			updateDraftState(selectedFile.id, {
				contentDraft: formatted.formatted,
			})
			setClaudeApplyModalOpen(false)
			toast("已将 Claude 模型映射应用到当前草稿", "success")
		} catch (error) {
			logger.error("Failed to apply Claude shortcut config", error)
			toast(
				error instanceof Error ? `应用失败：${error.message}` : "应用失败，请先确保当前 settings.json 是合法 JSON",
				"error",
			)
		}
	}

	async function handleApplyCodexShortcutToDraft() {
		// 优先使用 activeApplyProvider（自定义 Provider），否则使用 selectedAvailableProvider
		const providerToUse = activeApplyProvider ?? selectedAvailableProvider
		if (!providerToUse || !selectedGroup) return
		const configTomlFile = selectedGroup.files.find((file) => file.id === "codex") ?? null
		const authJsonFile = selectedGroup.files.find((file) => file.id === "codex::auth.json") ?? null
		if (!configTomlFile || !authJsonFile) {
			toast("未找到 Codex 配置文件入口", "error")
			return
		}
		try {
			const [configDraft, authDraft] = await Promise.all([
				ensureFileDraftState(configTomlFile),
				ensureFileDraftState(authJsonFile),
			])
			const tomlModule = await import("smol-toml")
			const parsedConfig = configDraft?.contentDraft.trim() ? tomlModule.parse(configDraft.contentDraft) : {}
			if (parsedConfig == null || Array.isArray(parsedConfig) || typeof parsedConfig !== "object") {
				throw new Error("当前 config.toml 顶层不是对象")
			}
			const nextConfig = {
				...(parsedConfig as Record<string, unknown>),
				model: selectedCodexApplyModel,
				model_provider: "codex",
				model_providers: {
					...(((parsedConfig as Record<string, unknown>).model_providers as Record<string, unknown> | undefined) ?? {}),
					codex: {
						...((((parsedConfig as Record<string, unknown>).model_providers as Record<string, unknown> | undefined)
							?.codex as Record<string, unknown> | undefined) ?? {}),
						base_url: buildOpenAiCompatibleWritebackUrl(providerToUse.models[0]?.baseUrl ?? ""),
						name: "codex",
						wire_api: "responses",
					},
				},
			}
			const formattedToml = await formatConfigContent(tomlModule.stringify(nextConfig), "toml")
			updateDraftState(configTomlFile.id, {
				contentDraft: formattedToml.formatted,
			})
			const parsedAuth = authDraft?.contentDraft.trim() ? JSON.parse(authDraft.contentDraft) : {}
			if (parsedAuth == null || Array.isArray(parsedAuth) || typeof parsedAuth !== "object") {
				throw new Error("当前 auth.json 顶层不是对象")
			}
			const nextAuth = {
				...(parsedAuth as Record<string, unknown>),
				OPENAI_API_KEY: providerToUse.models[0]?.apiKey ?? "",
			}
			const formattedAuth = await formatConfigContent(JSON.stringify(nextAuth), "json")
			updateDraftState(authJsonFile.id, {
				contentDraft: formattedAuth.formatted,
			})
			setCodexApplyModalOpen(false)
			toast("已将 Codex 配置应用到当前草稿", "success")
		} catch (error) {
			logger.error("Failed to apply Codex shortcut config", error)
			toast(error instanceof Error ? `应用失败：${error.message}` : "应用失败，请检查当前配置文件内容", "error")
		}
	}

	// 应用 Codex 配置并保存 API Key 到 ~/.zshrc（仅应用到草稿）
	async function handleApplyCodexShortcutAndSave() {
		if (!codexApiKey.trim()) {
			toast("请先输入 API Key", "warning")
			return
		}
		setIsSavingCodexKey(true)
		try {
			// 先保存 API Key 到 ~/.zshrc
			const saveResult = await saveCodexApiKey(codexApiKey.trim())
			if (!saveResult.success) {
				toast(saveResult.message, "error")
				setIsSavingCodexKey(false)
				return
			}
			// 再应用配置到草稿
			await handleApplyCodexShortcutToDraft()
			toast("已应用配置并保存 API Key", "success")
		} catch (e) {
			toast("保存失败: " + String(e), "error")
		} finally {
			setIsSavingCodexKey(false)
		}
	}

	// 应用 Codex 配置并直接保存到磁盘（跳过草稿）
	async function handleApplyCodexShortcutDirectSave() {
		if (!codexApiKey.trim()) {
			toast("请先输入 API Key", "warning")
			return
		}
		if (!saveFileContent) {
			toast("保存功能未初始化", "error")
			return
		}
		setIsSavingCodexKey(true)
		try {
			// 1. 先保存 API Key 到 ~/.zshrc
			const saveResult = await saveCodexApiKey(codexApiKey.trim())
			if (!saveResult.success) {
				toast(saveResult.message, "error")
				setIsSavingCodexKey(false)
				return
			}

			// 2. 直接生成配置并保存到磁盘
			const providerToUse = activeApplyProvider ?? selectedAvailableProvider
			if (!providerToUse || !selectedGroup) {
				setIsSavingCodexKey(false)
				return
			}
			const configTomlFile = selectedGroup.files.find((file) => file.id === "codex") ?? null
			const authJsonFile = selectedGroup.files.find((file) => file.id === "codex::auth.json") ?? null
			if (!configTomlFile || !authJsonFile) {
				toast("未找到 Codex 配置文件入口", "error")
				setIsSavingCodexKey(false)
				return
			}

			// 读取现有配置（如果存在）
			const [configDraft, authDraft] = await Promise.all([
				ensureFileDraftState(configTomlFile),
				ensureFileDraftState(authJsonFile),
			])

			// 生成新的配置内容
			const tomlModule = await import("smol-toml")
			const parsedConfig = configDraft?.contentDraft.trim() ? tomlModule.parse(configDraft.contentDraft) : {}
			if (parsedConfig == null || Array.isArray(parsedConfig) || typeof parsedConfig !== "object") {
				throw new Error("当前 config.toml 顶层不是对象")
			}
			const nextConfig = {
				...(parsedConfig as Record<string, unknown>),
				model: selectedCodexApplyModel,
				model_provider: "codex",
				model_providers: {
					...(((parsedConfig as Record<string, unknown>).model_providers as Record<string, unknown> | undefined) ?? {}),
					codex: {
						...((((parsedConfig as Record<string, unknown>).model_providers as Record<string, unknown> | undefined)
							?.codex as Record<string, unknown> | undefined) ?? {}),
						base_url: buildOpenAiCompatibleWritebackUrl(providerToUse.models[0]?.baseUrl ?? ""),
						name: "codex",
						wire_api: "responses",
					},
				},
			}
			const formattedToml = await formatConfigContent(tomlModule.stringify(nextConfig), "toml")

			const parsedAuth = authDraft?.contentDraft.trim() ? JSON.parse(authDraft.contentDraft) : {}
			if (parsedAuth == null || Array.isArray(parsedAuth) || typeof parsedAuth !== "object") {
				throw new Error("当前 auth.json 顶层不是对象")
			}
			const nextAuth = {
				...(parsedAuth as Record<string, unknown>),
				OPENAI_API_KEY: providerToUse.models[0]?.apiKey ?? "",
			}
			const formattedAuth = await formatConfigContent(JSON.stringify(nextAuth), "json")

			// 3. 直接保存到磁盘
			await Promise.all([
				saveFileContent(configTomlFile, formattedToml.formatted),
				saveFileContent(authJsonFile, formattedAuth.formatted),
			])

			// 4. 更新草稿状态以保持一致
			updateDraftState(configTomlFile.id, {
				contentDraft: formattedToml.formatted,
				savedContent: formattedToml.formatted,
			})
			updateDraftState(authJsonFile.id, {
				contentDraft: formattedAuth.formatted,
				savedContent: formattedAuth.formatted,
			})

			setCodexApplyModalOpen(false)
			toast("已应用配置并保存到磁盘", "success")
		} catch (error) {
			logger.error("Failed to apply and save Codex config", error)
			toast(error instanceof Error ? `保存失败：${error.message}` : "保存失败，请检查配置文件", "error")
		} finally {
			setIsSavingCodexKey(false)
		}
	}

	async function handleApplyGeminiShortcutToDraft() {
		// 优先使用 activeApplyProvider（自定义 Provider），否则使用 selectedAvailableProvider
		const providerToUse = activeApplyProvider ?? selectedAvailableProvider
		if (!providerToUse || !selectedGroup) return
		const settingsFile = selectedGroup.files.find((file) => file.id === "gemini") ?? null
		const envFile = selectedGroup.files.find((file) => file.id === "gemini::.env") ?? null
		if (!settingsFile || !envFile) {
			toast("未找到 Gemini 配置文件入口", "error")
			return
		}
		try {
			const [settingsDraft, envDraft] = await Promise.all([
				ensureFileDraftState(settingsFile),
				ensureFileDraftState(envFile),
			])
			const parsedSettings = settingsDraft?.contentDraft.trim() ? JSON.parse(settingsDraft.contentDraft) : {}
			if (parsedSettings == null || Array.isArray(parsedSettings) || typeof parsedSettings !== "object") {
				throw new Error("当前 .settings.json 顶层不是对象")
			}
			const settingsRoot = {
				...(parsedSettings as Record<string, unknown>),
			} as Record<string, unknown>
			settingsRoot.model = {
				...(settingsRoot.model && typeof settingsRoot.model === "object" && !Array.isArray(settingsRoot.model)
					? (settingsRoot.model as Record<string, unknown>)
					: {}),
				name: selectedGeminiApplyModel,
			}
			settingsRoot.general = {
				...(settingsRoot.general && typeof settingsRoot.general === "object" && !Array.isArray(settingsRoot.general)
					? (settingsRoot.general as Record<string, unknown>)
					: {}),
				previewFeatures: true,
			}
			settingsRoot.security = {
				...(settingsRoot.security && typeof settingsRoot.security === "object" && !Array.isArray(settingsRoot.security)
					? (settingsRoot.security as Record<string, unknown>)
					: {}),
				auth: {
					...(((settingsRoot.security &&
					typeof settingsRoot.security === "object" &&
					!Array.isArray(settingsRoot.security)
						? (settingsRoot.security as Record<string, unknown>).auth
						: null) &&
					typeof (settingsRoot.security as Record<string, unknown>).auth === "object" &&
					!Array.isArray((settingsRoot.security as Record<string, unknown>).auth)
						? ((settingsRoot.security as Record<string, unknown>).auth as Record<string, unknown>)
						: {}) as Record<string, unknown>),
					selectedType: "gemini-api-key",
				},
			}
			const formattedSettings = await formatConfigContent(JSON.stringify(settingsRoot), "json")
			updateDraftState(settingsFile.id, {
				contentDraft: formattedSettings.formatted,
			})
			const nextEnv = upsertEnvAssignments(envDraft?.contentDraft ?? "", {
				GEMINI_API_KEY: providerToUse.models[0]?.apiKey ?? "",
				GOOGLE_GEMINI_BASE_URL: buildGeminiWritebackUrl(providerToUse.models[0]?.baseUrl ?? ""),
			})
			updateDraftState(envFile.id, {
				contentDraft: nextEnv,
			})
			setGeminiApplyModalOpen(false)
			toast("已将 Gemini 配置应用到当前草稿", "success")
		} catch (error) {
			logger.error("Failed to apply Gemini shortcut config", error)
			toast(error instanceof Error ? `应用失败：${error.message}` : "应用失败，请检查当前配置文件内容", "error")
		}
	}

	async function handleApplySnowShortcutToDraft() {
		// 优先使用 activeApplyProvider（自定义 Provider），否则使用 selectedAvailableProvider
		const providerToUse = activeApplyProvider ?? selectedAvailableProvider
		if (!providerToUse || !selectedGroup) return
		const configFile = selectedGroup.files.find((file) => file.id === "snow::config.json") ?? null
		if (!configFile) {
			toast("未找到 Snow 配置文件入口", "error")
			return
		}
		try {
			const draft = await ensureFileDraftState(configFile)
			const parsed = draft?.contentDraft.trim() ? JSON.parse(draft.contentDraft) : {}
			if (parsed == null || Array.isArray(parsed) || typeof parsed !== "object") {
				throw new Error("当前 config.json 顶层不是对象")
			}
			const root = { ...(parsed as Record<string, unknown>) }
			const currentSnowcfg =
				root.snowcfg && typeof root.snowcfg === "object" && !Array.isArray(root.snowcfg)
					? { ...(root.snowcfg as Record<string, unknown>) }
					: {}
			root.snowcfg = {
				...currentSnowcfg,
				baseUrl:
					selectedSnowRequestMethod === "anthropic"
						? buildClaudeWritebackUrl(providerToUse.models[0]?.baseUrl ?? "")
						: selectedSnowRequestMethod === "gemini"
							? buildGeminiWritebackUrl(providerToUse.models[0]?.baseUrl ?? "")
							: buildOpenAiCompatibleWritebackUrl(providerToUse.models[0]?.baseUrl ?? ""),
				apiKey: providerToUse.models[0]?.apiKey ?? "",
				requestMethod: selectedSnowRequestMethod,
				advancedModel: selectedSnowAdvancedModel,
				basicModel: selectedSnowBasicModel,
			}
			const formatted = await formatConfigContent(JSON.stringify(root), "json")
			updateDraftState(configFile.id, {
				contentDraft: formatted.formatted,
			})
			setSnowApplyModalOpen(false)
			toast("已将 Snow 配置应用到当前草稿", "success")
		} catch (error) {
			logger.error("Failed to apply Snow shortcut config", error)
			toast(error instanceof Error ? `应用失败：${error.message}` : "应用失败，请检查当前配置文件内容", "error")
		}
	}

	function handleToggleOpenCodeModel(model: string) {
		setSelectedOpenCodeModels((prev) =>
			prev.includes(model) ? prev.filter((item) => item !== model) : [...prev, model],
		)
	}

	async function handleApplyOpenCodeShortcutToDraft() {
		// 优先使用 activeApplyProvider（自定义 Provider），否则使用 selectedAvailableProvider
		const providerToUse = activeApplyProvider ?? selectedAvailableProvider
		if (!providerToUse || !selectedGroup) return
		const opencodeFile = selectedGroup.files.find((file) => file.id === "opencode") ?? null
		if (!opencodeFile) {
			toast("未找到 OpenCode 配置文件入口", "error")
			return
		}
		try {
			const draft = await ensureFileDraftState(opencodeFile)
			const parsed = draft?.contentDraft.trim() ? JSON.parse(draft.contentDraft) : {}
			if (parsed == null || Array.isArray(parsed) || typeof parsed !== "object") {
				throw new Error("当前 opencode.json 顶层不是对象")
			}
			const root = { ...(parsed as Record<string, unknown>) }
			const currentProviders =
				root.provider && typeof root.provider === "object" && !Array.isArray(root.provider)
					? { ...(root.provider as Record<string, unknown>) }
					: {}
			currentProviders[providerToUse.providerName] = {
				npm: "@ai-sdk/openai-compatible",
				name: providerToUse.providerName,
				options: {
					baseURL: buildWritebackUrl(
						providerToUse.models[0]?.baseUrl ?? "",
						inferWritebackKindFromModel(
							providerToUse.models[0]?.model ?? "",
							providerToUse.models[0]?.supportedProtocols,
						),
					),
					apiKey: providerToUse.models[0]?.apiKey ?? "",
				},
				models: Object.fromEntries(selectedOpenCodeModels.map((model) => [model, { name: model }])),
			}
			root.provider = currentProviders
			const formatted = await formatConfigContent(JSON.stringify(root), "json")
			updateDraftState(opencodeFile.id, {
				contentDraft: formatted.formatted,
			})
			setOpenCodeApplyModalOpen(false)
			toast("已将 OpenCode 配置应用到当前草稿", "success")
		} catch (error) {
			logger.error("Failed to apply OpenCode shortcut config", error)
			toast(error instanceof Error ? `应用失败：${error.message}` : "应用失败，请检查当前配置文件内容", "error")
		}
	}

	function handleApplyShortcut() {
		// 保存当前快捷模型的数据
		if (selectedAvailableProvider && selectedAvailableModel) {
			setActiveApplyProvider(selectedAvailableProvider)
			setActiveApplyModel(selectedAvailableModel)
		}
		if (isClaudeSettingsShortcutTarget) {
			handleOpenClaudeApplyModal()
			return
		}
		if (isCodexShortcutTarget) {
			if (!selectedAvailableProvider) return
			setSelectedCodexApplyModel(selectedAvailableProvider.models[0]?.model ?? "")
			setCodexApplyModalOpen(true)
			return
		}
		if (isGeminiShortcutTarget) {
			if (!selectedAvailableProvider) return
			setSelectedGeminiApplyModel(selectedAvailableProvider.models[0]?.model ?? "")
			setGeminiApplyModalOpen(true)
			return
		}
		if (isSnowShortcutTarget) {
			if (!selectedAvailableProvider) return
			const primaryModel = selectedAvailableProvider.models[0]?.model ?? ""
			setSelectedSnowRequestMethod(inferSnowRequestMethod(selectedAvailableProvider.models[0]?.supportedProtocols))
			setSelectedSnowAdvancedModel(primaryModel)
			setSelectedSnowBasicModel(
				pickDefaultSnowBasicModel(
					selectedAvailableProvider.models.map((item) => item.model),
					primaryModel,
				),
			)
			setSnowApplyModalOpen(true)
			return
		}
		if (isOpenCodeShortcutTarget) {
			if (!selectedAvailableProvider) return
			setSelectedOpenCodeModels([])
			setOpenCodeApplyModalOpen(true)
		}
	}

	/**
	 * 使用外部传入的数据应用快捷配置（用于自定义 Provider）
	 */
	async function handleApplyShortcutWithData(model: AvailableModel, provider: AvailableProvider) {
		// 保存自定义 Provider 的数据
		setActiveApplyProvider(provider)
		setActiveApplyModel(model)

		// 检查是否需要从 v1/models 接口获取模型列表
		// 当 model 为空字符串时，说明用户没有指定模型，需要从 API 获取
		const hasEmptyModel = !model.model || model.model.trim() === ""
		let modelsToUse = provider.models.map((item) => item.model)

		if (hasEmptyModel && model.baseUrl) {
			setIsFetchingModels(true)
			try {
				logger.info(`[自定义Provider] 模型为空，尝试从 v1/models 获取模型列表: ${model.baseUrl}`)
				const fetchedModels = await listModels(model.baseUrl.trim(), model.apiKey.trim())
				const sorted = [...fetchedModels].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
				setFetchedModelsFromApi(sorted)
				modelsToUse = sorted
				logger.success(`[自定义Provider] v1/models 获取到 ${sorted.length} 个模型`)
			} catch (e) {
				logger.error("[自定义Provider] v1/models 获取失败:", e)
				toast("无法从 /v1/models 获取模型列表，请手动配置模型", "warning")
			} finally {
				setIsFetchingModels(false)
			}
		} else {
			// 如果有模型，清空之前获取的列表
			setFetchedModelsFromApi([])
		}

		if (isClaudeSettingsShortcutTarget) {
			setClaudeEnvSelection(buildClaudeModelGuessMap(modelsToUse, model.model || modelsToUse[0] || ""))
			setClaudeApplyModalOpen(true)
			return
		}
		if (isCodexShortcutTarget) {
			setSelectedCodexApplyModel(model.model || modelsToUse[0] || "")
			setCodexApplyModalOpen(true)
			return
		}
		if (isGeminiShortcutTarget) {
			setSelectedGeminiApplyModel(model.model || modelsToUse[0] || "")
			setGeminiApplyModalOpen(true)
			return
		}
		if (isSnowShortcutTarget) {
			const primaryModel = model.model || modelsToUse[0] || ""
			setSelectedSnowRequestMethod(inferSnowRequestMethod(model.supportedProtocols))
			setSelectedSnowAdvancedModel(primaryModel)
			setSelectedSnowBasicModel(pickDefaultSnowBasicModel(modelsToUse, primaryModel))
			setSnowApplyModalOpen(true)
			return
		}
		if (isOpenCodeShortcutTarget) {
			setSelectedOpenCodeModels([])
			setOpenCodeApplyModalOpen(true)
			return
		}

		// 如果没有匹配任何配置目标，提示用户先选择配置组
		toast("请先选择左侧的 Claude/Codex/Gemini/Snow/OpenCode 配置组，再应用 Provider", "warning")
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
		// Active apply data (for custom provider)
		activeApplyProvider,
		activeApplyModel,
		// Fetched models from API (for custom provider with empty model)
		fetchedModelsFromApi,
		isFetchingModels,
		// Codex API Key management
		codexApiKey,
		setCodexApiKey,
		isSavingCodexKey,
		handleSaveCodexApiKey,
		handleRemoveCodexApiKey,
		// Handlers
		handleClaudeEnvFieldChange,
		handleApplyClaudeShortcutToDraft,
		handleApplyCodexShortcutToDraft,
		handleApplyCodexShortcutAndSave,
		handleApplyCodexShortcutDirectSave,
		handleApplyGeminiShortcutToDraft,
		handleApplySnowShortcutToDraft,
		handleApplyOpenCodeShortcutToDraft,
		handleToggleOpenCodeModel,
		handleApplyShortcut,
		handleApplyShortcutWithData,
	}
}
