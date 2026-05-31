import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import {
	Activity,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	CircleDot,
	Eye,
	EyeOff,
	GitBranch,
	Loader2,
	Plus,
	Play,
	RefreshCw,
	Save,
	Square,
	Trash2,
	Wifi,
	X,
} from "lucide-react"
import {
	applyCodexProxyToCodex,
	getCodexProxyLogs,
	getCodexProxyStatus,
	loadCodexProxyConfig,
	loadCodexProxySettings,
	saveCodexProxyConfig,
	saveCodexProxySettings,
	setCodexProxyAutostart,
	startCodexProxyGateway,
	stopCodexProxyGateway,
	testCodexProxyProvider,
} from "@/api"
import {
	BUTTON_ICON_DANGER_SM_CLASS,
	BUTTON_ICON_GHOST_SM_CLASS,
	BUTTON_PRIMARY_CLASS,
	BUTTON_SECONDARY_CLASS,
	BUTTON_SIZE_XS_CLASS,
} from "@/lib/buttonStyles"
import {
	ACTION_GROUP_BUTTON_ACTIVE_CLASS,
	ACTION_GROUP_BUTTON_BASE_CLASS,
	ACTION_GROUP_BUTTON_INACTIVE_CLASS,
	ACTION_GROUP_WRAPPER_CLASS,
} from "@/lib/actionGroupStyles"
import { FIELD_INPUT_CLASS, FIELD_MONO_INPUT_CLASS, FIELD_SELECT_CLASS } from "@/lib/formStyles"
import { toast } from "@/lib/toast"
import { logger } from "@/lib/devlog"
import type {
	CodexProxyConfig,
	CodexProxyLogEntry,
	CodexProvider,
	CodexProxyStatus,
	CodexProxyTestResult,
	Provider,
} from "@/types"
import { HintTooltip } from "@/components/HintTooltip"
import { Card, EmptyState, StatusBadge } from "@/components/ui"
import { ModelSelectionDialog } from "@/components/models/components/ModelSelectionDialog"

interface CodexTabProps {
	providers: Provider[]
	onDirtyChange?: (dirty: boolean) => void
}

const EMPTY_CONFIG: CodexProxyConfig = { providers: [] }

const DEFAULT_CODEX_SLOTS = [
	"openai/gpt-5.5",
	"openai/gpt-5.4",
	"openai/gpt-5.4-mini",
	"openai/gpt-5.3-codex",
	"openai/gpt-5.2",
]

function providerKey(provider: CodexProvider, index: number) {
	return provider.id || `${provider.target_url}-${index}`
}

function modelTestKey(providerIndex: number, modelId: string) {
	return `${providerIndex}-${modelId}`
}

// 将 Provider 转换为 CodexProvider
function providerToCodexProvider(provider: Provider, selectedModels?: string[]): CodexProvider {
	const availableModels = (provider.lastResult?.results ?? [])
		.filter((result) => result.available)
		.map((result) => result.model)

	const modelsToImport = selectedModels ?? availableModels

	return {
		id: provider.id,
		name: provider.name,
		target_url: provider.baseUrl,
		api_key: provider.apiKey,
		models: modelsToImport.map((modelName, index) => ({
			id: crypto.randomUUID(),
			name: modelName,
			slot: DEFAULT_CODEX_SLOTS[index % DEFAULT_CODEX_SLOTS.length],
			slots: [DEFAULT_CODEX_SLOTS[index % DEFAULT_CODEX_SLOTS.length]],
			display_name: `${provider.name}-${modelName}`,
			supported_protocols: ["openai-chat"],
			source_protocol: "openai-chat",
			target_protocol: "openai-chat",
			enabled: true,
		})),
		thinking_effort: "medium",
	}
}

