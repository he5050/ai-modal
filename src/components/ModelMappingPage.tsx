import { useState } from "react"
import { ACTION_GROUP_BUTTON_ACTIVE_CLASS, ACTION_GROUP_BUTTON_BASE_CLASS, ACTION_GROUP_BUTTON_INACTIVE_CLASS, ACTION_GROUP_WRAPPER_CLASS } from "@/lib/actionGroupStyles"
import { CoWorkTab } from "./model-mapping/CoWorkTab"
import { CliTab } from "./model-mapping/CliTab"
import { CodexTab } from "./model-mapping/CodexTab"
import type { Provider } from "@/types"

interface Props {
	providers: Provider[]
	onDirtyChange?: (dirty: boolean) => void
}

type MainTab = "cowork" | "codex" | "cli"

export function ModelMappingPage({ providers, onDirtyChange }: Props) {
	const [selectedTab, setSelectedTab] = useState<MainTab>("cowork")

	return (
		<div className='flex h-full min-h-0 w-full min-w-0 flex-col'>
			<div className='shrink-0 px-5 pb-4'>
				<div className='flex items-center justify-end'>
					<div className={ACTION_GROUP_WRAPPER_CLASS}>
						{(
						[
							["cowork", "CoWork"],
							["codex", "Codex"],
							["cli", "Cli"],
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

			<div className='min-h-0 flex-1 overflow-hidden'>
				{selectedTab === "cowork" && <CoWorkTab providers={providers} onDirtyChange={onDirtyChange} />}
				{selectedTab === "codex" && <CodexTab providers={providers} onDirtyChange={onDirtyChange} />}
				{selectedTab === "cli" && <CliTab onDirtyChange={onDirtyChange} />}
			</div>
		</div>
	)
}
