import type { SkillEnrichmentRecord } from "../../../types";

interface EnrichmentProgressProps {
  enrichmentQueueMessage: string;
  enrichmentQueuePhase: string;
  enrichmentQueueCompleted: number;
  enrichmentQueueTotal: number;
  enrichmentActiveSummary: string;
  nextEnrichmentSeconds: number | null;
  enrichmentQueueError: string | null;
  failedEnrichmentRecords: SkillEnrichmentRecord[];
  enrichmentProgressPercent: number;
  compact?: boolean;
}

export function EnrichmentProgress({
  enrichmentQueueMessage,
  enrichmentQueuePhase,
  enrichmentQueueCompleted,
  enrichmentQueueTotal,
  enrichmentActiveSummary,
  nextEnrichmentSeconds,
  enrichmentQueueError,
  failedEnrichmentRecords,
  enrichmentProgressPercent,
  compact = false,
}: EnrichmentProgressProps) {
  return (
    <div
      className={`rounded-xl border border-indigo-500/20 bg-indigo-500/5 ${compact ? "px-3 py-2 text-xs" : "px-4 py-4"}`}
    >
      {compact ? (
        <>
          <div className="text-indigo-100">
            {enrichmentQueueMessage || "技能富化队列运行中"}
          </div>
          <div className="mt-1 text-indigo-200/70">
            {enrichmentQueueCompleted}/{enrichmentQueueTotal}
            {enrichmentActiveSummary}
            {enrichmentQueuePhase === "waiting" &&
            nextEnrichmentSeconds != null
              ? ` · ${nextEnrichmentSeconds}s 后继续`
              : ""}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-indigo-100">
              {enrichmentQueueMessage || "技能注解任务运行中"}
            </div>
            <div className="mt-1 text-xs text-indigo-200/75">
              {enrichmentQueueCompleted}/{enrichmentQueueTotal}
              {enrichmentActiveSummary}
              {enrichmentQueuePhase === "waiting" &&
              nextEnrichmentSeconds != null
                ? ` · ${nextEnrichmentSeconds}s 后继续`
                : ""}
            </div>
          </div>
          <span className="rounded-full border border-indigo-400/20 bg-indigo-400/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-indigo-100/80">
            {enrichmentQueuePhase}
          </span>
        </div>
      )}

      {!compact && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-gray-800/80">
            <div
              className="h-full rounded-full bg-indigo-400 transition-[width] duration-200 ease-out"
              style={{ width: `${enrichmentProgressPercent}%` }}
              role="progressbar"
              aria-label="技能注解进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={enrichmentProgressPercent}
            />
          </div>
        </div>
      )}

      {(enrichmentQueueError || failedEnrichmentRecords.length > 0) && (
        <div className={`mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-3 text-xs leading-6 text-red-100 ${compact ? "" : ""}`}>
          {enrichmentQueueError && (
            <>
              <div className="font-medium text-red-200">失败摘要</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-red-100/90">
                {enrichmentQueueError}
              </div>
            </>
          )}
          {failedEnrichmentRecords.length > 0 && (
            <div
              className={
                enrichmentQueueError
                  ? "mt-3 border-t border-red-400/15 pt-3"
                  : ""
              }
            >
              <div className="font-medium text-red-200">
                失败技能列表（{failedEnrichmentRecords.length}）
              </div>
              <div className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                {failedEnrichmentRecords.map((record) => (
                  <div
                    key={record.skillDir}
                    className="rounded-lg border border-red-400/10 bg-black/10 px-3 py-2"
                  >
                    <div className="font-medium text-red-100">
                      {record.skillDir}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap break-words text-red-100/85">
                      {record.errorMessage || "未知失败原因"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