export function CodexTab({ providers, onDirtyChange }: CodexTabProps) {
	const [config, setConfig] = useState<CodexProxyConfig>(EMPTY_CONFIG)
	const [settings, setSettings] = useState<{ port: number }>({ port: 5679 })
	const [status, setStatus] = useState<CodexProxyStatus | null>(null)
	const [logs, setLogs] = useState<CodexProxyLogEntry[]>([])
	const [testResults, setTestResults] = useState<Record<string, CodexProxyTestResult>>({})
	const [collapsedProviders, setCollapsedProviders] = useState<Record<string, boolean>>({})
	const [loading, setLoading] = useState(true)
	const [busy, setBusy] = useState<string | null>(null)
	const [selectedTab, setSelectedTab] = useState<"mapping" | "slots" | "logs">("mapping")
	const [importSelectionProvider, setImportSelectionProvider] = useState<Provider | null>(null)

	useEffect(() => {
		let active = true
		async function bootstrap() {
			logger.info("[Codex代理] 开始加载配置与状态")
			try {
				const [loadedConfig, loadedSettings, loadedStatus, loadedLogs] = await Promise.all([
					loadCodexProxyConfig(),
					loadCodexProxySettings(),
					getCodexProxyStatus(),
					getCodexProxyLogs(),
				])
				if (!active) return
				setConfig(loadedConfig.providers ? loadedConfig : EMPTY_CONFIG)
				setSettings(loadedSettings)
				setStatus(loadedStatus)
				setLogs(loadedLogs)
				logger.success(`[Codex代理] 加载完成：provider=${loadedConfig.providers?.length ?? 0}，log=${loadedLogs.length}`)
			} catch (error) {
				logger.error(`[Codex代理] 加载失败：${error instanceof Error ? error.message : String(error)}`)
				toast("Codex代理配置加载失败", "error")
			} finally {
				if (active) setLoading(false)
			}
		}
		void bootstrap()
		return () => {
			active = false
		}
	}, [])

	// 只在日志标签页可见且网关运行时轮询日志
	useEffect(() => {
		if (!status?.running || selectedTab !== "logs") return
		const timer = window.setInterval(() => {
			void refreshLogs()
		}, 3000)
		return () => window.clearInterval(timer)
	}, [status?.running, selectedTab])

	// 统计已启用的模型数量
	const enabledModelsCount = useMemo(
		() =>
			config.providers.reduce(
				(count, provider) => count + provider.models.filter((m) => Boolean(m.enabled)).length,
				0,
			),
		[config],
	)

	// 统计实际映射的槽位数量
	const mappedSlotsCount = useMemo(() => {
		const assignedSlots = new Set<string>()
		config.providers.forEach((provider) => {
			provider.models.forEach((model) => {
				if (model.enabled && model.slots) {
					model.slots.forEach((slot) => {
						if (slot) assignedSlots.add(slot)
					})
				}
			})
		})
		return assignedSlots.size
	}, [config])

	const mappedRows = useMemo(() => {
		const assignedModelKeys = new Set<string>()
		const rows: Array<{
			provider: string
			source: string
			target: string
			displayName: string
		}> = []

		config.providers.forEach((provider, pi) => {
			provider.models.forEach((model, mi) => {
				if (!model.enabled || !model.name.trim()) return

				const slots = model.slots || []
				if (slots.length === 0) return

				const modelKey = `${pi}:${mi}`
				if (assignedModelKeys.has(modelKey)) return
				assignedModelKeys.add(modelKey)

				rows.push({
					provider: provider.name || "未命名服务商",
					source: slots.join(", "),
					target: model.name,
					displayName: model.display_name?.trim() || `${provider.name || "provider"}-${model.name}`,
				})
			})
		})

		return rows
	}, [config])

	function updateConfig(next: CodexProxyConfig) {
		setConfig(next)
		onDirtyChange?.(true)
	}

	function updateProvider(index: number, patch: Partial<CodexProvider>) {
		updateConfig({
			providers: config.providers.map((provider, providerIndex) =>
				providerIndex === index ? { ...provider, ...patch } : provider,
			),
		})
	}

	function deleteProvider(index: number) {
		updateConfig({ providers: config.providers.filter((_, providerIndex) => providerIndex !== index) })
	}

	function handleProviderCollapseToggle(provider: CodexProvider, providerIndex: number) {
		const key = providerKey(provider, providerIndex)
		setCollapsedProviders((prev) => ({ ...prev, [key]: !prev[key] }))
	}

	// 导入功能
	function getImportableModelNames(provider: Provider) {
		return (provider.lastResult?.results ?? [])
			.filter((result) => result.available)
			.map((result) => result.model)
			.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
	}

	function getImportedModelNames(providerId: string) {
		return (
			config.providers
				.find((item) => item.id === providerId)
				?.models.map((model) => model.name)
				.filter(Boolean) ?? []
		)
	}

	function openImportProviderDialog(provider: Provider) {
		const importableModels = getImportableModelNames(provider)
		if (importableModels.length === 0) {
			toast("当前 Provider 没有可导入的可用模型", "warning")
			return
		}
		setImportSelectionProvider(provider)
	}

	function importProvider(provider: Provider, selectedModels?: string[]) {
		const nextProvider = providerToCodexProvider(provider, selectedModels)
		const existingIndex = config.providers.findIndex((item) => item.id === provider.id)
		if (existingIndex >= 0) {
			updateConfig({
				providers: config.providers.map((item, index) => (index === existingIndex ? nextProvider : item)),
			})
			setCollapsedProviders((prev) => ({ ...prev, [providerKey(nextProvider, existingIndex)]: false }))
			toast("已覆盖同一 Provider 的模型映射", "success")
			logger.info(`[Codex代理] 覆盖导入 provider：${provider.name} (${provider.id})`)
			return
		}
		updateConfig({ providers: [...config.providers, nextProvider] })
		logger.info(`[Codex代理] 新增导入 provider：${provider.name} (${provider.id})`)
	}

	function handleImportProviderConfirm(selectedModels: string[]) {
		if (!importSelectionProvider) return
		importProvider(importSelectionProvider, selectedModels)
		setImportSelectionProvider(null)
	}

	function addModel(providerIndex: number) {
		const provider = config.providers[providerIndex]
		const slotIndex = provider.models.length % DEFAULT_CODEX_SLOTS.length
		updateProvider(providerIndex, {
			models: [
				...provider.models,
				{
					id: crypto.randomUUID(),
					name: "",
					slot: DEFAULT_CODEX_SLOTS[slotIndex],
					slots: [DEFAULT_CODEX_SLOTS[slotIndex]],
					display_name: "",
					supported_protocols: ["openai-chat"],
					source_protocol: "openai-chat",
					target_protocol: "openai-chat",
					enabled: true,
				},
			],
		})
	}

	function updateModel(
		providerIndex: number,
		modelIndex: number,
		patch: Partial<{
			name: string
			slot: string
			slots: string[]
			display_name: string
			enabled: boolean
		}>,
	) {
		const provider = config.providers[providerIndex]
		updateProvider(providerIndex, {
			models: provider.models.map((model, index) => (index === modelIndex ? { ...model, ...patch } : model)),
		})
	}

	function deleteModel(providerIndex: number, modelIndex: number) {
		const provider = config.providers[providerIndex]
		const removed = provider.models[modelIndex]
		updateProvider(providerIndex, {
			models: provider.models.filter((_, index) => index !== modelIndex),
		})
		if (removed?.id) {
			const key = modelTestKey(providerIndex, removed.id)
			setTestResults((prev) => {
				if (!(key in prev)) return prev
				const next = { ...prev }
				delete next[key]
				return next
			})
		}
	}

	function setProviderEnabled(providerIndex: number, enabled: boolean) {
		const provider = config.providers[providerIndex]
		updateProvider(providerIndex, {
			models: provider.models.map((model) => ({ ...model, enabled })),
		})
		toast(enabled ? "已启用该 Provider 下全部模型" : "已停用该 Provider 下全部模型", "success")
	}

	async function handleSave() {
		setBusy("save")
		logger.info("[Codex代理] 开始保存配置")
		try {
			const nextStatus = await saveCodexProxyConfig(config)
			await saveCodexProxySettings(settings)
			setStatus(nextStatus)
			onDirtyChange?.(false)
			toast("Codex代理配置已保存", "success")
			logger.success("[Codex代理] 配置保存成功")
		} catch (error) {
			logger.error(`[Codex代理] 配置保存失败：${error instanceof Error ? error.message : String(error)}`)
			toast(error instanceof Error ? error.message : String(error), "error")
		} finally {
			setBusy(null)
		}
	}

	async function handleApply() {
		setBusy("apply")
		logger.info("[Codex代理] 开始应用到 Codex")
		try {
			const message = await applyCodexProxyToCodex(config)
			const nextStatus = await getCodexProxyStatus()
			setStatus(nextStatus)
			onDirtyChange?.(false)
			toast(message, "success")
			logger.success(`[Codex代理] 应用成功：${message}`)
		} catch (error) {
			logger.error(`[Codex代理] 应用失败：${error instanceof Error ? error.message : String(error)}`)
			toast(error instanceof Error ? error.message : String(error), "error")
		} finally {
			setBusy(null)
		}
	}

	async function handleStartGateway() {
		setBusy("gateway")
		logger.info("[Codex代理] 启动代理")
		try {
			const nextStatus = await startCodexProxyGateway(config)
			setStatus(nextStatus)
			onDirtyChange?.(false)
			toast("Codex代理已启动", "success")
			logger.success(`[Codex代理] 代理已启动，端口=${nextStatus.port}`)
		} catch (error) {
			logger.error(`[Codex代理] 启动代理失败：${error instanceof Error ? error.message : String(error)}`)
			toast(error instanceof Error ? error.message : String(error), "error")
		} finally {
			setBusy(null)
		}
	}

	async function handleStopGateway() {
		setBusy("gateway-stop")
		logger.info("[Codex代理] 停止代理")
		try {
			const nextStatus = await stopCodexProxyGateway()
			setStatus(nextStatus)
			toast("Codex代理已停止", "success")
			logger.success("[Codex代理] 代理已停止")
		} catch (error) {
			logger.error(`[Codex代理] 停止代理失败：${error instanceof Error ? error.message : String(error)}`)
			toast(error instanceof Error ? error.message : String(error), "error")
		} finally {
			setBusy(null)
		}
	}

	async function handleTestModel(providerIndex: number, modelIndex: number) {
		const provider = config.providers[providerIndex]
		const model = provider.models[modelIndex]
		if (!model?.id) {
			toast("模型标识缺失，请刷新页面后重试", "error")
			logger.warn("[Codex代理] 单模型测试跳过：模型标识缺失")
			return
		}
		const key = modelTestKey(providerIndex, model.id)
		setBusy(`test-${key}`)
		logger.info(`[Codex代理] 单模型测试：provider=${provider.name}，model=${model.name}`)
		try {
			const result = await testCodexProxyProvider(
				provider.target_url,
				provider.api_key,
				model?.name ?? "",
			)
			setTestResults((prev) => ({ ...prev, [key]: result }))
			toast(result.message, result.ok ? "success" : "error")
			if (result.ok) {
				logger.success(`[Codex代理] 单模型测试成功：${model.name} ${result.status ?? ""}`)
			} else {
				logger.warn(`[Codex代理] 单模型测试失败：${model.name} ${result.message}`)
			}
		} catch (error) {
			logger.error(`[Codex代理] 单模型测试异常：${error instanceof Error ? error.message : String(error)}`)
			toast(error instanceof Error ? error.message : String(error), "error")
		} finally {
			setBusy(null)
		}
	}

	async function handleTestAllModels(providerIndex: number) {
		const provider = config.providers[providerIndex]
		const candidates = provider.models.map((model) => ({ model })).filter(({ model }) => model.name.trim())

		if (candidates.length === 0) {
			toast("没有可测试的模型，请先填写模型名", "error")
			logger.warn(`[Codex代理] 批量测试跳过：provider=${provider.name} 无可测模型`)
			return
		}

		setBusy(`test-all-${providerIndex}`)
		logger.info(`[Codex代理] 批量测试开始：provider=${provider.name}，count=${candidates.length}`)
		const collected: Record<string, CodexProxyTestResult> = {}
		let okCount = 0
		let failCount = 0

		try {
			for (const { model } of candidates) {
				if (!model.id) {
					continue
				}
				const key = modelTestKey(providerIndex, model.id)
				try {
					const result = await testCodexProxyProvider(
						provider.target_url,
						provider.api_key,
						model.name,
					)
					collected[key] = result
					if (result.ok) okCount += 1
					else failCount += 1
				} catch (error) {
					collected[key] = {
						ok: false,
						message: error instanceof Error ? error.message : String(error),
					}
					failCount += 1
				}
			}

			setTestResults((prev) => ({ ...prev, ...collected }))
			toast(`批量测试完成：成功 ${okCount}，失败 ${failCount}`, failCount === 0 ? "success" : "error")
			if (failCount === 0) {
				logger.success(`[Codex代理] 批量测试完成：${okCount}/${candidates.length} 成功`)
			} else {
				logger.warn(`[Codex代理] 批量测试完成：成功 ${okCount}，失败 ${failCount}`)
			}
		} finally {
			setBusy(null)
		}
	}

	async function handleAutostartToggle() {
		const nextEnabled = !status?.autostart
		setBusy("autostart")
		logger.info(`[Codex代理] 切换开机自启：${nextEnabled ? "开启" : "关闭"}`)
		try {
			const enabled = await setCodexProxyAutostart(nextEnabled)
			setStatus((prev) => (prev ? { ...prev, autostart: enabled } : prev))
			toast(enabled ? "Codex代理已开启开机自启" : "Codex代理已关闭开机自启", "success")
			logger.success(`[Codex代理] 开机自启已${enabled ? "开启" : "关闭"}`)
		} catch (error) {
			logger.error(`[Codex代理] 切换开机自启失败：${error instanceof Error ? error.message : String(error)}`)
			toast(error instanceof Error ? error.message : String(error), "error")
		} finally {
			setBusy(null)
		}
	}

	async function refreshLogs() {
		try {
			const nextLogs = await getCodexProxyLogs()
			setLogs(nextLogs)
		} catch (error) {
			logger.error(`[Codex代理] 刷新请求日志失败：${error instanceof Error ? error.message : String(error)}`)
		}
	}

	function handleSlotAssignment(slotIndex: number, modelKey: string | "") {
		if (!modelKey) {
			const slotId = DEFAULT_CODEX_SLOTS[slotIndex]
			const nextProviders = config.providers.map((provider) => ({
				...provider,
				models: provider.models.map((model) => {
					const currentSlots = model.slots || []
					if (currentSlots.includes(slotId)) {
						const updatedSlots = currentSlots.filter((s) => s !== slotId)
						return {
							...model,
							slot: updatedSlots[0] ?? "",
							slots: updatedSlots,
						}
					}
					return model
				}),
			}))
			updateConfig({ providers: nextProviders })
			return
		}

		const [piStr, miStr] = modelKey.split(":")
		const pi = Number(piStr)
		const mi = Number(miStr)
		const targetProvider = config.providers[pi]
		if (!targetProvider) return
		const targetModel = targetProvider.models[mi]
		if (!targetModel) return

		const slotId = DEFAULT_CODEX_SLOTS[slotIndex]

		const nextProviders = config.providers.map((provider, pIdx) => ({
			...provider,
			models: provider.models.map((model, mIdx) => {
				const currentSlots = model.slots || []
				if (currentSlots.includes(slotId) && !(pIdx === pi && mIdx === mi)) {
					const updatedSlots = currentSlots.filter((s) => s !== slotId)
					return {
						...model,
						slot: updatedSlots[0] ?? "",
						slots: updatedSlots,
					}
				}
				if (pIdx === pi && mIdx === mi) {
					const updatedSlots = [...currentSlots.filter((s) => s !== slotId), slotId]
					return {
						...model,
						slot: updatedSlots[0] ?? "",
						slots: updatedSlots,
						enabled: true,
					}
				}
				return model
			}),
		}))
		updateConfig({ providers: nextProviders })
		toast(`已将 ${targetModel.name} 分配到槽位 ${slotId}`, "success")
	}

	if (loading) {
		return (
			<div className='flex h-full items-center justify-center text-sm text-gray-500'>
				<Loader2 className='mr-2 h-4 w-4 animate-spin' />
				正在加载 Codex 代理
			</div>
		)
	}

	return (
		<div className='flex h-full min-h-0 w-full min-w-0 flex-col'>
			<div className='shrink-0 px-6 pb-6'>
				<div className='flex items-start justify-between gap-4'>
					<div>
						<div className='flex items-center gap-2'>
							<h2 className='text-base font-semibold tracking-tight text-white'>Codex 模型映射</h2>
							<HintTooltip content='把第三方 OpenAI 兼容模型映射成 Codex CLI 可选择的本地模型槽位。' />
						</div>
						<div className='mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500'>
							<StatusBadge
								status={status?.running ? "success" : "unknown"}
								label={status?.running ? "Gateway 运行中" : "Gateway 未启动"}
							/>
							<span className='rounded-lg border border-gray-800 bg-gray-900 px-2.5 py-1'>
								端口 {status?.port ?? 5679}
							</span>
							<span className='rounded-lg border border-gray-800 bg-gray-900 px-2.5 py-1'>{enabledModelsCount} 模型已启用</span>
							<span className='rounded-lg border border-gray-800 bg-gray-900 px-2.5 py-1'>{mappedSlotsCount} 槽位已映射</span>
						</div>
					</div>
					<div className='flex flex-wrap justify-end gap-2'>
						<button
							onClick={() => void handleSave()}
							disabled={busy != null}
							className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
							{busy === "save" ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <Save className='h-3.5 w-3.5' />}
							保存配置
						</button>
						<button
							onClick={() => void handleApply()}
							disabled={busy != null}
							className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
							{busy === "apply" ? (
								<Loader2 className='h-3.5 w-3.5 animate-spin' />
							) : (
								<CheckCircle2 className='h-3.5 w-3.5' />
							)}
							应用到 Codex
						</button>
						<button
							onClick={() => void handleStartGateway()}
							disabled={busy != null || status?.running}
							className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
							{busy === "gateway" ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <Play className='h-3.5 w-3.5' />}
							启动代理
						</button>
						<button
							onClick={() => void handleStopGateway()}
							disabled={busy != null || !status?.running}
							className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
							{busy === "gateway-stop" ? (
								<Loader2 className='h-3.5 w-3.5 animate-spin' />
							) : (
								<Square className='h-3.5 w-3.5' />
							)}
							停止代理
						</button>
						<button
							onClick={() => void handleAutostartToggle()}
							disabled={busy != null}
							className={`${status?.autostart ? BUTTON_PRIMARY_CLASS : BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
							{busy === "autostart" ? (
								<Loader2 className='h-3.5 w-3.5 animate-spin' />
							) : (
								<RefreshCw className='h-3.5 w-3.5' />
							)}
							开机自启
						</button>
					</div>
				</div>
			</div>

			<div className='shrink-0 px-5 pb-3'>
				<div className='flex items-center justify-end'>
					<div className={ACTION_GROUP_WRAPPER_CLASS}>
						{(
							[
								["mapping", "模型映射"],
								["slots", "Codex 槽位"],
								["logs", "请求日志"],
							] as const
						).map(([tab, label]) => (
							<button
								key={tab}
								onClick={() => setSelectedTab(tab)}
								className={`${ACTION_GROUP_BUTTON_BASE_CLASS} ${
									selectedTab === tab ? ACTION_GROUP_BUTTON_ACTIVE_CLASS : ACTION_GROUP_BUTTON_INACTIVE_CLASS
								}`}>
								{label}
							</button>
						))}
					</div>
				</div>
			</div>

			<div className='min-h-0 flex-1 overflow-y-auto px-5 pb-5'>
				{selectedTab === "mapping" && (
					<div className='space-y-4'>
						<SlotMappingPanel config={config} onSlotAssign={handleSlotAssignment} mappedSlotsCount={mappedSlotsCount} />
						<SourceActions providers={providers} onImportProvider={openImportProviderDialog} />

						{config.providers.length === 0 ? (
							<EmptyState
								icon={<GitBranch className='h-8 w-8' />}
								title='还没有模型映射服务商'
								description='从现有 Provider 导入可用模型。'
							/>
						) : (
							config.providers.map((provider, providerIndex) => (
								<ProviderMappingCard
									key={`${provider.id ?? "provider"}-${providerIndex}`}
									provider={provider}
									providerIndex={providerIndex}
									collapsed={Boolean(collapsedProviders[providerKey(provider, providerIndex)])}
									onToggleCollapse={() => handleProviderCollapseToggle(provider, providerIndex)}
									onUpdate={(patch) => updateProvider(providerIndex, patch)}
									onDelete={() => deleteProvider(providerIndex)}
									onAddModel={() => addModel(providerIndex)}
									onTestAllModels={() => void handleTestAllModels(providerIndex)}
									onSetEnabled={(enabled) => setProviderEnabled(providerIndex, enabled)}
									onUpdateModel={(modelIndex, patch) => updateModel(providerIndex, modelIndex, patch)}
									onDeleteModel={(modelIndex) => deleteModel(providerIndex, modelIndex)}
									onTestModel={(modelIndex) => void handleTestModel(providerIndex, modelIndex)}
									testingAll={busy === `test-all-${providerIndex}`}
									testingKey={busy}
									actionBusy={busy != null}
									testResults={testResults}
								/>
							))
						)}
					</div>
				)}
				{selectedTab === "slots" && (
					<MappedModelsPanel rows={mappedRows} configPath={status?.config_path} codexDir={status?.codex_dir} />
				)}
				{selectedTab === "logs" && (
					<LogsPanel logs={logs} running={Boolean(status?.running)} onRefresh={() => void refreshLogs()} />
				)}
			</div>

			{importSelectionProvider && (
				<ModelSelectionDialog
					mode='select'
					models={getImportableModelNames(importSelectionProvider)}
					initialSelectedModels={getImportedModelNames(importSelectionProvider.id)}
					loading={false}
					fetchError={null}
					onSelectConfirm={handleImportProviderConfirm}
					onClose={() => setImportSelectionProvider(null)}
				/>
			)}
		</div>
	)
}

// ─── Source Actions ─────────────────────────────────────────────────

interface SourceActionsProps {
	providers: Provider[]
	onImportProvider: (provider: Provider) => void
}

function SourceActions({ providers, onImportProvider }: SourceActionsProps) {
	const [providerOpen, setProviderOpen] = useState(false)

	return (
		<div className='flex flex-wrap items-center gap-2 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3'>
			<div className='mr-auto'>
				<p className='text-sm font-medium text-gray-200'>服务商来源</p>
				<p className='mt-0.5 text-xs text-gray-600'>从当前 Provider 导入可用模型。</p>
			</div>
			<DropdownButton
				open={providerOpen}
				onOpenChange={setProviderOpen}
				label='导入现有 Provider'
				disabled={providers.length === 0}>
				{providers.map((provider) => {
					const importableCount = provider.lastResult?.results.filter((result) => result.available).length ?? 0
					return (
						<button
							key={provider.id}
							onClick={() => {
								onImportProvider(provider)
								setProviderOpen(false)
							}}
							className='block w-full px-3 py-2 text-left text-xs text-gray-300 transition-colors hover:bg-gray-800'>
							<span className='block truncate font-medium text-gray-200'>{provider.name}</span>
							<span className='block truncate text-gray-500'>{importableCount} 个可用模型</span>
						</button>
					)
				})}
			</DropdownButton>
		</div>
	)
}

function DropdownButton({
	open,
	onOpenChange,
	label,
	disabled,
	children,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	label: string
	disabled?: boolean
	children: ReactNode
}) {
	return (
		<div className='relative'>
			<button
				disabled={disabled}
				onClick={() => onOpenChange(!open)}
				className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
				<Plus className='h-3.5 w-3.5' />
				{label}
			</button>
			{open && (
				<div className='absolute right-0 top-full z-30 mt-1 max-h-80 w-72 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl'>
					{children}
				</div>
			)}
		</div>
	)
}

// ─── Slot Mapping Panel ─────────────────────────────────────────────

interface SlotMappingPanelProps {
	config: CodexProxyConfig
	onSlotAssign: (slotIndex: number, modelKey: string | "") => void
	mappedSlotsCount: number
}

function SlotMappingPanel({ config, onSlotAssign, mappedSlotsCount }: SlotMappingPanelProps) {
	const assignedMap = useMemo(() => {
		const map = new Map<string, { provider: number; model: number; name: string }>()
		config.providers.forEach((provider, pi) => {
			provider.models.forEach((model, mi) => {
				if (!model.enabled) return
				;(model.slots || []).forEach((slot) => {
					if (slot) {
						map.set(slot, { provider: pi, model: mi, name: model.name })
					}
				})
			})
		})
		return map
	}, [config])

	return (
		<Card className='p-4'>
			<div className='mb-3 flex items-center justify-between'>
				<h3 className='text-sm font-medium text-white'>Codex 模型槽位映射</h3>
				<span className='text-xs text-gray-500'>
					{mappedSlotsCount}/{DEFAULT_CODEX_SLOTS.length} 槽位已映射
				</span>
			</div>
			<div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'>
				{DEFAULT_CODEX_SLOTS.map((slot, index) => {
					const assigned = assignedMap.get(slot)
					return (
						<div
							key={slot}
							className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
								assigned
									? "border-indigo-500/30 bg-indigo-500/10"
									: "border-gray-800 bg-gray-900/50"
							}`}>
							<div className='min-w-0 flex-1'>
								<div className='truncate text-xs font-medium text-gray-300'>{slot}</div>
								{assigned ? (
									<div className='truncate text-xs text-indigo-400'>{assigned.name}</div>
								) : (
									<div className='text-xs text-gray-600'>未映射</div>
								)}
							</div>
							{assigned ? (
								<button
									onClick={() => onSlotAssign(index, "")}
									className='ml-2 rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-red-400'>
									<X className='h-3.5 w-3.5' />
								</button>
							) : null}
						</div>
					)
				})}
			</div>
			<div className='mt-3 text-xs text-gray-500'>
				提示：在下方 Provider 卡片中选择模型，然后点击槽位进行映射。
			</div>
		</Card>
	)
}

