import { useEffect, useState } from "react"
import { logger } from "@/lib/devlog"
import { testModelConfig } from "@/api"
import { loadPersistedJson, savePersistedJson } from "@/lib/persistence"
import { toast } from "@/lib/toast"
import { MODEL_CONFIGS_DB_KEY, MODEL_CONFIGS_KEY } from "./constants"
import type { ModelConfigRecord } from "./constants"
import { createEmptyModelConfig } from "./utils"

export function useModelConfig() {
	const [modelConfigs, setModelConfigs] = useState<ModelConfigRecord[]>([])
	const [savedModelConfigs, setSavedModelConfigs] = useState<ModelConfigRecord[]>([])
	const [selectedModelConfigId, setSelectedModelConfigId] = useState<string>("")
	const [testingModelConfig, setTestingModelConfig] = useState(false)
	const [modelConfigsReady, setModelConfigsReady] = useState(false)

	const selectedModelConfig = modelConfigs.find((item) => item.id === selectedModelConfigId) ?? modelConfigs[0] ?? null

	const modelConfigDirty = JSON.stringify(modelConfigs) !== JSON.stringify(savedModelConfigs)

	// Load from storage on mount
	useEffect(() => {
		let active = true

		async function load() {
			try {
				const raw = await loadPersistedJson<unknown[]>(MODEL_CONFIGS_DB_KEY, MODEL_CONFIGS_KEY, [])
				if (!active) return
				const parsed = Array.isArray(raw)
					? raw
							.filter((item): item is ModelConfigRecord => {
								return item != null && typeof (item as Record<string, unknown>).id === "string"
							})
							.map((item) => ({
								id: item.id,
								name: typeof item.name === "string" ? item.name : typeof item.model === "string" ? item.model : "",
								baseUrl: typeof item.baseUrl === "string" ? item.baseUrl : "",
								apiKey: typeof item.apiKey === "string" ? item.apiKey : "",
								model: typeof item.model === "string" ? item.model : "",
								lastTestResult:
									item.lastTestResult && typeof item.lastTestResult === "object" ? item.lastTestResult : null,
								lastTestAt: typeof item.lastTestAt === "number" ? item.lastTestAt : null,
								isCustom: Boolean(item.isCustom),
								syncedToModels: Boolean(item.syncedToModels),
							}))
					: []
				setModelConfigs(parsed)
				setSavedModelConfigs(parsed)
				setSelectedModelConfigId(parsed[0]?.id ?? "")
			} catch (error) {
				logger.error("Failed to load model configs", error)
				toast("读取模型配置失败", "error")
			} finally {
				if (active) setModelConfigsReady(true)
			}
		}

		void load()
		return () => {
			active = false
		}
	}, [])

	// Auto-select first if current is gone
	useEffect(() => {
		if (modelConfigs.length === 0) {
			setSelectedModelConfigId("")
			return
		}
		const stillExists = modelConfigs.some((item) => item.id === selectedModelConfigId)
		if (!stillExists) {
			setSelectedModelConfigId(modelConfigs[0].id)
		}
	}, [modelConfigs, selectedModelConfigId])

	function updateSelectedModelConfig(patch: Partial<ModelConfigRecord>, targetId = selectedModelConfig?.id) {
		if (!targetId) return
		setModelConfigs((prev) => prev.map((item) => (item.id === targetId ? { ...item, ...patch } : item)))
	}

	function handleCreateModelConfig() {
		const next = createEmptyModelConfig()
		setModelConfigs((prev) => [...prev, next])
		setSelectedModelConfigId(next.id)
	}

	async function handleSaveModelConfig() {
		if (!modelConfigsReady || !selectedModelConfig) return
		await savePersistedJson(MODEL_CONFIGS_DB_KEY, modelConfigs, MODEL_CONFIGS_KEY)
		setSavedModelConfigs(modelConfigs)
		toast("模型配置已保存", "success")
	}

	async function handleDeleteModelConfig() {
		if (!selectedModelConfig) return
		const next = modelConfigs.filter((item) => item.id !== selectedModelConfig.id)
		setModelConfigs(next)
		setSavedModelConfigs(next)
		setSelectedModelConfigId(next[0]?.id ?? "")
		await savePersistedJson(MODEL_CONFIGS_DB_KEY, next, MODEL_CONFIGS_KEY)
		toast("模型配置已删除", "success")
	}

	async function handleImportSelectedAvailableModel(
		selectedAvailableModel: {
			baseUrl: string
			apiKey: string
			model: string
		} | null,
		selectedAvailableProvider: {
			models: { baseUrl: string; apiKey: string; model: string }[]
		} | null,
	) {
		if (!selectedAvailableModel || !selectedAvailableProvider) return
		const next = selectedModelConfig ?? createEmptyModelConfig()
		const exists = modelConfigs.some((item) => item.id === next.id)
		const patch: ModelConfigRecord = {
			...next,
			baseUrl: selectedAvailableModel.baseUrl,
			apiKey: selectedAvailableModel.apiKey,
			model: selectedAvailableModel.model,
		}
		const nextConfigs = exists
			? modelConfigs.map((item) => (item.id === next.id ? patch : item))
			: [...modelConfigs, patch]
		setModelConfigs(nextConfigs)
		setSavedModelConfigs(nextConfigs)
		await savePersistedJson(MODEL_CONFIGS_DB_KEY, nextConfigs, MODEL_CONFIGS_KEY)
		setSelectedModelConfigId(next.id)

		// 更新自定义 Provider 的 syncedToModels 状态
		const customProvider = modelConfigs.find(
			(item) =>
				item.isCustom &&
				item.baseUrl === selectedAvailableModel.baseUrl &&
				item.apiKey === selectedAvailableModel.apiKey,
		)
		if (customProvider) {
			const updatedConfigs = nextConfigs.map((item) =>
				item.id === customProvider.id ? { ...item, syncedToModels: true } : item,
			)
			setModelConfigs(updatedConfigs)
			setSavedModelConfigs(updatedConfigs)
			await savePersistedJson(MODEL_CONFIGS_DB_KEY, updatedConfigs, MODEL_CONFIGS_KEY)
		}
	}

	/**
	 * 保存自定义 Provider 到模型列表
	 * @returns {Promise<{ success: boolean; action?: 'created' | 'updated' | 'cancelled' }>}
	 */
	async function handleSaveCustomProvider(
		config: Omit<ModelConfigRecord, "id" | "lastTestResult" | "lastTestAt"> & { id?: string },
	): Promise<{ success: boolean; action?: "created" | "updated" | "cancelled" }> {
		// 检查是否已存在相同 baseUrl + apiKey 的配置
		const existingByUrlAndKey = modelConfigs.find(
			(item) => item.baseUrl === config.baseUrl && item.apiKey === config.apiKey && item.id !== config.id,
		)

		if (existingByUrlAndKey) {
			const shouldUpdate = confirm(
				`已存在相同 URL 和 API Key 的配置「${existingByUrlAndKey.name || existingByUrlAndKey.model || "未命名"}」，是否更新？`,
			)
			if (!shouldUpdate) {
				return { success: false, action: "cancelled" }
			}
			// 更新现有配置
			const updated: ModelConfigRecord = {
				...existingByUrlAndKey,
				name: config.name || existingByUrlAndKey.name,
				model: config.model || existingByUrlAndKey.model,
				isCustom: true,
			}
			const next = modelConfigs.map((item) => (item.id === existingByUrlAndKey.id ? updated : item))
			setModelConfigs(next)
			await savePersistedJson(MODEL_CONFIGS_DB_KEY, next, MODEL_CONFIGS_KEY)
			setSavedModelConfigs(next)
			toast("自定义 Provider 已更新", "success")
			return { success: true, action: "updated" }
		}

		// 如果是编辑现有配置
		if (config.id) {
			const existing = modelConfigs.find((item) => item.id === config.id)
			if (existing) {
				const updated: ModelConfigRecord = {
					...existing,
					name: config.name,
					baseUrl: config.baseUrl,
					apiKey: config.apiKey,
					model: config.model,
					isCustom: true,
				}
				const next = modelConfigs.map((item) => (item.id === config.id ? updated : item))
				setModelConfigs(next)
				await savePersistedJson(MODEL_CONFIGS_DB_KEY, next, MODEL_CONFIGS_KEY)
				setSavedModelConfigs(next)
				toast("自定义 Provider 已更新", "success")
				return { success: true, action: "updated" }
			}
		}

		// 创建新配置
		const newConfig: ModelConfigRecord = {
			id: `custom-provider-${Date.now()}`,
			name: config.name || config.model || "未命名",
			baseUrl: config.baseUrl,
			apiKey: config.apiKey,
			model: config.model,
			lastTestResult: null,
			lastTestAt: null,
			isCustom: true,
			syncedToModels: false,
		}
		const next = [...modelConfigs, newConfig]
		setModelConfigs(next)
		await savePersistedJson(MODEL_CONFIGS_DB_KEY, next, MODEL_CONFIGS_KEY)
		setSavedModelConfigs(next)
		toast("自定义 Provider 已保存", "success")
		return { success: true, action: "created" }
	}

	/**
	 * 删除自定义 Provider
	 */
	async function handleDeleteCustomProvider(id: string): Promise<boolean> {
		const config = modelConfigs.find((item) => item.id === id)
		if (!config) return false

		const confirmed = confirm(`确定要删除「${config.model || "未命名"}」吗？`)
		if (!confirmed) return false

		const next = modelConfigs.filter((item) => item.id !== id)
		setModelConfigs(next)
		setSavedModelConfigs(next)
		await savePersistedJson(MODEL_CONFIGS_DB_KEY, next, MODEL_CONFIGS_KEY)
		toast("已删除", "success")
		return true
	}

	async function handleTestCurrentModelConfig() {
		if (!selectedModelConfig?.baseUrl || !selectedModelConfig.apiKey || !selectedModelConfig.model) return
		setTestingModelConfig(true)
		try {
			const result = await testModelConfig(
				selectedModelConfig.baseUrl,
				selectedModelConfig.apiKey,
				selectedModelConfig.model,
			)
			updateSelectedModelConfig({
				lastTestResult: result,
				lastTestAt: Date.now(),
			})
			toast(result.available ? "模型配置测试通过" : "模型配置测试失败", result.available ? "success" : "warning")
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			updateSelectedModelConfig({
				lastTestResult: {
					model: selectedModelConfig.model,
					available: false,
					latency_ms: null,
					error: message,
					response_text: message,
				},
				lastTestAt: Date.now(),
			})
			toast(`测试失败：${message}`, "error")
		} finally {
			setTestingModelConfig(false)
		}
	}

	return {
		modelConfigs,
		setModelConfigs,
		savedModelConfigs,
		selectedModelConfig,
		selectedModelConfigId,
		setSelectedModelConfigId,
		modelConfigDirty,
		modelConfigsReady,
		testingModelConfig,
		handleCreateModelConfig,
		handleSaveModelConfig,
		handleDeleteModelConfig,
		handleImportSelectedAvailableModel,
		handleSaveCustomProvider,
		handleDeleteCustomProvider,
		handleTestCurrentModelConfig,
		updateSelectedModelConfig,
	}
}
