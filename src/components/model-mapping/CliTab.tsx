import { useEffect, useState, useMemo } from "react"
import { Copy, Import, Loader2, Terminal, X, ChevronDown } from "lucide-react"
import {
	BUTTON_GHOST_CLASS,
	BUTTON_SECONDARY_CLASS,
	BUTTON_SIZE_XS_CLASS,
	BUTTON_ICON_DANGER_SM_CLASS,
} from "@/lib/buttonStyles"
import { FIELD_MONO_INPUT_CLASS } from "@/lib/formStyles"
import { EmptyState, Card } from "@/components/ui"
import { toast } from "@/lib/toast"
import { logger } from "@/lib/devlog"
import {
	loadCliProxyConfig,
	saveCliProxyConfig,
	startCliProxyService,
	stopCliProxyService,
	testCliProxyConnection,
	getCliProxyStatus,
} from "@/api"
import { ProxyPageHeader, ProxyConfigCard } from "./components"
import type { CliProxyConfig, CliProxyStatus, CliToolConfig, CliToolType, Provider } from "@/types"
import { useProviders } from "@/hooks/useProviders"

export interface CliToolDefinition {
	type: CliToolType
	name: string
	description: string
	defaultPort: number
	defaultApiUrl: string
	defaultProtocol: string
	defaultBasePath: string
	envVars: string[]
	docsUrl: string
}

export const CLI_TOOLS: CliToolDefinition[] = [
	{
		type: "claude-code",
		name: "Claude Code",
		description: "Anthropic 官方 CLI 工具",
		defaultPort: 5679,
		defaultApiUrl: "https://api.anthropic.com",
		defaultProtocol: "claude",
		defaultBasePath: "",
		envVars: ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"],
		docsUrl: "https://docs.anthropic.com/en/docs/claude-code/overview",
	},
	{
		type: "codex",
		name: "Codex CLI",
		description: "OpenAI Codex 命令行工具",
		defaultPort: 5680,
		defaultApiUrl: "https://api.openai.com",
		defaultProtocol: "openai-chat",
		defaultBasePath: "/v1",
		envVars: ["OPENAI_API_KEY", "OPENAI_BASE_URL"],
		docsUrl: "https://github.com/openai/codex",
	},
	{
		type: "gemini-cli",
		name: "Gemini CLI",
		description: "Google Gemini 命令行工具",
		defaultPort: 5681,
		defaultApiUrl: "https://generativelanguage.googleapis.com",
		defaultProtocol: "gemini",
		defaultBasePath: "/v1beta",
		envVars: ["GEMINI_API_KEY", "GEMINI_BASE_URL"],
		docsUrl: "https://github.com/google-gemini/gemini-cli",
	},
	{
		type: "opencode",
		name: "OpenCode",
		description: "开源 AI 编程助手",
		defaultPort: 5682,
		defaultApiUrl: "https://api.openai.com",
		defaultProtocol: "openai-chat",
		defaultBasePath: "/v1",
		envVars: ["OPENAI_API_KEY", "OPENAI_BASE_URL"],
		docsUrl: "https://github.com/opencode-ai/opencode",
	},
	{
		type: "aider",
		name: "Aider",
		description: "AI 配对编程工具",
		defaultPort: 5683,
		defaultApiUrl: "https://api.openai.com",
		defaultProtocol: "openai-chat",
		defaultBasePath: "/v1",
		envVars: ["OPENAI_API_KEY", "OPENAI_BASE_URL"],
		docsUrl: "https://aider.chat/",
	},
]

const createDefaultCliConfig = (type: CliToolType): CliToolConfig => {
	const tool = CLI_TOOLS.find((t) => t.type === type)!
	return {
		id: `${type}-${Date.now()}`,
		type,
		enabled: false,
		apiUrl: tool.defaultApiUrl,
		apiKey: "",
		model: "",
		port: tool.defaultPort,
		customArgs: "",
		protocol: tool.defaultProtocol,
		basePath: tool.defaultBasePath,
	}
}

function getEffectiveBasePath(toolConfig: CliToolConfig): string {
	const bp = toolConfig.basePath?.trim() ?? ""
	if (bp) return bp
	const tool = CLI_TOOLS.find((t) => t.type === toolConfig.type)
	return tool?.defaultBasePath ?? "/v1"
}

function buildLocalBaseUrl(toolConfig: CliToolConfig): string {
	const basePath = getEffectiveBasePath(toolConfig)
	return `http://localhost:${toolConfig.port}${basePath}`
}

