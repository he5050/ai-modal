import { Loader2, Save } from "lucide-react"
import { BUTTON_SECONDARY_CLASS, BUTTON_SIZE_XS_CLASS } from "@/lib/buttonStyles"
import { HintTooltip } from "@/components/HintTooltip"
import { StatusBadge } from "@/components/ui"

interface ProxyPageHeaderProps {
	title: string
	hint: string
	statusLabel: string
	statusType: "success" | "error" | "warning" | "unknown"
	countLabel: string
	onSave: () => void
	saving?: boolean
	extraButtons?: React.ReactNode
}

export function ProxyPageHeader({
	title,
	hint,
	statusLabel,
	statusType,
	countLabel,
	onSave,
	saving = false,
	extraButtons,
}: ProxyPageHeaderProps) {
	return (
		<div className='shrink-0 px-6 pb-6'>
			<div className='flex items-start justify-between gap-4'>
				<div>
					<div className='flex items-center gap-2'>
						<h2 className='text-base font-semibold tracking-tight text-white'>{title}</h2>
						<HintTooltip content={hint} />
					</div>
					<div className='mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500'>
						<StatusBadge status={statusType} label={statusLabel} />
						<span className='rounded-lg border border-gray-800 bg-gray-900 px-2.5 py-1'>{countLabel}</span>
					</div>
				</div>
				<div className='flex flex-wrap justify-end gap-2'>
					{extraButtons}
					<button
						onClick={onSave}
						disabled={saving}
						className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
						{saving ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <Save className='h-3.5 w-3.5' />}
						保存配置
					</button>
				</div>
			</div>
		</div>
	)
}
