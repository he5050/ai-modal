import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { FIELD_MONO_INPUT_CLASS } from "@/lib/formStyles"

interface ApiKeyInputProps {
	value: string
	onChange: (value: string) => void
	placeholder?: string
	disabled?: boolean
}

export function ApiKeyInput({
	value,
	onChange,
	placeholder = "API Key",
	disabled = false,
}: ApiKeyInputProps) {
	const [showApiKey, setShowApiKey] = useState(false)

	return (
		<div className='relative'>
			<input
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={`${FIELD_MONO_INPUT_CLASS} pr-11`}
				placeholder={placeholder}
				type={showApiKey ? "text" : "password"}
				disabled={disabled}
			/>
			<button
				type='button'
				onClick={() => setShowApiKey((v) => !v)}
				disabled={disabled}
				className='absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-200 disabled:opacity-50'>
				{showApiKey ? <EyeOff className='h-3.5 w-3.5' /> : <Eye className='h-3.5 w-3.5' />}
			</button>
		</div>
	)
}