interface CliTabProps {
	onDirtyChange?: (dirty: boolean) => void
}

export function CliTab({ onDirtyChange }: CliTabProps) {
	const [config, setConfig] = useState<CliProxyConfig>({ tools: [] })
	const [status, setStatus] = useState<CliProxyStatus | null>(null)
	const [loading, setLoading] = useState(true)
	const [busy, setBusy] = useState<string | null>(null)

	const { providers } = useProviders()
	const [showImportDialog, setShowImportDialog] = useState(false)
	const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
	const [selectedToolsToImport, setSelectedToolsToImport] = useState<CliToolType[]>([])

	useEffect(() => {
		let active = true
		async function bootstrap() {
			logger.info("[CLI 代理] 开始加载配置")
			try {
				const [loadedConfig, loadedStatus] = await Promise.all([loadCliProxyConfig(), getCliProxyStatus()])
				if (!active) return
				setConfig(loadedConfig)
				setStatus(loadedStatus)
				logger.success(`[CLI 代理] 加载完成：tools=${loadedConfig.tools?.length ?? 0}`)
			} catch (error) {
				logger.error(`[CLI 代理] 配置加载失败：${error instanceof Error ? error.message : String(error)}`)
				toast("CLI 代理配置加载失败", "error")
			} finally {
				if (active) setLoading(false)
			}
		}
		void bootstrap()
		return () => {
			active = false
		}
	}, [])

	const handleSave = async () => {
		const ports = config.tools.map((t) => t.port)
		const duplicatePorts = ports.filter((p, i) => ports.indexOf(p) !== i)
		if (duplicatePorts.length > 0) {
			const unique = [...new Set(duplicatePorts)]
			toast(`端口冲突：${unique.join(", ")} 被多个工具使用`, "error")
			return
		}

		setBusy("save")
		logger.info("[CLI 代理] 开始保存配置")
		try {
			const nextStatus = await saveCliProxyConfig(config)
			setStatus(nextStatus)
			onDirtyChange?.(false)
			toast("CLI 代理配置已保存", "success")
			logger.success("[CLI 代理] 配置保存成功")
		} catch (error) {
			logger.error(`[CLI 代理] 配置保存失败：${error instanceof Error ? error.message : String(error)}`)
			toast(error instanceof Error ? error.message : String(error), "error")
		} finally {
			setBusy(null)
		}
	}

	const addCliConfig = (type: CliToolType) => {
		const existing = config.tools.find((c) => c.type === type)
		if (existing) {
			toast("该 CLI 工具已存在配置", "warning")
			return
		}
		const newConfig = createDefaultCliConfig(type)
		setConfig({ tools: [...config.tools, newConfig] })
		onDirtyChange?.(true)
		logger.info(`[CLI 代理] 添加配置：${type}`)
	}

	const updateConfig = (id: string, patch: Partial<CliToolConfig>) => {
		const newTools = config.tools.map((c) => (c.id === id ? { ...c, ...patch } : c))
		setConfig({ tools: newTools })
		onDirtyChange?.(true)
	}

	const deleteConfig = async (id: string) => {
		if (status?.runningTools?.includes(id)) {
			try {
				await handleStopService(id)
			} catch {
				toast("停止服务失败，请手动停止后再删除", "error")
				return
			}
		}
		const newTools = config.tools.filter((c) => c.id !== id)
		setConfig({ tools: newTools })
		onDirtyChange?.(true)
		logger.info(`[CLI 代理] 删除配置：${id}`)
	}

	const handleStartService = async (id: string) => {
		setBusy(`start-${id}`)
		logger.info(`[CLI 代理] 启动服务：${id}`)
		try {
			const nextStatus = await startCliProxyService(id)
			setStatus(nextStatus)
			toast("CLI 代理服务已启动", "success")
			logger.success(`[CLI 代理] 服务已启动：${id}`)
		} catch (error) {
			logger.error(`[CLI 代理] 启动服务失败：${error instanceof Error ? error.message : String(error)}`)
			toast(error instanceof Error ? error.message : String(error), "error")
		} finally {
			setBusy(null)
		}
	}

	const handleStopService = async (id: string) => {
		setBusy(`stop-${id}`)
		logger.info(`[CLI 代理] 停止服务：${id}`)
		try {
			const nextStatus = await stopCliProxyService(id)
			setStatus(nextStatus)
			toast("CLI 代理服务已停止", "success")
			logger.success(`[CLI 代理] 服务已停止：${id}`)
		} catch (error) {
			logger.error(`[CLI 代理] 停止服务失败：${error instanceof Error ? error.message : String(error)}`)
			toast(error instanceof Error ? error.message : String(error), "error")
		} finally {
			setBusy(null)
		}
	}

	const handleTestConnection = async (id: string) => {
		const toolConfig = config.tools.find((c) => c.id === id)
		if (!toolConfig) return

		setBusy(`test-${id}`)
		logger.info(`[CLI 代理] 测试连接：${toolConfig.type}`)
		try {
			const result = await testCliProxyConnection(id)
			toast(result.message, result.ok ? "success" : "error")
			if (result.ok) {
				logger.success(`[CLI 代理] 连接测试成功：${toolConfig.type}`)
			} else {
				logger.warn(`[CLI 代理] 连接测试失败：${toolConfig.type} ${result.message}`)
			}
		} catch (error) {
			logger.error(`[CLI 代理] 连接测试失败：${error instanceof Error ? error.message : String(error)}`)
			toast(error instanceof Error ? error.message : String(error), "error")
		} finally {
			setBusy(null)
		}
	}

	const generateEnvConfig = (toolConfig: CliToolConfig): string => {
		const tool = CLI_TOOLS.find((t) => t.type === toolConfig.type)!
		const lines: string[] = []
		lines.push(`# ${tool.name} 配置`)
		lines.push(`${tool.envVars[0]}=${toolConfig.apiKey}`)
		if (tool.envVars[1]) {
			lines.push(`${tool.envVars[1]}=${buildLocalBaseUrl(toolConfig)}`)
		}
		if (toolConfig.model) {
			lines.push(`# 推荐模型: ${toolConfig.model}`)
		}
		return lines.join("\n")
	}

	const availableTools = CLI_TOOLS.filter((tool) => !config.tools.some((c) => c.type === tool.type))

	// 获取所有可用的模型列表（从已配置的 Provider 中）
	const availableModels = useMemo(() => {
		const models: string[] = []
		providers.forEach((provider) => {
			provider.models?.forEach((model) => {
				if (model.name && !models.includes(model.name)) {
					models.push(model.name)
				}
			})
		})
		return models.sort()
	}, [providers])

	function getImportableToolsFromProvider(provider: Provider): CliToolType[] {
		const importable: CliToolType[] = []
		const baseUrl = provider.baseUrl.toLowerCase()
		const supportedProtocols = (provider as { supportedProtocols?: string[] }).supportedProtocols
		const hasProtocol = (p: string) => supportedProtocols?.some((sp) => sp.toLowerCase().includes(p)) ?? false

		if (baseUrl.includes("anthropic") || hasProtocol("anthropic") || hasProtocol("claude")) {
			importable.push("claude-code")
		}
		if (baseUrl.includes("openai") || hasProtocol("openai") || hasProtocol("openai-chat")) {
			importable.push("codex", "opencode", "aider")
		}
		if (baseUrl.includes("gemini") || baseUrl.includes("google") || hasProtocol("gemini")) {
			importable.push("gemini-cli")
		}

		if (importable.length === 0 && baseUrl.includes("/anthropic")) {
			importable.push("claude-code")
		}
		if (importable.length === 0 && (baseUrl.includes("/v1") || baseUrl.includes("/openai"))) {
			importable.push("codex", "opencode", "aider")
		}

		return importable.filter((type) => !config.tools.some((c) => c.type === type))
	}

	function openImportDialog() {
		setSelectedProvider(null)
		setSelectedToolsToImport([])
		setShowImportDialog(true)
	}

	function handleSelectProvider(provider: Provider) {
		setSelectedProvider(provider)
		const importable = getImportableToolsFromProvider(provider)
		setSelectedToolsToImport(importable)
	}

	function executeImport() {
		if (!selectedProvider || selectedToolsToImport.length === 0) return

		selectedToolsToImport.forEach((type) => {
			const tool = CLI_TOOLS.find((t) => t.type === type)!
			const newConfig: CliToolConfig = {
				id: `${type}-${Date.now()}`,
				type,
				enabled: true,
				apiUrl: selectedProvider.baseUrl,
				apiKey: selectedProvider.apiKey,
				model: "",
				port: tool.defaultPort,
				customArgs: "",
				protocol: tool.defaultProtocol,
				basePath: tool.defaultBasePath,
			}
			setConfig((prev) => ({ tools: [...prev.tools, newConfig] }))
		})

		onDirtyChange?.(true)
		setShowImportDialog(false)
		setSelectedProvider(null)
		setSelectedToolsToImport([])
		toast(`成功导入 ${selectedToolsToImport.length} 个 CLI 工具配置`, "success")
		logger.info(`[CLI 代理] 从 Provider 导入配置: ${selectedProvider.name}, 工具: ${selectedToolsToImport.join(", ")}`)
	}

	function toggleToolSelection(type: CliToolType) {
		setSelectedToolsToImport((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]))
	}

	if (loading) {
		return (
			<div className='flex h-full items-center justify-center text-sm text-gray-500'>
				<Loader2 className='mr-2 h-4 w-4 animate-spin' />
				正在加载 CLI 代理配置
			</div>
		)
	}

	return (
		<div className='flex h-full min-h-0 w-full min-w-0 flex-col'>
			<ProxyPageHeader
				title='CLI 代理配置'
				hint='为各种 AI CLI 工具提供 API 转发代理服务，支持 Claude Code、Codex、Gemini CLI 等。'
				statusLabel={(() => {
					const len = status?.runningTools?.length ?? 0
					return len > 0 ? `${len} 个服务运行中` : "无运行中服务"
				})()}
				statusType={(status?.runningTools?.length ?? 0) > 0 ? "success" : "unknown"}
				countLabel={`${config.tools.length} 个配置`}
				onSave={handleSave}
				saving={busy === "save"}
			/>

			<div className='shrink-0 px-5 pb-4'>
				<div className='flex flex-wrap items-center gap-2'>
					{availableTools.length > 0 &&
						availableTools.map((tool) => (
							<button
								key={tool.type}
								onClick={() => addCliConfig(tool.type)}
								className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
								<Terminal className='h-3.5 w-3.5' />
								添加 {tool.name}
							</button>
						))}
					{providers.length > 0 && (
						<button onClick={openImportDialog} className={`${BUTTON_GHOST_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
							<Import className='h-3.5 w-3.5' />从 Provider 导入
						</button>
					)}
				</div>
			</div>

			<div className='min-h-0 flex-1 overflow-y-auto px-5 pb-5'>
				{config.tools.length === 0 ? (
					<EmptyState
						icon={<Terminal className='h-8 w-8' />}
						title='还没有 CLI 代理配置'
						description='点击上方按钮添加 CLI 工具代理配置。'
					/>
				) : (
					<div className='space-y-4'>
						{config.tools.map((toolConfig) => {
							const tool = CLI_TOOLS.find((t) => t.type === toolConfig.type)!
							const isRunning = status?.runningTools?.includes(toolConfig.id) ?? false
							const isBusy = busy?.includes(toolConfig.id) ?? false

							return (
								<ProxyConfigCard
									key={toolConfig.id}
									title={tool.name}
									description={tool.description}
									icon={<Terminal className='h-4 w-4' />}
									isRunning={isRunning}
									isBusy={isBusy}
									apiUrl={toolConfig.apiUrl}
									apiKey={toolConfig.apiKey}
									port={toolConfig.port}
									model={toolConfig.model}
									enabled={toolConfig.enabled}
									availableModels={availableModels}
									onUpdate={(patch) => updateConfig(toolConfig.id, patch)}
									onDelete={() => void deleteConfig(toolConfig.id)}
									onStart={() => void handleStartService(toolConfig.id)}
									onStop={() => void handleStopService(toolConfig.id)}
									onTest={() => void handleTestConnection(toolConfig.id)}
									extraFields={
										<input
											value={toolConfig.customArgs}
											onChange={(e) => updateConfig(toolConfig.id, { customArgs: e.target.value })}
											className={FIELD_MONO_INPUT_CLASS}
											placeholder='自定义参数 (可选，如: --temperature 0.7)'
											disabled={isBusy}
										/>
									}
									footer={
										<div className='rounded-lg border border-gray-800 bg-gray-950 px-3 py-2'>
											<div className='flex items-center justify-between mb-2'>
												<span className='text-xs text-gray-500'>环境变量</span>
												<button
													onClick={() => {
														navigator.clipboard.writeText(generateEnvConfig(toolConfig))
														toast("环境变量配置已复制", "success")
													}}
													className={`${BUTTON_GHOST_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
													<Copy className='h-3 w-3' />
													复制配置
												</button>
											</div>
											<div className='space-y-1 font-mono text-[11px] text-gray-400'>
												{tool.envVars.map((envVar) => (
													<div key={envVar} className='flex items-center gap-2'>
														<span className='text-emerald-500'>{envVar}</span>
														<span>=</span>
														<span className='truncate text-gray-500'>
															{envVar.includes("KEY") ? "***" : buildLocalBaseUrl(toolConfig)}
														</span>
													</div>
												))}
											</div>
										</div>
									}
								/>
							)
						})}
					</div>
				)}
			</div>

			{showImportDialog && (
				<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'>
					<Card className='w-full max-w-lg'>
						<div className='flex items-center justify-between border-b border-border-subtle p-4'>
							<h3 className='text-sm font-semibold text-white'>从 Provider 导入配置</h3>
							<button onClick={() => setShowImportDialog(false)} className={BUTTON_ICON_DANGER_SM_CLASS}>
								<X className='h-4 w-4' />
							</button>
						</div>

						<div className='p-4'>
							{!selectedProvider ? (
								<div className='space-y-3'>
									<p className='text-xs text-gray-500'>选择一个 Provider 来导入其 API 配置到 CLI 工具：</p>
									<div className='max-h-64 space-y-2 overflow-y-auto'>
										{providers.map((provider) => {
											const importableCount = getImportableToolsFromProvider(provider).length
											return (
												<button
													key={provider.id}
													onClick={() => handleSelectProvider(provider)}
													disabled={importableCount === 0}
													className={`w-full rounded-lg border p-3 text-left transition-colors ${
														importableCount === 0
															? "border-gray-800 bg-gray-900/50 opacity-50 cursor-not-allowed"
															: "border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800"
													}`}>
													<div className='flex items-center justify-between'>
														<div>
															<p className='text-sm font-medium text-white'>{provider.name}</p>
															<p className='text-xs text-gray-500 truncate'>{provider.baseUrl}</p>
														</div>
														{importableCount > 0 ? (
															<span className='rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400'>
																{importableCount} 个可导入
															</span>
														) : (
															<span className='text-xs text-gray-600'>无可用工具</span>
														)}
													</div>
												</button>
											)
										})}
									</div>
								</div>
							) : (
								<div className='space-y-4'>
									<div className='rounded-lg border border-gray-800 bg-gray-900/50 p-3'>
										<p className='text-xs text-gray-500'>已选择 Provider</p>
										<div className='mt-1 flex items-center justify-between'>
											<span className='text-sm font-medium text-white'>{selectedProvider.name}</span>
											<button
												onClick={() => setSelectedProvider(null)}
												className='text-xs text-gray-500 hover:text-gray-300'>
												更换
											</button>
										</div>
									</div>

									<div>
										<p className='mb-2 text-xs text-gray-500'>选择要导入的 CLI 工具：</p>
										<div className='space-y-2'>
											{getImportableToolsFromProvider(selectedProvider).map((type) => {
												const tool = CLI_TOOLS.find((t) => t.type === type)!
												const isSelected = selectedToolsToImport.includes(type)
												return (
													<label
														key={type}
														className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
															isSelected
																? "border-emerald-500/50 bg-emerald-500/10"
																: "border-gray-700 bg-gray-800/30 hover:border-gray-600"
														}`}>
														<input
															type='checkbox'
															checked={isSelected}
															onChange={() => toggleToolSelection(type)}
															className='h-4 w-4 rounded border-gray-600 bg-gray-700 text-emerald-500 focus:ring-emerald-500'
														/>
														<div className='flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 bg-gray-800'>
															<Terminal className='h-4 w-4 text-gray-400' />
														</div>
														<div>
															<p className='text-sm font-medium text-white'>{tool.name}</p>
															<p className='text-xs text-gray-500'>{tool.description}</p>
														</div>
													</label>
												)
											})}
										</div>
									</div>

									<div className='flex justify-end gap-2 pt-2'>
										<button
											onClick={() => setSelectedProvider(null)}
											className={`${BUTTON_GHOST_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
											返回
										</button>
										<button
											onClick={executeImport}
											disabled={selectedToolsToImport.length === 0}
											className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS} ${
												selectedToolsToImport.length === 0 ? "opacity-50 cursor-not-allowed" : ""
											}`}>
											<Import className='h-3.5 w-3.5' />
											导入 {selectedToolsToImport.length > 0 && `(${selectedToolsToImport.length})`}
										</button>
									</div>
								</div>
							)}
						</div>
					</Card>
				</div>
			)}
		</div>
	)
}
