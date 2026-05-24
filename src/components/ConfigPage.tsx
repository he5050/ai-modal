import { useEffect, useMemo, useState } from "react"
import { logger } from "@/lib/devlog"
import { Plus, ExternalLink, Pencil, Trash2, CheckCircle2, ArrowRightLeft } from "lucide-react"
import {
	buildConfigGroups,
	inferConfigFormatFromPath,
	normalizeGroupRelativePath,
	resolveGroupAbsolutePath,
} from "@/lib/configGroups"
import { formatConfigContent, getSupportedConfigFormatsLabel, isSupportedConfigFormat } from "@/lib/configFormatter"
import { toast } from "@/lib/toast"
import {
	BUTTON_ACCENT_OUTLINE_CLASS,
	BUTTON_PRIMARY_CLASS,
	BUTTON_SECONDARY_CLASS,
	BUTTON_SIZE_MD_CLASS,
	BUTTON_SIZE_XS_CLASS,
} from "@/lib/buttonStyles"
import { FIELD_SELECT_CLASS, FIELD_MONO_INPUT_CLASS } from "@/lib/formStyles"
import type { ConfigGroupId, ConfigPath, Provider } from "@/types"
import { HintTooltip } from "./HintTooltip"

import { SNOW_REQUEST_METHOD_OPTIONS } from "./configs/constants"
import { toDisplayPath, getModelConfigLabel, getModelConfigResultText } from "./configs/utils"
import { ConfirmModal } from "./ui"
import {
	ClaudeApplyModal,
	CodexApplyModal,
	GeminiApplyModal,
	SnowApplyModal,
	OpenCodeApplyModal,
} from "./configs/applyModals"
import { CustomProviderDialog } from "./configs/CustomProviderDialog"
import { useConfigDraft } from "./configs/useConfigDraft"
import { useModelConfig } from "./configs/useModelConfig"
import { useApplyShortcut } from "./configs/useApplyShortcut"
import { ConfigToolbar } from "./configs/components/ConfigToolbar"
import { ConfigFileTabs } from "./configs/components/ConfigFileTabs"
import { ConfigEditorPanel } from "./configs/components/ConfigEditorPanel"
import type { ModelConfigRecord } from "./configs/constants"

interface Props {
	providers: Provider[]
	storedPaths: ConfigPath[]
	onUpsertPath: (path: ConfigPath) => void
	onDeletePath: (id: string) => void
	onDirtyChange: (dirty: boolean) => void
	onAddProvider?: (data: Omit<Provider, "id" | "createdAt" | "lastResult">) => string | void
	onEditProvider?: (id: string, data: Omit<Provider, "id" | "createdAt" | "lastResult">) => void
	onFindProviderByUrlAndKey?: (baseUrl: string, apiKey: string) => Provider | undefined
}

interface PendingSwitchTarget {
	groupId: ConfigGroupId
	fileId: string
}

