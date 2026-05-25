import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import {
	Activity,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	CircleDot,
	Copy,
	Eye,
	EyeOff,
	FileCode2,
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
	applyModelMappingToClaude,
	getModelMappingLogs,
	getModelMappingStatus,
	loadModelMappingConfig,
	saveModelMappingConfig,
	setModelMappingAutostart,
	startModelMappingGateway,
	stopModelMappingGateway,
	testModelMappingProvider,
} from "@/api"
import {
	BUTTON_ICON_DANGER_SM_CLASS,
	BUTTON_GHOST_CLASS,
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
import {
	DEFAULT_CLAUDE_SLOTS,
	MODEL_MAPPING_TARGET_PROTOCOLS,
	THINKING_EFFORT_LABELS,
	countMappingModels,
	getActiveMappingModels,
	getModelSlots,
	getPresetModels,
	getThinkingOptions,
	normalizeModelMappingConfig,
	providerToMappingProvider,
	toMappingEntry,
} from "@/lib/modelMapping"
import { getModelProtocolBadgeClass, getModelProtocolLabel } from "@/lib/protocolUtils"
import { toast } from "@/lib/toast"
import { logger } from "@/lib/devlog"
import type {
	ModelMappingConfig,
	ModelMappingLogEntry,
	ModelMappingProvider,
	ModelMappingStatus,
	ModelMappingTestResult,
	Provider,
} from "@/types"
import { CopyButton } from "@/components/CopyButton"
import { HintTooltip } from "@/components/HintTooltip"
import { Card, EmptyState, StatusBadge } from "@/components/ui"
import { ModelSelectionDialog } from "@/components/models/components/ModelSelectionDialog"
import { SelectionCheckbox } from "@/components/models/components/SharedDialogs"

interface CoWorkTabProps {
	providers: Provider[]
	onDirtyChange?: (dirty: boolean) => void
}

const EMPTY_CONFIG: ModelMappingConfig = { providers: [] }

function providerKey(provider: ModelMappingProvider, index: number) {
	return provider.id || `${provider.target_url}-${index}`
}

function modelTestKey(providerIndex: number, modelId: string) {
	return `${providerIndex}-${modelId}`
}

export function CoWorkTab({ providers, onDirtyChange }: CoWorkTabProps) {
	const [config, setConfig] = useState<ModelMappingConfig>(EMPTY_CONFIG)
	const [status, setStatus] = useState<ModelMappingStatus | null>(null)
	const [logs, setLogs] = useState<ModelMappingLogEntry[]>([])
	const [testResults, setTestResults] = useState<Record<string, ModelMappingTestResult>>({})
	const [collapsedProviders, setCollapsedProviders] = useState<Record<string, boolean>>({})
	const [loading, setLoading] = useState(true)
	const [busy, setBusy] = useState<string | null>(null)
	const [selectedTab, setSelectedTab] = useState<"mapping" | "slots" | "logs">("mapping")
	const [importSelectionProvider, setImportSelectionProvider] = useState<Provider | null>(null)

	useEffect(() => {
		let active = true
		async function bootstrap() {
			logger.info("[模型映射] 开始加载配置与状态")
			try {
				const [loadedConfig, loadedStatus, loadedLogs] = await Promise.all([
					loadModelMappingConfig(),
					getModelMappingStatus(),
					getModelMappingLogs(),
				])
				if (!active) return
				setConfig(loadedConfig.providers ? normalizeModelMappingConfig(loadedConfig) : EMPTY_CONFIG)
				setStatus(loadedStatus)
				setLogs(loadedLogs)
				logger.success(`[模型映射] 加载完成：provider=${loadedConfig.providers?.length ?? 0}，log=${loadedLogs.length}`)
			} catch (error) {
				logger.error(`[模型映射] 加载失败：${error instanceof Error ? error.message : String(error)}`)
				toast("模型映射配置加载失败", "error")
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

	const totalModels = countMappingModels(config)
	// 统计已启用的模型数量
	const enabledModelsCount = useMemo(
		() =>
			config.providers.reduce(
				(count, provider) => count + provider.models.filter((m) => Boolean(m.enabled)).length,
				0,
			),
		[config],
	)
	// 统计实际映射的槽位数量（只统计实际分配了模型的槽位）
	const mappedSlotsCount = useMemo(() => {
		const assignedSlots = new Set<string>()
		config.providers.forEach((provider) => {
			provider.models.forEach((model) => {
				if (model.enabled) {
					getModelSlots(model).forEach((slot) => {
						if (slot) assignedSlots.add(slot)
					})
				}
			})
		})
		return assignedSlots.size
	}, [config])
	const mappedRows = useMemo(() => {
		// 只显示实际被槽位映射引用的模型，每个模型只显示一次
		const assignedModelKeys = new Set<string>()
		const rows: Array<{
			provider: string
			source: string
			target: string
			displayName: string
			sourceProtocol: string
			targetProtocol: string
			supports1m: boolean
			thinking: string
		}> = []

		config.providers.forEach((provider, pi) => {
			provider.models.forEach((model, mi) => {
				if (!model.enabled || !model.name.trim()) return

				const slots = getModelSlots(model)
				if (slots.length === 0) return

				const modelKey = `${pi}:${mi}`
				if (assignedModelKeys.has(modelKey)) return
				assignedModelKeys.add(modelKey)

				rows.push({
					provider: provider.name || "未命名服务商",
					source: slots.join(", "),
					target: model.name,
					displayName: model.display_name?.trim() || `${provider.name || "provider"}-${model.name}`,
					sourceProtocol: model.source_protocol || "claude",
					targetProtocol: model.target_protocol || "claude",
					supports1m: Boolean(model.to_1m),
					thinking: provider.thinking_effort || "",
				})
			})
		})

		return rows
	}, [config])

	function updateConfig(next: ModelMappingConfig) {
		setConfig(normalizeModelMappingConfig(next))
		onDirtyChange?.(true)
	}

	function updateProvider(index: number, patch: Partial<ModelMappingProvider>) {
		updateConfig({
			providers: config.providers.map((provider, providerIndex) =>
				providerIndex === index ? { ...provider, ...patch } : provider,
			),
		})
	}

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
		const nextProvider = providerToMappingProvider(provider, selectedModels)
		const existingIndex = config.providers.findIndex((item) => item.id === provider.id)
		if (existingIndex >= 0) {
			updateConfig({
				providers: config.providers.map((item, index) => (index === existingIndex ? nextProvider : item)),
			})
			setCollapsedProviders((prev) => ({ ...prev, [providerKey(nextProvider, existingIndex)]: false }))
			toast("已覆盖同一 Provider 的模型映射", "success")
			logger.info(`[模型映射] 覆盖导入 provider：${provider.name} (${provider.id})`)
			return
		}
		updateConfig({ providers: [...config.providers, nextProvider] })
		logger.info(`[模型映射] 新增导入 provider：${provider.name} (${provider.id})`)
	}

	function handleImportProviderConfirm(selectedModels: string[]) {
		if (!importSelectionProvider) return
		importProvider(importSelectionProvider, selectedModels)
		setImportSelectionProvider(null)
	}

	function deleteProvider(index: number) {
		updateConfig({ providers: config.providers.filter((_, providerIndex) => providerIndex !== index) })
	}

	function handleProviderCollapseToggle(provider: ModelMappingProvider, providerIndex: number) {
		const key = providerKey(provider, providerIndex)
		setCollapsedProviders((prev) => ({ ...prev, [key]: !prev[key] }))
	}

	function addModel(providerIndex: number) {
		const provider = config.providers[providerIndex]
		updateProvider(providerIndex, {
			models: [...provider.models, toMappingEntry("")],
		})
	}

	function updateModel(
		providerIndex: number,
		modelIndex: number,
		patch: {
			name?: string
			slot?: string
			display_name?: string
			supported_protocols?: string[]
			source_protocol?: string
			target_protocol?: string
			to_1m?: string
			enabled?: boolean
			protocol?: string
		},
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

	function setProviderProtocol(providerIndex: number, protocol: string) {
		const provider = config.providers[providerIndex]
		const nextProtocol = protocol
		updateProvider(providerIndex, {
			models: provider.models.map((model) => {
				const supported = model.supported_protocols ?? []
				if (supported.length > 0 && !supported.includes(nextProtocol)) {
					return model
				}
				return { ...model, source_protocol: nextProtocol }
			}),
		})
		toast(`已将该 Provider 下支持 ${protocol} 的模型源协议批量更新`, "success")
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
		logger.info("[模型映射] 开始保存配置")
		try {
			const nextStatus = await saveModelMappingConfig(config)
			setStatus(nextStatus)
			onDirtyChange?.(false)
			toast("模型映射配置已保存", "success")
			logger.success("[模型映射] 配置保存成功")
		} catch (error) {
			logger.error(`[模型映射] 配置保存失败：${error instanceof Error ? error.message : String(error)}`)
			toast(error instanceof Error ? error.message : String(error), "error")
		} finally {
			setBusy(null)
		}
	}

	async function handleApply() {
		setBusy("apply")
		logger.info("[模型映射] 开始应用到 Claude")
		try {
			const message = await applyModelMappingToClaude(config)
			const nextStatus = await getModelMappingStatus()
			setStatus(nextStatus)
			onDirtyChange?.(false)
			toast(message, "success")
			logger.success(`[模型映射] 应用成功：${message}`)
		} catch (error) {
			logger.error(`[模型映射] 应用失败：${error instanceof Error ? error.message : String(error)}`)
			toast(error instanceof Error ? error.message : String(error), "error")
		} finally {
			setBusy(null)
		}
	}

	async function handleStartGateway() {
		setBusy("gateway")
		logger.info("[模型映射] 启动代理")
		try {
			const nextStatus = await startModelMappingGateway(config)
			setStatus(nextStatus)
			onDirtyChange?.(false)
			toast("模型映射代理已启动", "success")
			logger.success(`[模型映射] 代理已启动，端口=${nextStatus.port}`)
		} catch (error) {
			logger.error(`[模型映射] 启动代理失败：${error instanceof Error ? error.message : String(error)}`)
			toast(error instanceof Error ? error.message : String(error), "error")
		} finally {
			setBusy(null)
		}
	}

	async function handleStopGateway() {
		setBusy("gateway-stop")
		logger.info("[模型映射] 停止代理")
		try {
			const nextStatus = await stopModelMappingGateway()
			setStatus(nextStatus)
			toast("模型映射代理已停止", "success")
			logger.success("[模型映射] 代理已停止")
		} catch (error) {
			logger.error(`[模型映射] 停止代理失败：${error instanceof Error ? error.message : String(error)}`)
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
			logger.warn("[模型映射] 单模型测试跳过：模型标识缺失")
			return
		}
		const key = modelTestKey(providerIndex, model.id)
		setBusy(`test-${key}`)
		logger.info(
			`[模型映射] 单模型测试：provider=${provider.name}，model=${model.name}，source=${model.source_protocol ?? model.protocol ?? "claude"}`,
		)
		try {
			const result = await testModelMappingProvider({
				target_url: provider.target_url,
				api_key: provider.api_key,
				model: model?.name ?? "",
				protocol: model?.source_protocol ?? model?.protocol,
			})
			setTestResults((prev) => ({ ...prev, [key]: result }))
			toast(result.message, result.ok ? "success" : "error")
			if (result.ok) {
				logger.success(`[模型映射] 单模型测试成功：${model.name} ${result.status ?? ""}`)
			} else {
				logger.warn(`[模型映射] 单模型测试失败：${model.name} ${result.message}`)
			}
		} catch (error) {
			logger.error(`[模型映射] 单模型测试异常：${error instanceof Error ? error.message : String(error)}`)
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
			logger.warn(`[模型映射] 批量测试跳过：provider=${provider.name} 无可测模型`)
			return
		}

		setBusy(`test-all-${providerIndex}`)
		logger.info(`[模型映射] 批量测试开始：provider=${provider.name}，count=${candidates.length}`)
		const collected: Record<string, ModelMappingTestResult> = {}
		let okCount = 0
		let failCount = 0

		try {
			for (const { model } of candidates) {
				if (!model.id) {
					continue
				}
				const key = modelTestKey(providerIndex, model.id)
				try {
					const result = await testModelMappingProvider({
						target_url: provider.target_url,
						api_key: provider.api_key,
						model: model.name,
						protocol: model.source_protocol ?? model.protocol,
					})
					collected[key] = result
					if (result.ok) okCount += 1
					else failCount += 1
				} catch (error) {
					collected[key] = {
						ok: false,
						status: null,
						message: error instanceof Error ? error.message : String(error),
					}
					failCount += 1
				}
			}

			setTestResults((prev) => ({ ...prev, ...collected }))
			toast(`批量测试完成：成功 ${okCount}，失败 ${failCount}`, failCount === 0 ? "success" : "error")
			if (failCount === 0) {
				logger.success(`[模型映射] 批量测试完成：${okCount}/${candidates.length} 成功`)
			} else {
				logger.warn(`[模型映射] 批量测试完成：成功 ${okCount}，失败 ${failCount}`)
			}
		} finally {
			setBusy(null)
		}
	}

	async function handleAutostartToggle() {
		const nextEnabled = !status?.autostart
		setBusy("autostart")
		logger.info(`[模型映射] 切换开机自启：${nextEnabled ? "开启" : "关闭"}`)
		try {
			const enabled = await setModelMappingAutostart(nextEnabled)
			setStatus((prev) => (prev ? { ...prev, autostart: enabled } : prev))
			toast(enabled ? "模型映射已开启开机自启" : "模型映射已关闭开机自启", "success")
			logger.success(`[模型映射] 开机自启已${enabled ? "开启" : "关闭"}`)
		} catch (error) {
			logger.error(`[模型映射] 切换开机自启失败：${error instanceof Error ? error.message : String(error)}`)
			toast(error instanceof Error ? error.message : String(error), "error")
		} finally {
			setBusy(null)
		}
	}

	async function refreshLogs() {
		try {
			const nextLogs = await getModelMappingLogs()
			setLogs(nextLogs)
		} catch (error) {
			logger.error(`[模型映射] 刷新请求日志失败：${error instanceof Error ? error.message : String(error)}`)
		}
	}

	function handleSlotAssignment(slotIndex: number, modelKey: string | "") {
		if (!modelKey) {
			const slotId = DEFAULT_CLAUDE_SLOTS[slotIndex]
			const nextProviders = config.providers.map((provider) => ({
				...provider,
				models: provider.models.map((model) => {
					const currentSlots = getModelSlots(model)
					if (currentSlots.includes(slotId)) {
						const updatedSlots = currentSlots.filter((s) => s !== slotId)
						return {
							...model,
							slot: updatedSlots[0] ?? "",
							slots: updatedSlots,
							// 移除 slot 时不改变 enabled 状态，由用户手动控制
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

		const slotId = DEFAULT_CLAUDE_SLOTS[slotIndex]

		const nextProviders = config.providers.map((provider, pIdx) => ({
			...provider,
			models: provider.models.map((model, mIdx) => {
				const currentSlots = getModelSlots(model)
				if (currentSlots.includes(slotId) && !(pIdx === pi && mIdx === mi)) {
					const updatedSlots = currentSlots.filter((s) => s !== slotId)
					return {
						...model,
						slot: updatedSlots[0] ?? "",
						slots: updatedSlots,
						// 移除 slot 时不改变 enabled 状态，由用户手动控制
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
				正在加载模型映射
			</div>
		)
	}

	return (
		<div className='flex h-full min-h-0 w-full min-w-0 flex-col'>
			<div className='shrink-0 px-6 pb-6'>
				<div className='flex items-start justify-between gap-4'>
					<div>
						<div className='flex items-center gap-2'>
							<h2 className='text-base font-semibold tracking-tight text-white'>CoWork 模型映射</h2>
							<HintTooltip content='把第三方 Anthropic 兼容模型映射成 Claude Desktop 可选择的本地模型槽位。' />
						</div>
						<div className='mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500'>
							<StatusBadge
								status={status?.running ? "success" : "unknown"}
								label={status?.running ? "Gateway 运行中" : "Gateway 未启动"}
							/>
							<span className='rounded-lg border border-gray-800 bg-gray-900 px-2.5 py-1'>
								端口 {status?.port ?? 5678}
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
							应用到 Claude
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
								["slots", "Claude 槽位"],
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
									onSetProtocol={(protocol) => setProviderProtocol(providerIndex, protocol)}
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
					<MappedModelsPanel rows={mappedRows} configPath={status?.config_path} claudeDir={status?.claude_dir} />
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

function SlotMappingPanel({
	config,
	onSlotAssign,
	mappedSlotsCount,
}: {
	config: ModelMappingConfig
	onSlotAssign: (slotIndex: number, modelKey: string | "") => void
	mappedSlotsCount: number
}) {
	const [collapsed, setCollapsed] = useState(false)
	const slottedModelOptions = useMemo(() => {
		const options: Array<{
			key: string
			label: string
			providerName: string
			modelName: string
			slots: string[]
		}> = []
		config.providers.forEach((provider, pi) => {
			provider.models.forEach((model, mi) => {
				if (model.name.trim() && model.enabled) {
					options.push({
						key: `${pi}:${mi}`,
						label: `${provider.name || "未命名"} / ${model.name}`,
						providerName: provider.name || "未命名",
						modelName: model.name,
						slots: getModelSlots(model),
					})
				}
			})
		})
		return options
	}, [config])

	const slotAssignments = useMemo(() => {
		const map = new Map<string, string>()
		config.providers.forEach((provider, pi) => {
			provider.models.forEach((model, mi) => {
				for (const s of getModelSlots(model)) {
					map.set(s, `${pi}:${mi}`)
				}
			})
		})
		return map
	}, [config])

	return (
		<Card>
			<div className='flex items-center justify-between border-b border-border-subtle pb-3 mb-3'>
				<div className='flex items-center gap-2'>
					<button
						onClick={() => setCollapsed((v) => !v)}
						className={BUTTON_ICON_GHOST_SM_CLASS}
						aria-label={collapsed ? "展开槽位映射" : "折叠槽位映射"}>
						{collapsed ? <ChevronRight className='h-3.5 w-3.5' /> : <ChevronDown className='h-3.5 w-3.5' />}
					</button>
					<FileCode2 className='h-4 w-4 text-indigo-400' />
					<h3 className='text-sm font-semibold text-text-heading'>Claude 槽位映射</h3>
					<span className='rounded-lg border border-border-subtle bg-surface-muted px-2 py-0.5 text-[11px] text-text-muted'>
						{mappedSlotsCount} 个槽位已映射
					</span>
				</div>
			</div>
			{!collapsed && (
				<div className='space-y-1 px-2 py-2'>
					{DEFAULT_CLAUDE_SLOTS.map((slotId, slotIndex) => {
						const currentKey = slotAssignments.get(slotId) ?? ""
						const shortSlot = slotId.replace("anthropic/", "")

						return (
							<div key={slotId} className='flex items-center gap-1.5'>
								<div className='flex h-7 w-5 shrink-0 items-center justify-center rounded border border-gray-700 bg-gray-950 text-[10px] font-medium text-gray-500'>
									{slotIndex + 1}
								</div>
								<div className='flex h-7 min-w-0 flex-1 items-center rounded border border-gray-800 bg-gray-950 px-2 font-mono text-[11px] text-indigo-300'>
									<span className='truncate'>{shortSlot}</span>
								</div>
								<span className='shrink-0 text-gray-600 text-xs'>→</span>
								<select
									value={currentKey}
									onChange={(e) => onSlotAssign(slotIndex, e.target.value || "")}
									className={`${FIELD_SELECT_CLASS} h-7 !w-auto flex-1 text-xs`}>
									<option value=''>--</option>
									{slottedModelOptions.map((opt) => (
										<option key={opt.key} value={opt.key}>
											{opt.label}
										</option>
									))}
								</select>
							</div>
						)
					})}
				</div>
			)}
		</Card>
	)
}

function SourceActions({
	providers,
	onImportProvider,
}: {
	providers: Provider[]
	onImportProvider: (provider: Provider) => void
}) {
	const [providerOpen, setProviderOpen] = useState(false)

	return (
		<div className='flex flex-wrap items-center gap-2 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3'>
			<div className='mr-auto'>
				<p className='text-sm font-medium text-gray-200'>服务商来源</p>
				<p className='mt-0.5 text-xs text-gray-600'>从当前 Provider 导入可用模型和协议。</p>
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
							<span className='block truncate text-gray-600'>{provider.baseUrl}</span>
							<span className='mt-1 block text-[11px] text-gray-500'>
								{importableCount > 0 ? `${importableCount} 个可导入模型` : "暂无可导入模型"}
							</span>
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

function ProviderMappingCard({
	provider,
	providerIndex,
	collapsed,
	onToggleCollapse,
	onUpdate,
	onDelete,
	onAddModel,
	onTestAllModels,
	onSetProtocol,
	onSetEnabled,
	onUpdateModel,
	onDeleteModel,
	onTestModel,
	testingAll,
	testingKey,
	actionBusy,
	testResults,
}: {
	provider: ModelMappingProvider
	providerIndex: number
	collapsed: boolean
	onToggleCollapse: () => void
	onUpdate: (patch: Partial<ModelMappingProvider>) => void
	onDelete: () => void
	onAddModel: () => void
	onTestAllModels: () => void
	onSetProtocol: (protocol: string) => void
	onSetEnabled: (enabled: boolean) => void
	onUpdateModel: (
		modelIndex: number,
		patch: {
			name?: string
			slot?: string
			display_name?: string
			supported_protocols?: string[]
			source_protocol?: string
			target_protocol?: string
			to_1m?: string
			enabled?: boolean
			protocol?: string
		},
	) => void
	onDeleteModel: (modelIndex: number) => void
	onTestModel: (modelIndex: number) => void
	testingAll: boolean
	testingKey: string | null
	actionBusy: boolean
	testResults: Record<string, ModelMappingTestResult>
}) {
	const presetModels = getPresetModels(provider.target_url)
	const thinkingOptions = getThinkingOptions(provider.target_url)
	const [showApiKey, setShowApiKey] = useState(false)
	const enabledCount = provider.models.filter((model) => Boolean(model.enabled)).length
	const hasModels = provider.models.length > 0

	return (
		<Card>
			<div className='flex items-center gap-3 border-b border-border-subtle pb-3 mb-4'>
				<button
					onClick={onToggleCollapse}
					className={BUTTON_ICON_GHOST_SM_CLASS}
					aria-label={collapsed ? "展开服务商" : "折叠服务商"}>
					{collapsed ? <ChevronRight className='h-3.5 w-3.5' /> : <ChevronDown className='h-3.5 w-3.5' />}
				</button>
				<div className='flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/25 bg-indigo-500/10 text-indigo-200'>
					<GitBranch className='h-4 w-4' />
				</div>
				<input
					value={provider.name}
					onChange={(event) => onUpdate({ name: event.target.value })}
					className='min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-gray-600'
					placeholder={`服务商 ${providerIndex + 1}`}
				/>
				{collapsed && (
					<span className='shrink-0 rounded-lg border border-gray-800 bg-gray-950 px-2 py-1 text-xs text-gray-500'>
						{provider.models.length} 模型
					</span>
				)}
				<button onClick={onDelete} className={BUTTON_ICON_DANGER_SM_CLASS}>
					<Trash2 className='h-3.5 w-3.5' />
				</button>
			</div>
			{!collapsed && (
				<div className='space-y-3 px-4 py-4'>
					<div className='grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(180px,240px)]'>
						<input
							value={provider.target_url}
							onChange={(event) => onUpdate({ target_url: event.target.value })}
							className={FIELD_MONO_INPUT_CLASS}
							placeholder='API 地址'
						/>
						<select
							value={provider.thinking_effort}
							onChange={(event) => onUpdate({ thinking_effort: event.target.value })}
							className={FIELD_SELECT_CLASS}>
							{thinkingOptions.map((option) => (
								<option key={option || "default"} value={option}>
									推理强度：{THINKING_EFFORT_LABELS[option] ?? option}
								</option>
							))}
						</select>
					</div>
					<div className='relative'>
						<input
							value={provider.api_key}
							onChange={(event) => onUpdate({ api_key: event.target.value })}
							className={`${FIELD_MONO_INPUT_CLASS} pr-11`}
							placeholder='API Key'
							type={showApiKey ? "text" : "password"}
						/>
						<button
							type='button'
							onClick={() => setShowApiKey((value) => !value)}
							className='absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-200'
							aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}>
							{showApiKey ? <EyeOff className='h-3.5 w-3.5' /> : <Eye className='h-3.5 w-3.5' />}
						</button>
					</div>
					<div className='space-y-2'>
						<div className='flex items-center justify-between'>
							<p className='text-xs font-medium uppercase tracking-widest text-gray-500'>模型</p>
							<div className='flex items-center gap-2'>
								<button
									onClick={onTestAllModels}
									disabled={testingAll || actionBusy || !provider.target_url.trim() || !provider.api_key.trim()}
									className={`${BUTTON_GHOST_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
									{testingAll ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <Wifi className='h-3.5 w-3.5' />}
									{testingAll ? "测试中..." : "一键测试"}
								</button>
								<button
									onClick={() => onSetEnabled(true)}
									disabled={actionBusy || !hasModels || enabledCount === provider.models.length}
									className={`${BUTTON_GHOST_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
									<CheckCircle2 className='h-3.5 w-3.5' />
									全部启用
								</button>
								<button
									onClick={() => onSetEnabled(false)}
									disabled={actionBusy || !hasModels || enabledCount === 0}
									className={`${BUTTON_GHOST_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
									<Square className='h-3.5 w-3.5' />
									全部停用
								</button>
								<button
									onClick={() => onSetProtocol("claude")}
									disabled={actionBusy || !hasModels}
									className={`${BUTTON_GHOST_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
									<CircleDot className='h-3.5 w-3.5' />
									全部源协议设为 Claude
								</button>
								<button
									onClick={onAddModel}
									disabled={actionBusy}
									className={`${BUTTON_GHOST_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
									<Plus className='h-3.5 w-3.5' />
									添加模型
								</button>
							</div>
						</div>
						{provider.models.map((model, modelIndex) => {
							const rowKey = model.id || `${providerIndex}-${modelIndex}`
							const resultKey = model.id ? modelTestKey(providerIndex, model.id) : ""
							return (
								<ModelMappingRow
									key={rowKey}
									model={model}
									providerIndex={providerIndex}
									modelIndex={modelIndex}
									presetModels={presetModels}
									testResult={resultKey ? testResults[resultKey] : undefined}
									testing={Boolean(resultKey) && testingKey === `test-${resultKey}`}
									onUpdateModel={onUpdateModel}
									onDeleteModel={onDeleteModel}
									onTestModel={onTestModel}
								/>
							)
						})}
					</div>
				</div>
			)}
		</Card>
	)
}

function ModelMappingRow({
	model,
	providerIndex,
	modelIndex,
	presetModels,
	testResult,
	testing,
	onUpdateModel,
	onDeleteModel,
	onTestModel,
}: {
	model: ModelMappingProvider["models"][number]
	providerIndex: number
	modelIndex: number
	presetModels: readonly string[]
	testResult?: ModelMappingTestResult
	testing: boolean
	onUpdateModel: (
		modelIndex: number,
		patch: {
			name?: string
			slot?: string
			display_name?: string
			supported_protocols?: string[]
			source_protocol?: string
			target_protocol?: string
			to_1m?: string
			enabled?: boolean
			protocol?: string
		},
	) => void
	onDeleteModel: (modelIndex: number) => void
	onTestModel: (modelIndex: number) => void
}) {
	const supportedProtocols = model.supported_protocols ?? []
	const sourceOptions =
		supportedProtocols.length > 0 ? supportedProtocols : ["claude", "openai-chat", "openai-responses", "gemini"]
	const compactFieldClass = "h-9 rounded-md px-2.5 text-xs"
	const compactInputClass = `${FIELD_INPUT_CLASS} ${compactFieldClass}`
	const compactSelectClass = `${FIELD_SELECT_CLASS} ${compactFieldClass}`
	const compactToggleClass = "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap px-1 text-xs"

	const isEnabled = Boolean(model.enabled)

	return (
		<div className={`rounded-md border p-1.5 transition-colors ${isEnabled ? "border-emerald-500/30 bg-emerald-500/5" : "border-gray-800 bg-gray-950/60"}`}>
			<div className='overflow-x-auto'>
				<div className='flex min-w-[800px] items-center gap-1.5'>
					<input
						value={model.name}
						list={`mapping-preset-${providerIndex}-${modelIndex}`}
						onChange={(event) => onUpdateModel(modelIndex, { name: event.target.value })}
						className={`${compactInputClass} min-w-[220px] ${isEnabled ? "border-emerald-500/40 bg-gray-900 text-emerald-200" : ""}`}
						placeholder='真实模型名'
					/>
					{presetModels.length > 0 && (
						<datalist id={`mapping-preset-${providerIndex}-${modelIndex}`}>
							{presetModels.map((presetModel) => (
								<option key={presetModel} value={presetModel} />
							))}
						</datalist>
					)}
					<div className='flex h-9 min-w-[150px] items-center gap-1 overflow-x-auto rounded-md border border-gray-800 bg-gray-950 px-2 py-1'>
						{supportedProtocols.length > 0 ? (
							supportedProtocols.map((protocol) => (
								<span
									key={protocol}
									className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${getModelProtocolBadgeClass(protocol)}`}>
									{getModelProtocolLabel(protocol)}
								</span>
							))
						) : (
							<span className='text-xs text-gray-600'>未检测</span>
						)}
					</div>
					<select
						value={model.source_protocol || model.protocol || "claude"}
						onChange={(event) => onUpdateModel(modelIndex, { source_protocol: event.target.value })}
						className={`${compactSelectClass} min-w-[156px]`}>
						{sourceOptions.map((protocol) => (
							<option key={protocol} value={protocol}>
								源：{getModelProtocolLabel(protocol)}
							</option>
						))}
					</select>
					<select
						value={model.target_protocol || "claude"}
						onChange={(event) => onUpdateModel(modelIndex, { target_protocol: event.target.value })}
						className={`${compactSelectClass} min-w-[156px]`}>
						{MODEL_MAPPING_TARGET_PROTOCOLS.map((protocol) => (
							<option key={protocol} value={protocol}>
								映射：{getModelProtocolLabel(protocol)}
							</option>
						))}
					</select>
					<div className={`${compactToggleClass} min-w-[64px] text-gray-300`}>
						<SelectionCheckbox
							checked={Boolean(model.enabled)}
							onToggle={() => onUpdateModel(modelIndex, { enabled: !Boolean(model.enabled) })}
						/>
						启用
					</div>
					<div className={`${compactToggleClass} min-w-[56px] text-gray-400`}>
						<SelectionCheckbox
							checked={Boolean(model.to_1m)}
							onToggle={() => onUpdateModel(modelIndex, { to_1m: model.to_1m ? "" : "auto" })}
						/>
						1M
					</div>
					<button
						onClick={() => onTestModel(modelIndex)}
						disabled={testing}
						className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS} h-9 min-w-[56px] shrink-0 px-2`}>
						{testing ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <Wifi className='h-3.5 w-3.5' />}
						测试
					</button>
					<button
						onClick={() => onDeleteModel(modelIndex)}
						className={`${BUTTON_ICON_DANGER_SM_CLASS} h-9 w-9 shrink-0 rounded-md`}>
						<Trash2 className='h-3.5 w-3.5' />
					</button>
				</div>
			</div>
			{testResult && (
				<p className={`mt-1 truncate px-1 text-[11px] ${testResult.ok ? "text-emerald-400" : "text-red-300"}`}>
					{testResult.message}
				</p>
			)}
		</div>
	)
}

function MappedModelsPanel({
	rows,
	configPath,
	claudeDir,
}: {
	rows: Array<{
		provider: string
		source: string
		target: string
		displayName: string
		sourceProtocol: string
		targetProtocol: string
		supports1m: boolean
		thinking: string
	}>
	configPath?: string
	claudeDir?: string | null
}) {
	return (
		<Card>
			<div className='flex items-center justify-between border-b border-border-subtle pb-3 mb-3'>
				<div className='flex items-center gap-2'>
					<FileCode2 className='h-4 w-4 text-text-muted' />
					<h3 className='text-sm font-semibold text-text-heading'>Claude 槽位</h3>
				</div>
				{rows.length > 0 && (
					<button
						onClick={() => void navigator.clipboard.writeText(JSON.stringify(rows, null, 2))}
						className={BUTTON_ICON_GHOST_SM_CLASS}>
						<Copy className='h-3.5 w-3.5' />
					</button>
				)}
			</div>
			<div className='max-h-80 overflow-y-auto px-4 py-3'>
				{rows.length === 0 ? (
					<p className='text-xs text-gray-600'>暂无映射模型。</p>
				) : (
					<div className='space-y-2'>
						{rows.map((row) => (
							<div
								key={`${row.source}-${row.target}`}
								className='rounded-lg border border-gray-800 bg-gray-950 px-3 py-2'>
								<div className='flex items-center justify-between gap-2'>
									<p className='truncate font-mono text-xs text-indigo-300'>{row.source}</p>
									{row.supports1m && (
										<span className='rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300'>1M</span>
									)}
								</div>
								<p className='mt-1 truncate text-xs text-gray-400'>{row.displayName}</p>
								<p className='mt-1 truncate text-xs text-gray-500'>{row.target}</p>
								<p className='mt-1 truncate text-[11px] text-gray-600'>
									{getModelProtocolLabel(row.sourceProtocol)} → {getModelProtocolLabel(row.targetProtocol)}
								</p>
								<p className='mt-1 truncate text-[11px] text-gray-700'>{row.provider}</p>
							</div>
						))}
					</div>
				)}
			</div>
			<div className='space-y-2 border-t border-gray-800 px-4 py-3 text-xs text-gray-600'>
				<PathLine label='配置' value={configPath} />
				<PathLine label='Claude' value={claudeDir ?? undefined} />
			</div>
		</Card>
	)
}

function PathLine({ label, value }: { label: string; value?: string }) {
	return (
		<div className='flex min-w-0 items-center gap-2'>
			<span className='w-10 shrink-0 text-gray-700'>{label}</span>
			<span className='min-w-0 flex-1 truncate font-mono'>{value || "-"}</span>
			{value && <CopyButton text={value} />}
		</div>
	)
}

function buildLogSummary(log: ModelMappingLogEntry) {
	const firstNonEmptyLine = (text?: string) =>
		text
			?.split("\n")
			.map((line) => line.trim())
			.find((line) => line.length > 0) ?? ""
	const extractConvertedText = (text?: string) => {
		if (!text?.trim()) return ""
		try {
			const value = JSON.parse(text) as {
				content?: Array<{ text?: string }>
			}
			const converted = value.content
				?.map((item) => item.text?.trim() ?? "")
				.filter(Boolean)
				.join(" ")
			return converted ?? ""
		} catch {
			return ""
		}
	}

	if (log.error_message?.trim()) {
		return {
			text: log.error_message.trim(),
			tone: "error" as const,
		}
	}

	const convertedPreview =
		extractConvertedText(log.converted_response_body) || firstNonEmptyLine(log.converted_response_body)
	if (convertedPreview) {
		return {
			text: convertedPreview,
			tone: "success" as const,
		}
	}

	const rawPreview = firstNonEmptyLine(log.response_body)
	if (rawPreview) {
		return {
			text: rawPreview,
			tone: log.status >= 200 && log.status < 300 ? ("normal" as const) : ("error" as const),
		}
	}

	return {
		text: log.status >= 200 && log.status < 300 ? "请求成功，点击查看详情" : "请求失败，点击查看详情",
		tone: log.status >= 200 && log.status < 300 ? ("normal" as const) : ("error" as const),
	}
}

function LogsPanel({
	logs,
	running,
	onRefresh,
}: {
	logs: ModelMappingLogEntry[]
	running: boolean
	onRefresh: () => void
}) {
	const [selectedLog, setSelectedLog] = useState<ModelMappingLogEntry | null>(null)

	return (
		<Card>
			<div className='flex items-center justify-between border-b border-border-subtle pb-3 mb-3'>
				<div className='flex items-center gap-2'>
					<Activity className={running ? "h-4 w-4 text-emerald-400" : "h-4 w-4 text-text-muted"} />
					<h3 className='text-sm font-semibold text-text-heading'>请求日志</h3>
				</div>
				<button onClick={onRefresh} className={BUTTON_ICON_GHOST_SM_CLASS}>
					<RefreshCw className='h-3.5 w-3.5' />
				</button>
			</div>
			<div className='h-[520px] overflow-y-auto px-4 py-3'>
				{logs.length === 0 ? (
					<p className='text-xs text-gray-600'>暂无请求记录。</p>
				) : (
					<div className='space-y-2'>
						{logs.map((log, index) => {
							const summary = buildLogSummary(log)
							return (
								<button
									key={`${log.time}-${index}`}
									onClick={() => setSelectedLog(log)}
									className='w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-left text-xs transition-colors hover:border-gray-700 hover:bg-gray-900/90'>
									<div className='flex items-center gap-2'>
										<span className='shrink-0 rounded border border-gray-700 bg-gray-900 px-1.5 py-0.5 font-mono text-[11px] text-gray-500'>
											{log.time}
										</span>
										<p
											className='min-w-0 flex-1 truncate text-[13px] text-gray-300'
											title={`${log.model} -> ${log.target_model}`}>
											<span className='font-medium text-gray-200'>{log.model}</span>
											<span className='px-1 text-gray-600'>→</span>
											<span className='text-gray-500'>{log.target_model}</span>
										</p>
										{log.thinking ? (
											<span className='shrink-0 rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300/80'>
												{log.thinking}
											</span>
										) : null}
										<span
											className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[11px] ${
												log.status >= 200 && log.status < 300
													? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
													: "border-red-500/40 bg-red-500/10 text-red-300"
											}`}>
											{log.status}
										</span>
									</div>
									<div className='mt-1 flex items-center gap-2 text-[11px] text-gray-600'>
										{log.source_protocol ? <span>{getModelProtocolLabel(log.source_protocol)}</span> : null}
										{log.target_protocol ? (
											<>
												<span>→</span>
												<span>{getModelProtocolLabel(log.target_protocol)}</span>
											</>
										) : null}
										{log.request_url ? <span className='truncate'>{log.request_url}</span> : null}
									</div>
									<p
										className={`mt-1 truncate text-[11px] ${
											summary.tone === "error"
												? "text-red-300"
												: summary.tone === "success"
													? "text-emerald-300"
													: "text-gray-500"
										}`}
										title={summary.text}>
										{summary.text}
									</p>
								</button>
							)
						})}
					</div>
				)}
			</div>
			{selectedLog ? <LogDetailDialog log={selectedLog} onClose={() => setSelectedLog(null)} /> : null}
		</Card>
	)
}

function LogDetailDialog({ log, onClose }: { log: ModelMappingLogEntry; onClose: () => void }) {
	return (
		<div className='fixed inset-0 z-[96] flex items-center justify-center bg-black/60 px-4'>
			<div className='flex h-[78vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl'>
				<div className='flex items-center justify-between border-b border-gray-800 px-5 py-4'>
					<div className='min-w-0'>
						<p className='truncate text-sm font-semibold text-white'>{log.model}</p>
						<p className='mt-1 truncate text-xs text-gray-500'>
							{log.target_model}
							{log.request_url ? ` · ${log.request_url}` : ""}
						</p>
					</div>
					<button onClick={onClose} className={BUTTON_ICON_GHOST_SM_CLASS}>
						<X className='h-4 w-4' />
					</button>
				</div>

				<div className='grid gap-3 border-b border-gray-800 px-5 py-4 md:grid-cols-4'>
					<DetailStat label='时间' value={log.time} />
					<DetailStat label='状态' value={String(log.status)} />
					<DetailStat
						label='协议'
						value={`${log.source_protocol ? getModelProtocolLabel(log.source_protocol) : "-"} → ${
							log.target_protocol ? getModelProtocolLabel(log.target_protocol) : "-"
						}`}
					/>
					<DetailStat label='Thinking' value={log.thinking || "-"} />
				</div>

				<div className='grid min-h-0 flex-1 gap-4 overflow-hidden p-5 lg:grid-cols-3'>
					<LogDetailBlock title='转发请求' content={log.request_body} copyText={log.request_body} />
					<LogDetailBlock title='上游原始响应' content={log.response_body} copyText={log.response_body} />
					<LogDetailBlock
						title='转换后响应'
						content={log.converted_response_body || log.error_message}
						copyText={log.converted_response_body || log.error_message}
						tone={log.error_message ? "error" : "normal"}
					/>
				</div>
			</div>
		</div>
	)
}

function DetailStat({ label, value }: { label: string; value: string }) {
	return (
		<div className='rounded-lg border border-gray-800 bg-gray-950 px-3 py-2'>
			<p className='text-[11px] uppercase tracking-widest text-gray-600'>{label}</p>
			<p className='mt-1 truncate text-xs text-gray-200'>{value}</p>
		</div>
	)
}

function LogDetailBlock({
	title,
	content,
	copyText,
	tone = "normal",
}: {
	title: string
	content?: string
	copyText?: string
	tone?: "normal" | "error"
}) {
	return (
		<div className='flex min-h-0 flex-col rounded-xl border border-gray-800 bg-gray-950'>
			<div className='flex items-center justify-between border-b border-gray-800 px-4 py-3'>
				<p className='text-sm font-medium text-gray-200'>{title}</p>
				{copyText ? <CopyButton text={copyText} /> : null}
			</div>
			<div className='min-h-0 flex-1 overflow-auto p-4'>
				<pre
					className={`whitespace-pre-wrap break-words font-mono text-xs leading-6 ${
						tone === "error" ? "text-red-200" : "text-gray-300"
					}`}>
					{content?.trim() || "—"}
				</pre>
			</div>
		</div>
	)
}
