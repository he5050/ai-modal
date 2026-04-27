import { RefreshCcw, WandSparkles, X } from "lucide-react";
import { BUTTON_DANGER_OUTLINE_CLASS, BUTTON_SECONDARY_CLASS, BUTTON_SIZE_XS_CLASS } from "../../../lib/buttonStyles";
import { EnrichmentProgress } from "./EnrichmentProgress";
import type { SkillAnnotationMode, SkillEnrichmentRecord } from "../../../types";
import type { LlmProfile } from "../hooks/useLlmProfile";

interface EnrichmentModalProps {
  onClose: () => void;
  selectedLlmProfile: LlmProfile | null;
  availableLlmProfiles: LlmProfile[];
  onSelectLlmProfile: (id: string) => void;
  filteredSkillsCount: number;
  incrementalAnnotationSkillsCount: number;
  enrichmentQueueRunning: boolean;
  enrichmentQueueMessage: string;
  enrichmentQueuePhase: string;
  enrichmentQueueCompleted: number;
  enrichmentQueueTotal: number;
  enrichmentActiveSummary: string;
  nextEnrichmentSeconds: number | null;
  enrichmentQueueError: string | null;
  failedEnrichmentRecords: SkillEnrichmentRecord[];
  enrichmentProgressPercent: number;
  shouldShowEnrichmentQueue: boolean;
  onRunEnrichmentQueue: (mode: SkillAnnotationMode) => void;
  onStopEnrichmentQueue: () => void;
}

export function EnrichmentModal({
  onClose,
  selectedLlmProfile,
  availableLlmProfiles,
  onSelectLlmProfile,
  filteredSkillsCount,
  incrementalAnnotationSkillsCount,
  enrichmentQueueRunning,
  enrichmentQueueMessage,
  enrichmentQueuePhase,
  enrichmentQueueCompleted,
  enrichmentQueueTotal,
  enrichmentActiveSummary,
  nextEnrichmentSeconds,
  enrichmentQueueError,
  failedEnrichmentRecords,
  enrichmentProgressPercent,
  shouldShowEnrichmentQueue,
  onRunEnrichmentQueue,
  onStopEnrichmentQueue,
}: EnrichmentModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-white">技能注解</h3>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              使用系统配置里已保存的 LLM
              参数，对当前筛选范围内的技能做一次中文注解处理。
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 transition-colors hover:text-gray-300"
            aria-label="关闭技能注解弹窗"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-gray-800 bg-black/10 px-4 py-3 text-sm text-gray-300">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">当前 LLM：</span>
            {selectedLlmProfile ? (
              availableLlmProfiles.length > 1 ? (
                <select
                  value={selectedLlmProfile.toolId}
                  onChange={(e) => onSelectLlmProfile(e.target.value)}
                  disabled={enrichmentQueueRunning}
                  className="rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200 outline-none focus:border-indigo-500 disabled:opacity-50"
                >
                  {availableLlmProfiles.map((profile) => (
                    <option key={profile.toolId} value={profile.toolId}>
                      {profile.model} ({profile.requestKind})
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-medium text-gray-100">
                  {selectedLlmProfile.model} ·{" "}
                  {selectedLlmProfile.requestKind}
                </span>
              )
            ) : (
              <span className="text-amber-300">未识别</span>
            )}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            当前筛选技能：{filteredSkillsCount} 个
          </div>
        </div>

        {shouldShowEnrichmentQueue && (
          <EnrichmentProgress
            enrichmentQueueMessage={enrichmentQueueMessage}
            enrichmentQueuePhase={enrichmentQueuePhase}
            enrichmentQueueCompleted={enrichmentQueueCompleted}
            enrichmentQueueTotal={enrichmentQueueTotal}
            enrichmentActiveSummary={enrichmentActiveSummary}
            nextEnrichmentSeconds={nextEnrichmentSeconds}
            enrichmentQueueError={enrichmentQueueError}
            failedEnrichmentRecords={failedEnrichmentRecords}
            enrichmentProgressPercent={enrichmentProgressPercent}
            compact={false}
          />
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <button
            onClick={() => void onRunEnrichmentQueue("full")}
            disabled={
              enrichmentQueueRunning ||
              !selectedLlmProfile ||
              filteredSkillsCount === 0
            }
            className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-left transition-colors hover:border-indigo-400/50 hover:bg-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <WandSparkles className="h-4 w-4 text-indigo-200" />
              全量注解
            </div>
            <p className="mt-2 text-xs leading-6 text-gray-400">
              对当前筛选结果里的 {filteredSkillsCount}{" "}
              个技能全部重新处理一次。
            </p>
          </button>

          <button
            onClick={() => void onRunEnrichmentQueue("incremental")}
            disabled={
              enrichmentQueueRunning ||
              !selectedLlmProfile ||
              incrementalAnnotationSkillsCount === 0
            }
            className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-left transition-colors hover:border-emerald-400/50 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <RefreshCcw className="h-4 w-4 text-emerald-200" />
              增量注解
            </div>
            <p className="mt-2 text-xs leading-6 text-gray-400">
              仅处理未成功注解，或源 skill 已变化的
              {incrementalAnnotationSkillsCount} 个技能。
            </p>
          </button>
        </div>

        <div className="mt-5 flex justify-end">
          {enrichmentQueueRunning ? (
            <button
              onClick={onStopEnrichmentQueue}
              className={`${BUTTON_DANGER_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              <X className="h-4 w-4" />
              停止注解
            </button>
          ) : (
            <button
              onClick={onClose}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              <X className="h-4 w-4" />
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