// ─── Provider Mapping Card ──────────────────────────────────────────

interface ProviderMappingCardProps {
	provider: CodexProvider
	providerIndex: number
	collapsed: boolean
	onToggleCollapse: () => void
	onUpdate: (patch: Partial<CodexProvider>) => void
	onDelete: () => void
	onAddModel: () => void
	onTestAllModels: () => void
	onSetEnabled: (enabled: boolean) => void
	onUpdateModel: (
		modelIndex: number,
		patch: Partial<{
			name: string
			slot: string
			slots: string[]
			display_name: string
			enabled: boolean
		}>,
	) => void
	onDeleteModel: (modelIndex: number) => void
	onTestModel: (modelIndex: number) => void
	testingAll: boolean
	testingKey: string | null
	actionBusy: boolean
	testResults: Record<string, CodexProxyTestResult>
}

function ProviderMappingCard({
	provider,
	providerIndex,
	collapsed,
	onToggleCollapse,
	onUpdate,
	onDelete,
	onAddModel,
	onTestAllModels,
	onSetEnabled,
	onUpdateModel,
	onDeleteModel,
	onTestModel,
	testingAll,
	testingKey,
	actionBusy,
	testResults,
}: ProviderMappingCardProps) {
	const [showKey, setShowKey] = useState(false)

	return (
		<Card className='overflow-hidden'>
			<div className='flex items-center justify-between border-b border-gray-800 px-4 py-3'>
				<div className='flex min-w-0 flex-1 items-center gap-3'>
					<button onClick={onToggleCollapse} className='shrink-0 text-gray-500 hover:text-gray-300'>
						{collapsed ? <ChevronRight className='h-4 w-4' /> : <ChevronDown className='h-4 w-4' />}
					</button>
					<div className='min-w-0 flex-1'>
						<div className='flex items-center gap-2'>
							<input
								type='text'
								value={provider.name}
								onChange={(e) => onUpdate({ name: e.target.value })}
								placeholder='服务商名称'
								className={`${FIELD_INPUT_CLASS} max-w-[200px] text-sm font-medium`}
							/>
							<span className='text-xs text-gray-500'>{provider.models.length} 模型</span>
						</div>
					</div>
				</div>
				<div className='flex items-center gap-2'>
					<button
						onClick={() => onSetEnabled(true)}
						disabled={actionBusy || provider.models.every((m) => m.enabled)}
						className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
						全部启用
					</button>
					<button
						onClick={() => onSetEnabled(false)}
						disabled={actionBusy || provider.models.every((m) => !m.enabled)}
						className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
						全部停用
					</button>
					<button
						onClick={onTestAllModels}
						disabled={actionBusy || testingAll}
						className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
						{testingAll ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <Wifi className='h-3.5 w-3.5' />}
						测试全部
					</button>
					<button onClick={onDelete} disabled={actionBusy} className={BUTTON_ICON_DANGER_SM_CLASS}>
						<Trash2 className='h-4 w-4' />
					</button>
				</div>
			</div>

			{!collapsed && (
				<div className='space-y-4 p-4'>
					<div className='grid gap-4 md:grid-cols-2'>
						<div>
							<label className='mb-1 block text-xs text-gray-400'>API 地址</label>
							<input
								type='text'
								value={provider.target_url}
								onChange={(e) => onUpdate({ target_url: e.target.value })}
								placeholder='https://api.openai.com'
								className={FIELD_MONO_INPUT_CLASS}
							/>
						</div>
						<div>
							<label className='mb-1 block text-xs text-gray-400'>API Key</label>
							<div className='relative'>
								<input
									type={showKey ? "text" : "password"}
									value={provider.api_key}
									onChange={(e) => onUpdate({ api_key: e.target.value })}
									placeholder='sk-...'
									className={`${FIELD_MONO_INPUT_CLASS} pr-9`}
								/>
								<button
									onClick={() => setShowKey(!showKey)}
									className='absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300'>
									{showKey ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
								</button>
							</div>
						</div>
					</div>

					<div>
						<div className='mb-2 flex items-center justify-between'>
							<label className='text-xs text-gray-400'>模型映射</label>
							<button onClick={onAddModel} disabled={actionBusy} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
								<Plus className='h-3.5 w-3.5' />
								添加模型
							</button>
						</div>

						{provider.models.length === 0 ? (
							<div className='rounded border border-dashed border-gray-800 py-6 text-center text-sm text-gray-500'>
								暂无模型，点击"添加模型"开始配置
							</div>
						) : (
							<div className='space-y-2'>
								{provider.models.map((model, modelIndex) => {
									const testKey = model.id ? modelTestKey(providerIndex, model.id) : null
									const testResult = testKey ? testResults[testKey] : null
									const isTesting = testingKey === `test-${testKey}`

									return (
										<div
											key={model.id || modelIndex}
											className={`flex items-center gap-3 rounded-lg border p-3 ${
												model.enabled ? "border-gray-800 bg-gray-900/50" : "border-gray-800/50 bg-gray-900/30 opacity-60"
											}`}>
											<div className='flex items-center gap-2'>
												<input
													type='checkbox'
													checked={model.enabled}
													onChange={(e) => onUpdateModel(modelIndex, { enabled: e.target.checked })}
													className='h-4 w-4 rounded border-gray-600 bg-gray-700 text-indigo-600'
												/>
											</div>

											<div className='flex-1'>
												<input
													type='text'
													value={model.name}
													onChange={(e) => onUpdateModel(modelIndex, { name: e.target.value })}
													placeholder='模型名称 (如: gpt-4o)'
													className={FIELD_INPUT_CLASS}
												/>
											</div>

											<div className='w-48'>
												<select
													value={model.slots?.[0] || model.slot || ""}
													onChange={(e) =>
														onUpdateModel(modelIndex, {
															slot: e.target.value,
															slots: [e.target.value],
														})
													}
													className={FIELD_SELECT_CLASS}>
													<option value=''>选择槽位</option>
													{DEFAULT_CODEX_SLOTS.map((slot) => (
														<option key={slot} value={slot}>
															{slot}
														</option>
													))}
												</select>
											</div>

											<div className='flex items-center gap-1'>
												{testResult && (
													<span
														className={`text-xs ${
															testResult.ok ? "text-emerald-400" : "text-red-400"
														}`}>
														{testResult.ok ? "✓" : "✗"}
													</span>
												)}
												<button
													onClick={() => onTestModel(modelIndex)}
													disabled={actionBusy || isTesting || !model.name.trim()}
													className={BUTTON_ICON_GHOST_SM_CLASS}
													title='测试连接'>
													{isTesting ? (
														<Loader2 className='h-4 w-4 animate-spin' />
													) : (
														<Wifi className='h-4 w-4' />
													)}
												</button>
												<button
													onClick={() => onDeleteModel(modelIndex)}
													disabled={actionBusy}
													className={BUTTON_ICON_DANGER_SM_CLASS}
													title='删除模型'>
													<Trash2 className='h-4 w-4' />
												</button>
											</div>
										</div>
									)
								})}
							</div>
						)}
					</div>
				</div>
			)}
		</Card>
	)
}

// ─── Mapped Models Panel ────────────────────────────────────────────

interface MappedModelsPanelProps {
	rows: Array<{
		provider: string
		source: string
		target: string
		displayName: string
	}>
	configPath?: string
	codexDir?: string
}

function MappedModelsPanel({ rows, configPath, codexDir }: MappedModelsPanelProps) {
	return (
		<Card className='p-4'>
			<div className='mb-4 flex items-center justify-between'>
				<h3 className='text-sm font-medium text-white'>已映射模型列表</h3>
				<span className='text-xs text-gray-500'>{rows.length} 个映射</span>
			</div>

			{rows.length === 0 ? (
				<EmptyState
					icon={<CircleDot className='h-8 w-8' />}
					title='暂无模型映射'
					description='在"模型映射"标签页配置模型后，映射关系将显示在这里。'
				/>
			) : (
				<div className='space-y-2'>
					{rows.map((row, index) => (
						<div
							key={index}
							className='flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3'>
							<div className='min-w-0 flex-1'>
								<div className='flex items-center gap-2'>
									<span className='rounded bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-400'>
										{row.source}
									</span>
									<span className='text-gray-500'>→</span>
									<span className='text-sm text-gray-300'>{row.target}</span>
								</div>
								<div className='mt-1 text-xs text-gray-500'>
									{row.provider} · {row.displayName}
								</div>
							</div>
						</div>
					))}
				</div>
			)}

			{(configPath || codexDir) && (
				<div className='mt-4 space-y-2 border-t border-gray-800 pt-4 text-xs text-gray-500'>
					{configPath && (
						<div className='flex items-center gap-2'>
							<span>配置文件:</span>
							<code className='rounded bg-gray-800 px-2 py-1'>{configPath}</code>
						</div>
					)}
					{codexDir && (
						<div className='flex items-center gap-2'>
							<span>Codex 目录:</span>
							<code className='rounded bg-gray-800 px-2 py-1'>{codexDir}</code>
						</div>
					)}
				</div>
			)}
		</Card>
	)
}

// ─── Logs Panel ─────────────────────────────────────────────────────

interface LogsPanelProps {
	logs: CodexProxyLogEntry[]
	running: boolean
	onRefresh: () => void
}

function LogsPanel({ logs, running, onRefresh }: LogsPanelProps) {
	return (
		<Card className='p-4'>
			<div className='mb-4 flex items-center justify-between'>
				<div className='flex items-center gap-2'>
					<h3 className='text-sm font-medium text-white'>请求日志</h3>
					{running && (
						<span className='flex items-center gap-1 text-xs text-emerald-400'>
							<span className='h-1.5 w-1.5 animate-pulse rounded-full bg-current' />
							实时
						</span>
					)}
				</div>
				<button onClick={onRefresh} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
					<RefreshCw className='h-3.5 w-3.5' />
					刷新
				</button>
			</div>

			{logs.length === 0 ? (
				<EmptyState
					icon={<Activity className='h-8 w-8' />}
					title='暂无请求日志'
					description={running ? "网关运行中，请求日志将实时显示在这里。" : "启动网关后，请求日志将显示在这里。"}
				/>
			) : (
				<div className='space-y-2 max-h-[400px] overflow-y-auto'>
					{logs.map((log, index) => (
						<div
							key={index}
							className={`rounded-lg border px-4 py-3 text-sm ${
								log.status >= 200 && log.status < 300
									? "border-emerald-500/20 bg-emerald-500/5"
									: log.status >= 400
										? "border-red-500/20 bg-red-500/5"
										: "border-gray-800 bg-gray-900/50"
							}`}>
							<div className='flex items-center gap-2'>
								<span className='text-xs text-gray-500'>{log.time}</span>
								<span
									className={`rounded px-1.5 py-0.5 text-xs font-medium ${
										log.status >= 200 && log.status < 300
											? "bg-emerald-500/20 text-emerald-400"
											: log.status >= 400
												? "bg-red-500/20 text-red-400"
												: "bg-gray-700 text-gray-400"
									}`}>
									{log.status}
								</span>
								<span className='text-gray-300'>
									{log.model} → {log.target_model}
								</span>
							</div>
							{log.error_message && (
								<div className='mt-1 text-xs text-red-400'>{log.error_message}</div>
							)}
						</div>
					))}
				</div>
			)}
		</Card>
	)
}
