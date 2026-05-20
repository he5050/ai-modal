import { Loader2, Play, Square, Trash2, Wifi } from "lucide-react"
import {
	BUTTON_ICON_DANGER_SM_CLASS,
	BUTTON_PRIMARY_CLASS,
	BUTTON_SECONDARY_CLASS,
	BUTTON_SIZE_XS_CLASS,
} from "@/lib/buttonStyles"
import { FIELD_MONO_INPUT_CLASS } from "@/lib/formStyles"
import { Card, StatusBadge } from "@/components/ui"
import { ApiKeyInput } from "./ApiKeyInput"

interface ProxyConfigCardProps {
	title: string
	description?: string
	icon: React.ReactNode
	iconColorClass?: string
	isRunning: boolean
	isBusy: boolean
	apiUrl: string
	apiKey: string
	port: number
	model?: string
	enabled: boolean
	onUpdate: (patch: { apiUrl?: string; apiKey?: string; port?: number; model?: string; enabled?: boolean; customArgs?: string }) => void
	onDelete: () => void
	onStart: () => void
	onStop: () => void
	onTest: () => void
	extraFields?: React.ReactNode
	footer?: React.ReactNode
}

export function ProxyConfigCard({
	title,
	description,
	icon,
	iconColorClass = "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
	isRunning,
	isBusy,
	apiUrl,
	apiKey,
	port,
	model = "",
	enabled,
	onUpdate,
	onDelete,
	onStart,
	onStop,
	onTest,
	extraFields,
	footer,
}: ProxyConfigCardProps) {
	return (
		<Card>
			<div className='flex items-center gap-3 border-b border-border-subtle pb-3 mb-4'>
				<div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${iconColorClass}`}>
					{icon}
				</div>
				<div className='min-w-0 flex-1'>
					<h3 className='text-sm font-semibold text-white'>{title}</h3>
					{description && <p className='text-xs text-gray-500'>{description}</p>}
				</div>
				<StatusBadge status={isRunning ? "success" : "unknown"} label={isRunning ? "运行中" : "未启动"} />
				<button onClick={onDelete} disabled={isBusy} className={BUTTON_ICON_DANGER_SM_CLASS}>
					<Trash2 className='h-3.5 w-3.5' />
				</button>
			</div>

			<div className='space-y-3 px-4 py-4'>
				{/* 启用开关 */}
				<div className='flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950 px-3 py-2'>
					<span className='text-sm text-gray-300'>启用代理</span>
					<label className='relative inline-flex cursor-pointer items-center'>
						<input
							type='checkbox'
							checked={enabled}
							onChange={(e) => onUpdate({ enabled: e.target.checked })}
							disabled={isBusy}
							className='peer sr-only'
						/>
						<div className="h-5 w-9 rounded-full bg-gray-700 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-emerald-500 peer-checked:after:translate-x-4" />
					</label>
				</div>

				{/* API 配置 */}
				<div className='grid gap-3 lg:grid-cols-2'>
					<input
						value={apiUrl}
						onChange={(e) => onUpdate({ apiUrl: e.target.value })}
						className={FIELD_MONO_INPUT_CLASS}
						placeholder='API 地址'
						disabled={isBusy}
					/>
					<input
						value={model}
						onChange={(e) => onUpdate({ model: e.target.value })}
						className={FIELD_MONO_INPUT_CLASS}
						placeholder='模型名称 (可选)'
						disabled={isBusy}
					/>
				</div>

				{/* API Key */}
				<ApiKeyInput
					value={apiKey}
					onChange={(value) => onUpdate({ apiKey: value })}
					disabled={isBusy}
				/>

				{/* 端口配置 */}
				<div className='grid gap-3 lg:grid-cols-2'>
					<div className='flex items-center gap-2'>
						<span className='text-xs text-gray-500 w-12'>代理端口</span>
						<input
							type='number'
							value={port}
							onChange={(e) => onUpdate({ port: parseInt(e.target.value) || 0 })}
							className={`${FIELD_MONO_INPUT_CLASS} flex-1`}
							disabled={isBusy}
						/>
					</div>
					<div className='flex items-center gap-2'>
						<span className='text-xs text-gray-500 w-12'>代理地址</span>
						<code className='flex-1 rounded-md border border-gray-800 bg-gray-950 px-2.5 py-2 text-xs font-mono text-emerald-300'>
							http://localhost:{port}
						</code>
					</div>
				</div>

				{/* 额外字段 */}
				{extraFields}

				{/* 底部内容 */}
				{footer}

				{/* 操作按钮 */}
				<div className='flex items-center gap-2 pt-2'>
					<button
						onClick={onTest}
						disabled={isBusy || !apiKey.trim()}
						className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
						{isBusy ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <Wifi className='h-3.5 w-3.5' />}
						测试连接
					</button>
					<button
						onClick={onStart}
						disabled={isBusy || isRunning || !enabled}
						className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
						{isBusy ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <Play className='h-3.5 w-3.5' />}
						启动代理
					</button>
					<button
						onClick={onStop}
						disabled={isBusy || !isRunning}
						className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
						{isBusy ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <Square className='h-3.5 w-3.5' />}
						停止代理
					</button>
				</div>
			</div>
		</Card>
	)
}
