import type { SkillEnrichmentRecord, SkillRecord } from "../../../types";

interface SkillCardTooltipProps {
  skill: SkillRecord;
  enrichment: SkillEnrichmentRecord | null;
  displayTags: string[];
}

export function SkillCardTooltip({
  skill,
  enrichment,
  displayTags,
}: SkillCardTooltipProps) {
  return (
    <div className="overflow-hidden rounded-2xl">
      <div className="border-b border-gray-800 px-4 py-3">
        <div className="text-sm font-semibold text-white">{skill.name}</div>
        <div className="mt-1 text-[11px] text-gray-500">{skill.dir}</div>
      </div>
      <div className="max-h-[420px] space-y-4 overflow-y-auto px-4 py-4 text-sm">
        {[
          [
            "完整介绍",
            enrichment?.fullDescription || skill.description || "暂无说明",
          ],
          [
            "内容摘要",
            enrichment?.contentSummary || "暂无摘要",
          ],
          ["用法", enrichment?.usage || "暂无用法说明"],
          [
            "使用场景",
            enrichment?.scenarios || "暂无场景说明",
          ],
        ].map(([label, content]) => (
          <div key={label}>
            <div className="text-[11px] uppercase tracking-[0.16em] text-gray-500">
              {label}
            </div>
            <div className="mt-1 whitespace-pre-wrap leading-6 text-gray-200">
              {content}
            </div>
          </div>
        ))}
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-gray-500">
            功能标签
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {displayTags.length > 0 ? (
              displayTags.map((tag) => (
                <span
                  key={`${skill.dir}-tooltip-${tag}`}
                  className="rounded-full border border-gray-700 bg-gray-950 px-2 py-0.5 text-[10px] text-gray-300"
                >
                  {tag}
                </span>
              ))
            ) : (
              <span className="text-gray-500">暂无标签</span>
            )}
          </div>
        </div>
        {enrichment?.errorMessage && (
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-red-300/80">
              最近失败
            </div>
            <div className="mt-1 whitespace-pre-wrap leading-6 text-red-200">
              {enrichment.errorMessage}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
