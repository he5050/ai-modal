import { useState, useEffect } from "react"
import { X, Save, Trash2 } from "lucide-react"
import type { ModelConfigRecord } from "./constants"

interface CustomProviderDialogProps {
	isOpen: boolean
	config: ModelConfigRecord | null
	onClose: () => void
	onSave: (config: {
		id?: string
		name: string
		baseUrl: string
		apiKey: string
		model: string
	}) => Promise<{ success: boolean; action?: "created" | "updated" | "cancelled" }>
	onDelete?: (id: string) => Promise<boolean>
}

export function CustomProviderDialog({ isOpen, config, onClose, onSave, onDelete }: CustomProviderDialogProps) {
	const [name, setName] = useState("")
	const [baseUrl, setBaseUrl] = useState("")
	const [apiKey, setApiKey] = useState("")
	const [model, setModel] = useState("")
	const [saving, setSaving] = useState(false)

	const isEditing = !!config
	const canSave = name.trim() && baseUrl.trim() && apiKey.trim()

	useEffect(() => {
		if (isOpen) {
			setName(config?.name || "")
			setBaseUrl(config?.baseUrl || "")
			setApiKey(config?.apiKey || "")
			setModel(config?.model || "")
		}
	}, [isOpen, config])

	async function handleSave() {
		if (!canSave) return
		setSaving(true)
		try {
			const result = await onSave({
				id: config?.id ?? `custom-provider-${Date.now()}`,
				name: name.trim(),
				baseUrl: baseUrl.trim(),
				apiKey: apiKey.trim(),
				model: model.trim(),
			})
			if (result.success) {
				onClose()
			}
		} finally {
			setSaving(false)
		}
	}

	async function handleDelete() {
		if (!config?.id || !onDelete) return
		const success = await onDelete(config.id)
		if (success) {
			onClose()
		}
	}

	if (!isOpen) return null

	return (
		<div className='fixed inset-0 z-[95] flex items-center justify-center bg-black/60 px-4'>
			<div className='w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl'>
				{/* Header */}
				<div className='flex items-center justify-between'>
					<h3 className='text-base font-semibold tracking-tight text-white'>
						{isEditing ? "编辑自定义 Provider" : "新增自定义 Provider"}
					</h3>
					<button
						onClick={onClose}
						className='flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200'>
						<X className='h-4 w-4' />
					</button>
				</div>

				{/* Body */}
				<div className='mt-5 space-y-4'>
					{/* 名称 */}
					<div className='space-y-1.5'>
						<label className='flex items-center gap-1 text-sm font-medium text-gray-200'>
							名称
							<span className='text-red-400'>*</span>
						</label>
						<input
							type='text'
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder='My Provider'
							className='h-10 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-500 focus:border-indigo-500/80'
						/>
					</div>

					{/* URL */}
					<div className='space-y-1.5'>
						<label className='flex items-center gap-1 text-sm font-medium text-gray-200'>
							API URL
							<span className='text-red-400'>*</span>
						</label>
						<input
							type='text'
							value={baseUrl}
							onChange={(e) => setBaseUrl(e.target.value)}
							placeholder='https://api.example.com/v1'
							className='h-10 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-500 focus:border-indigo-500/80'
						/>
					</div>

					{/* API Key */}
					<div className='space-y-1.5'>
						<label className='flex items-center gap-1 text-sm font-medium text-gray-200'>
							API Key
							<span className='text-red-400'>*</span>
						</label>
						<input
							type='password'
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							placeholder='sk-...'
							className='h-10 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-500 focus:border-indigo-500/80'
						/>
					</div>

					{/* Model */}
					<div className='space-y-1.5'>
						<label className='flex items-center gap-1 text-sm font-medium text-gray-200'>
							模型
							<span className='text-xs text-gray-500'>（选填）</span>
						</label>
						<input
							type='text'
							value={model}
							onChange={(e) => setModel(e.target.value)}
							placeholder='gpt-4o'
							className='h-10 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-500 focus:border-indigo-500/80'
						/>
						<p className='text-xs text-gray-500'>留空时，应用到配置将只修改 URL 和 Key，不修改模型字段</p>
					</div>
				</div>

				{/* Footer */}
				<div className='mt-6 flex items-center justify-between'>
					{isEditing && onDelete ? (
						<button
							onClick={handleDelete}
							disabled={saving}
							className='flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50'>
							<Trash2 className='h-4 w-4' />
							删除
						</button>
					) : (
						<div />
					)}

					<div className='flex items-center gap-2'>
						<button
							onClick={onClose}
							disabled={saving}
							className='rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-gray-700 disabled:opacity-50'>
							取消
						</button>
						<button
							onClick={handleSave}
							disabled={!canSave || saving}
							className='flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition-colors hover:bg-indigo-500 disabled:opacity-50'>
							<Save className='h-4 w-4' />
							{saving ? "保存中..." : "保存"}
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}