export function ConfigPage({
	providers,
	storedPaths,
	onUpsertPath,
	onDeletePath,
	onDirtyChange,
	onAddProvider,
	onEditProvider,
	onFindProviderByUrlAndKey,
}: Props) {
	const [selectedGroupId, setSelectedGroupId] = useState<ConfigGroupId>("claude")
	const [selectedFileId, setSelectedFileId] = useState<string>("claude")
	const [pendingSwitchTarget, setPendingSwitchTarget] = useState<PendingSwitchTarget | null>(null)
	const [showAddFileForm, setShowAddFileForm] = useState(false)
	const [newRelativePath, setNewRelativePath] = useState("")
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
	const [selectedAvailableProviderId, setSelectedAvailableProviderId] = useState<string>("")
	const [quickModelTab, setQuickModelTab] = useState<"shortcut" | "custom">("shortcut")
	const [customProviderDialogOpen, setCustomProviderDialogOpen] = useState(false)
	const [editingCustomProvider, setEditingCustomProvider] = useState<ModelConfigRecord | null>(null)
	const [applyConfirmOpen, setApplyConfirmOpen] = useState(false)
	const [pendingApplyConfig, setPendingApplyConfig] = useState<ModelConfigRecord | null>(null)
	const [syncConfirmOpen, setSyncConfirmOpen] = useState(false)
	const [pendingSyncConfig, setPendingSyncConfig] = useState<ModelConfigRecord | null>(null)
	const [existingSyncProvider, setExistingSyncProvider] = useState<Provider | null>(null)

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
		handleSaveCustomProvider,
		handleDeleteCustomProvider,
		handleTestCurrentModelConfig,
		updateSelectedModelConfig,
	} = useModelConfig()

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
	} = useConfigDraft()

	const groups = useMemo(() => (homePath ? buildConfigGroups(storedPaths, homePath) : []), [homePath, storedPaths])
	const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null
	const selectedFile =
		selectedGroup?.files.find((file) => file.id === selectedFileId) ?? selectedGroup?.files[0] ?? null

	const activeDraft = selectedFile ? draftsByFileId[selectedFile.id] : null
	const activeContentDraft = activeDraft?.contentDraft ?? ""
	const activeFileExists = activeDraft?.fileExists ?? false
	const activeLoading = activeDraft?.loading ?? false

	const dirty = modelConfigDirty || fileDirty

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
						const result = (provider.lastResult?.results ?? []).find((item) => item.available && item.model === model)
						return {
							id: `${provider.id}::${model}`,
							model,
							baseUrl: provider.baseUrl,
							apiKey: provider.apiKey,
							supportedProtocols: result?.supported_protocols ?? [],
						}
					})
					return models.length > 0
						? { id: provider.id, providerName: provider.name, availableCount: models.length, models }
						: null
				})
				.filter(Boolean) as {
				id: string
				providerName: string
				availableCount: number
				models: { id: string; model: string; baseUrl: string; apiKey: string; supportedProtocols: string[] }[]
			}[],
		[providers],
	)

	const selectedAvailableProvider =
		availableProviderOptions.find((item) => item.id === selectedAvailableProviderId) ??
		availableProviderOptions[0] ??
		null
	const selectedAvailableModel = selectedAvailableProvider?.models[0] ?? null

	const isClaudeSettingsShortcutTarget = selectedGroup?.id === "claude" && selectedFile?.id === "claude"
	const isCodexShortcutTarget = selectedGroup?.id === "codex"
	const isGeminiShortcutTarget = selectedGroup?.id === "gemini"
	const isSnowShortcutTarget = selectedGroup?.id === "snow"
	const isOpenCodeShortcutTarget = selectedGroup?.id === "opencode"

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
		handleApplyShortcutWithData,
		// Active apply data (for custom provider)
		activeApplyProvider,
		activeApplyModel,
		// Fetched models from API (for custom provider with empty model)
		fetchedModelsFromApi,
		isFetchingModels,
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
	})

	async function handleFormat() {
		if (!activeContentDraft || !selectedFile) return
		try {
			if (!isSupportedConfigFormat(selectedFile.format)) {
				toast(`当前仅对 ${getSupportedConfigFormatsLabel()} 配置提供标准格式化`, "warning")
				return
			}
			const result = await formatConfigContent(activeContentDraft, selectedFile.format)
			updateDraftState(selectedFile.id, { contentDraft: result.formatted })
			toast(
				result.normalizedPunctuation
					? `已格式化 ${selectedFile.format.toUpperCase()} 配置，并自动将中文语法符号转换为英文符号`
					: `已格式化 ${selectedFile.format.toUpperCase()} 配置`,
				"success",
			)
		} catch (error) {
			logger.error("Failed to format config", error)
			toast(error instanceof Error ? `配置格式化失败：${error.message}` : "配置格式化失败", "error")
		}
	}

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(activeContentDraft)
			toast("已复制当前配置内容", "success")
		} catch {
			toast("复制失败", "error")
		}
	}

	async function handleSaveContent() {
		if (!selectedFile) return false
		return saveFileContent(selectedFile, activeContentDraft, onUpsertPath)
	}

	// Effects
	useEffect(() => {
		onDirtyChange(dirty)
		return () => onDirtyChange(false)
	}, [dirty, onDirtyChange])

	useEffect(() => {
		if (groups.length === 0) return
		if (!selectedGroup) {
			setSelectedGroupId(groups[0].id)
			setSelectedFileId(groups[0].files[0]?.id ?? "")
			return
		}
		if (!selectedFile && selectedGroup.files[0]) setSelectedFileId(selectedGroup.files[0].id)
	}, [groups, selectedFile, selectedGroup])

	useEffect(() => {
		if (availableProviderOptions.length === 0) {
			setSelectedAvailableProviderId("")
			return
		}
		const exists = availableProviderOptions.some((item) => item.id === selectedAvailableProviderId)
		if (!exists) setSelectedAvailableProviderId(availableProviderOptions[0].id)
	}, [availableProviderOptions, selectedAvailableProviderId])

	useEffect(() => {
		if (!selectedFile) return
		if (draftsByFileId[selectedFile.id]?.loadedPath === selectedFile.absolutePath) return
		void refreshCurrent(selectedFile)
	}, [draftsByFileId, selectedFile?.id, selectedFile?.absolutePath, refreshCurrent])

	// Switch helpers
	function applySwitch(target: PendingSwitchTarget) {
		setSelectedGroupId(target.groupId)
		setSelectedFileId(target.fileId)
	}

	function requestSwitch(target: PendingSwitchTarget) {
		if (!selectedFile || !getFileDirty(selectedFile.id)) {
			applySwitch(target)
			return
		}
		setPendingSwitchTarget(target)
	}

	function handleRequestGroupSwitch(groupId: ConfigGroupId) {
		const nextGroup = groups.find((group) => group.id === groupId)
		const nextFileId = nextGroup?.files[0]?.id
		if (!nextGroup || !nextFileId) return
		requestSwitch({ groupId, fileId: nextFileId })
	}

	function handleRequestFileSwitch(fileId: string) {
		if (!selectedGroup) return
		requestSwitch({ groupId: selectedGroup.id, fileId })
	}

	// File management
	function handleAddGroupFile() {
		if (!selectedGroup || !homePath) return
		const relativePath = normalizeGroupRelativePath(newRelativePath)
		if (!relativePath) {
			toast("只允许当前目录下的相对路径，且不能包含 ../", "warning")
			return
		}
		const nextId = `${selectedGroup.id}::${relativePath}`
		const absolutePath = resolveGroupAbsolutePath(homePath, selectedGroup.rootDir, relativePath)
		if (selectedGroup.files.some((file) => file.id === nextId)) {
			toast("该文件已在当前分组中存在", "warning")
			return
		}
		onUpsertPath({
			id: nextId,
			label: relativePath.split("/").pop() ?? relativePath,
			path: absolutePath,
			isBuiltin: false,
			kind: "file",
			format: inferConfigFormatFromPath(absolutePath),
		})
		setShowAddFileForm(false)
		setNewRelativePath("")
		setSelectedFileId(nextId)
		toast("已新增组内配置文件", "success")
	}

	function handleDeleteCurrentCustomPath() {
		if (!selectedFile || selectedFile.isBuiltin) return
		setShowDeleteConfirm(false)
		onDeletePath(selectedFile.id)
		const fallbackFile = selectedGroup?.files.find((file) => file.id !== selectedFile.id) ?? null
		if (fallbackFile) setSelectedFileId(fallbackFile.id)
		toast("已删除当前自定义配置文件入口", "success")
	}

	async function handleSaveAndSwitch() {
		if (!selectedFile) return
		const saved = await saveFileContent(selectedFile, activeContentDraft, onUpsertPath)
		if (!saved || !pendingSwitchTarget) return
		applySwitch(pendingSwitchTarget)
		setPendingSwitchTarget(null)
	}

	function handleImportSelectedAvailableModel() {
		handleImportSelectedAvailableModelFromHook(selectedAvailableModel, selectedAvailableProvider)
	}

	// 自定义 Provider 相关方法
	function handleOpenCustomProviderDialog(config?: ModelConfigRecord) {
		setEditingCustomProvider(config || null)
		setCustomProviderDialogOpen(true)
	}

	function handleCloseCustomProviderDialog() {
		setCustomProviderDialogOpen(false)
		setEditingCustomProvider(null)
	}

	async function handleSaveCustomProviderFromDialog(config: {
		id?: string
		name: string
		baseUrl: string
		apiKey: string
		model: string
	}) {
		return handleSaveCustomProvider(config)
	}

	async function handleDeleteCustomProviderFromDialog(id: string) {
		return handleDeleteCustomProvider(id)
	}

	// 应用自定义 Provider 到配置
	function handleApplyCustomProvider(config: ModelConfigRecord) {
		setPendingApplyConfig(config)
		setApplyConfirmOpen(true)
	}

	function confirmApplyCustomProvider() {
		if (!pendingApplyConfig) return

		// 构造与快捷模型相同的数据结构，复用 useApplyShortcut 的逻辑
		const mockAvailableModel = {
			id: pendingApplyConfig.id,
			model: pendingApplyConfig.model,
			baseUrl: pendingApplyConfig.baseUrl,
			apiKey: pendingApplyConfig.apiKey,
			supportedProtocols: [],
		}

		const mockAvailableProvider = {
			id: pendingApplyConfig.id,
			providerName: pendingApplyConfig.name || pendingApplyConfig.model || "自定义 Provider",
			availableCount: 1,
			models: [mockAvailableModel],
		}

		// 关闭确认弹窗
		setApplyConfirmOpen(false)
		setPendingApplyConfig(null)

		// 调用快捷模型应用逻辑（使用外部数据）
		void handleApplyShortcutWithData(mockAvailableModel, mockAvailableProvider)
	}

	function cancelApplyCustomProvider() {
		setApplyConfirmOpen(false)
		setPendingApplyConfig(null)
	}

	// 同步自定义 Provider 到模型列表
	function handleSyncCustomProvider(config: ModelConfigRecord) {
		// 检查是否已存在相同 URL + API Key 的 Provider
		const existing = onFindProviderByUrlAndKey?.(config.baseUrl, config.apiKey)
		setExistingSyncProvider(existing || null)
		setPendingSyncConfig(config)
		setSyncConfirmOpen(true)
	}

	function confirmSyncCustomProvider() {
		if (!pendingSyncConfig) return

		// 同步到 modelConfigs
		void handleImportSelectedAvailableModelFromHook(
			{
				baseUrl: pendingSyncConfig.baseUrl,
				apiKey: pendingSyncConfig.apiKey,
				model: pendingSyncConfig.model,
			},
			{
				models: [
					{
						baseUrl: pendingSyncConfig.baseUrl,
						apiKey: pendingSyncConfig.apiKey,
						model: pendingSyncConfig.model,
					},
				],
			},
		)

		// 同步到 Provider 列表（已存在则更新，不存在则添加）
		if (existingSyncProvider && onEditProvider) {
			onEditProvider(existingSyncProvider.id, {
				name: pendingSyncConfig.name || pendingSyncConfig.model || "自定义 Provider",
				baseUrl: pendingSyncConfig.baseUrl,
				apiKey: pendingSyncConfig.apiKey,
			})
			toast(`已更新 Provider「${pendingSyncConfig.name || pendingSyncConfig.model || "自定义 Provider"}」`, "success")
		} else if (onAddProvider) {
			onAddProvider({
				name: pendingSyncConfig.name || pendingSyncConfig.model || "自定义 Provider",
				baseUrl: pendingSyncConfig.baseUrl,
				apiKey: pendingSyncConfig.apiKey,
			})
			toast(`已添加 Provider「${pendingSyncConfig.name || pendingSyncConfig.model || "自定义 Provider"}」`, "success")
		}

		setSyncConfirmOpen(false)
		setPendingSyncConfig(null)
		setExistingSyncProvider(null)
	}

	function cancelSyncCustomProvider() {
		setSyncConfirmOpen(false)
		setPendingSyncConfig(null)
		setExistingSyncProvider(null)
	}

	// ─── Render ───

	return (
		<div className='flex h-full min-h-0 w-full min-w-0 flex-col'>
			<div className='shrink-0 px-6 pb-6'>
				<div>
					<div className='flex items-center gap-2'>
						<h2 className='text-base font-semibold tracking-tight text-white'>配置管理</h2>
						<HintTooltip content='管理 Claude、Codex、Gemini、OpenCode、Qwen、Snow 的主配置文件，和规则文件分开维护。' />
					</div>
				</div>
			</div>

			<div className='min-h-0 flex-1 overflow-y-auto px-6 pb-6'>
				<section className='min-w-0 rounded-2xl border border-gray-800 bg-gray-900/80'>
					{selectedGroup && selectedFile && (
						<div className='space-y-5 px-5 py-5'>
							<ConfigToolbar
								groups={groups.map(({ id, label }) => ({ id, label }))}
								selectedGroup={selectedGroup.id}
								selectedFile={selectedFile}
								homePath={homePath}
								onGroupChange={handleRequestGroupSwitch}
								onOpenDirectory={() => {
									if (selectedFile) openDirectory(selectedFile)
								}}
								onOpenFile={() => {
									if (selectedFile) openFile(selectedFile)
								}}
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
								onCancelAdd={() => {
									setShowAddFileForm(false)
									setNewRelativePath("")
								}}
								onSaveAdd={handleAddGroupFile}
								toDisplayPath={toDisplayPath}
								resolveGroupAbsolutePath={resolveGroupAbsolutePath}
							/>

							{/* Quick model selector with Tabs */}
							<div className='rounded-xl border border-gray-800/80 bg-gray-950/30 px-4 py-4'>
								{/* Tab 切换 */}
								<div className='mb-4 flex items-center gap-1 border-b border-gray-800 pb-3'>
									<button
										onClick={() => setQuickModelTab("shortcut")}
										className={`px-3 py-1.5 text-sm font-medium transition-colors ${
											quickModelTab === "shortcut"
												? "text-indigo-400 border-b-2 border-indigo-400"
												: "text-gray-400 hover:text-gray-200"
										}`}>
										快捷模型
									</button>
									<button
										onClick={() => setQuickModelTab("custom")}
										className={`px-3 py-1.5 text-sm font-medium transition-colors ${
											quickModelTab === "custom"
												? "text-indigo-400 border-b-2 border-indigo-400"
												: "text-gray-400 hover:text-gray-200"
										}`}>
										自定义
									</button>
								</div>

								{quickModelTab === "shortcut" ? (
									/* 快捷模型 Tab */
									availableProviderOptions.length > 0 && selectedAvailableModel ? (
										<div className='flex flex-wrap items-center gap-3'>
											<div className='flex items-center gap-1.5'>
												<p className='text-sm font-medium text-gray-200'>快捷模型</p>
												<HintTooltip content='这里只选 Provider；具体模型映射在弹窗里完成。' />
											</div>
											<div className='w-[240px]'>
												<select
													value={selectedAvailableProvider?.id ?? ""}
													onChange={(event) => setSelectedAvailableProviderId(event.target.value)}
													className={FIELD_SELECT_CLASS}
													aria-label='选择快捷模型 Provider'>
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
													className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
													应用
												</button>
											)}
										</div>
									) : (
										<div className='text-sm text-gray-500'>当前还没有可用模型。请先去模型列表或详情页完成检测。</div>
									)
								) : (
									/* 自定义 Tab */
									<div className='space-y-3'>
										{modelConfigs.filter((c) => c.isCustom).length === 0 ? (
											<div className='text-sm text-gray-500'>暂无自定义 Provider，点击下方按钮添加。</div>
										) : (
											<div className='space-y-2'>
												{modelConfigs
													.filter((c) => c.isCustom)
													.map((config) => (
														<div
															key={config.id}
															className='flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2'>
															<div className='min-w-0 flex-1'>
																<div className='flex items-center gap-2'>
																	<span className='truncate text-sm font-medium text-gray-200'>
																		{config.name || config.model || "未命名"}
																	</span>
																	{config.syncedToModels && (
																		<span className='shrink-0 rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-400'>
																			已同步
																		</span>
																	)}
																	{config.lastTestResult?.available && (
																		<CheckCircle2 className='h-3.5 w-3.5 text-green-400' />
																	)}
																</div>
																<div className='mt-0.5 flex items-center gap-2 text-xs text-gray-500'>
																	<a
																		href={config.baseUrl}
																		target='_blank'
																		rel='noopener noreferrer'
																		className='truncate font-mono text-indigo-400 hover:text-indigo-300 hover:underline'
																		onClick={(e) => e.stopPropagation()}>
																		{config.baseUrl}
																	</a>
																	{config.model && <span className='text-gray-600'>| {config.model}</span>}
																</div>
															</div>
															<div className='ml-3 flex items-center gap-1'>
																<a
																	href={config.baseUrl}
																	target='_blank'
																	rel='noopener noreferrer'
																	className='flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-800 hover:text-indigo-400'
																	title='访问 URL'>
																	<ExternalLink className='h-3.5 w-3.5' />
																</a>
																<button
																	onClick={() => handleOpenCustomProviderDialog(config)}
																	className='flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200'
																	title='编辑'>
																	<Pencil className='h-3.5 w-3.5' />
																</button>
																<button
																	onClick={() => handleDeleteCustomProviderFromDialog(config.id)}
																	className='flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-800 hover:text-red-400'
																	title='删除'>
																	<Trash2 className='h-3.5 w-3.5' />
																</button>
																<button
																	onClick={() => handleSyncCustomProvider(config)}
																	className='flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-800 hover:text-green-400'
																	title='同步到模型列表'>
																	<ArrowRightLeft className='h-3.5 w-3.5' />
																</button>
																{(isClaudeSettingsShortcutTarget ||
																	isCodexShortcutTarget ||
																	isGeminiShortcutTarget ||
																	isSnowShortcutTarget ||
																	isOpenCodeShortcutTarget) && (
																	<button
																		onClick={() => handleApplyCustomProvider(config)}
																		className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS} ml-1`}>
																		应用
																	</button>
																)}
															</div>
														</div>
													))}
											</div>
										)}
										<button
											onClick={() => handleOpenCustomProviderDialog()}
											className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
											<Plus className='mr-1 h-3.5 w-3.5' />
											新增
										</button>
									</div>
								)}
							</div>

							<ConfigEditorPanel
								value={activeContentDraft}
								onChange={(value) => selectedFile && updateDraftState(selectedFile.id, { contentDraft: value })}
								format={selectedFile.format}
								loading={activeLoading}
								fileName={selectedFile.fileName}
								fileExists={activeFileExists}
								hasDirty={!!(selectedFile && getFileDirty(selectedFile.id))}
								accentClass={selectedGroup.accentClass}
								onDiscard={() => {
									if (selectedFile) discardChanges(selectedFile.id)
								}}
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
				<ConfirmModal
					variant='warning'
					title='切换当前文件？'
					description='当前文件有未保存内容。请选择直接切换，或先保存后再切换。'
					primaryLabel='切换'
					tertiaryLabel='保存'
					onPrimary={() => {
						if (pendingSwitchTarget) {
							applySwitch(pendingSwitchTarget)
							setPendingSwitchTarget(null)
						}
					}}
					onTertiary={() => void handleSaveAndSwitch()}
				/>
			)}

			{showDeleteConfirm && selectedFile && !selectedFile.isBuiltin && (
				<ConfirmModal
					variant='warning'
					title='删除当前组内文件？'
					description={`将移除当前文件"${selectedFile.label}"的入口配置，不会删除磁盘上的实际文件。`}
					primaryLabel='确认删除'
					secondaryLabel='取消'
					danger
					onPrimary={handleDeleteCurrentCustomPath}
					onSecondary={() => setShowDeleteConfirm(false)}
				/>
			)}

			{claudeApplyModalOpen && activeApplyModel && activeApplyProvider && (
				<ClaudeApplyModal
					providerName={activeApplyProvider.providerName}
					availableModels={
						fetchedModelsFromApi.length > 0
							? fetchedModelsFromApi
							: activeApplyProvider.models.map((item) => item.model)
					}
					selection={claudeEnvSelection}
					onChange={handleClaudeEnvFieldChange}
					onConfirm={() => void handleApplyClaudeShortcutToDraft()}
					onCancel={() => setClaudeApplyModalOpen(false)}
				/>
			)}

			{codexApplyModalOpen && activeApplyProvider && (
				<CodexApplyModal
					providerName={activeApplyProvider.providerName}
					availableModels={
						fetchedModelsFromApi.length > 0
							? fetchedModelsFromApi
							: activeApplyProvider.models.map((item) => item.model)
					}
					selectedModel={selectedCodexApplyModel}
					onChange={setSelectedCodexApplyModel}
					onConfirm={() => void handleApplyCodexShortcutToDraft()}
					onCancel={() => setCodexApplyModalOpen(false)}
				/>
			)}

			{geminiApplyModalOpen && activeApplyProvider && (
				<GeminiApplyModal
					providerName={activeApplyProvider.providerName}
					availableModels={
						fetchedModelsFromApi.length > 0
							? fetchedModelsFromApi
							: activeApplyProvider.models.map((item) => item.model)
					}
					selectedModel={selectedGeminiApplyModel}
					onChange={setSelectedGeminiApplyModel}
					onConfirm={() => void handleApplyGeminiShortcutToDraft()}
					onCancel={() => setGeminiApplyModalOpen(false)}
				/>
			)}

			{snowApplyModalOpen && activeApplyProvider && (
				<SnowApplyModal
					providerName={activeApplyProvider.providerName}
					availableModels={
						fetchedModelsFromApi.length > 0
							? fetchedModelsFromApi
							: activeApplyProvider.models.map((item) => item.model)
					}
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

			{openCodeApplyModalOpen && activeApplyProvider && (
				<OpenCodeApplyModal
					providerName={activeApplyProvider.providerName}
					models={
						fetchedModelsFromApi.length > 0
							? fetchedModelsFromApi
							: activeApplyProvider.models.map((item) => item.model)
					}
					selectedModels={selectedOpenCodeModels}
					onToggle={handleToggleOpenCodeModel}
					onConfirm={() => void handleApplyOpenCodeShortcutToDraft()}
					onCancel={() => setOpenCodeApplyModalOpen(false)}
				/>
			)}

			{/* 自定义 Provider 弹窗 */}
			<CustomProviderDialog
				isOpen={customProviderDialogOpen}
				config={editingCustomProvider}
				onClose={handleCloseCustomProviderDialog}
				onSave={handleSaveCustomProviderFromDialog}
				onDelete={editingCustomProvider ? handleDeleteCustomProviderFromDialog : undefined}
			/>

			{/* 应用确认弹窗 */}
			{applyConfirmOpen && pendingApplyConfig && (
				<ConfirmModal
					variant='default'
					title='应用自定义 Provider？'
					description={`确定要将「${pendingApplyConfig.model || "自定义 Provider"}」应用到当前配置吗？${
						pendingApplyConfig.model
							? "这将更新 URL、API Key 和模型字段。"
							: "这将只更新 URL 和 API Key，不修改模型字段。"
					}`}
					primaryLabel='确认应用'
					secondaryLabel='取消'
					onPrimary={confirmApplyCustomProvider}
					onSecondary={cancelApplyCustomProvider}
				/>
			)}

			{/* 同步确认弹窗 */}
			{syncConfirmOpen && pendingSyncConfig && (
				<ConfirmModal
					variant='default'
					title={existingSyncProvider ? "更新 Provider？" : "同步到模型列表？"}
					description={
						existingSyncProvider
							? `已存在相同 URL 和 API Key 的 Provider「${existingSyncProvider.name}」，是否更新？`
							: `确定要将「${pendingSyncConfig.name || pendingSyncConfig.model || "自定义 Provider"}」同步到模型列表吗？`
					}
					primaryLabel={existingSyncProvider ? "确认更新" : "确认同步"}
					secondaryLabel='取消'
					onPrimary={confirmSyncCustomProvider}
					onSecondary={cancelSyncCustomProvider}
				/>
			)}
		</div>
	)
}
