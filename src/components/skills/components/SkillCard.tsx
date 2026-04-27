import { FolderOpen, Trash2 } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { BUTTON_DANGER_OUTLINE_CLASS, BUTTON_SECONDARY_CLASS, BUTTON_SIZE_XS_CLASS } from "../../../lib/buttonStyles";
import { getSkillEnrichment, getSkillTags, getSkillDescription } from "../../../lib/skillEnrichment";
import { Tooltip } from "../../Tooltip";
import { SkillCardTooltip } from "./SkillCardTooltip";
import { formatUpdatedAt } from "../constants";
import type { SkillEnrichmentRecord, SkillRecord } from "../../../types";

interface SkillCardProps {
  skill: SkillRecord;
  skillEnrichments: Record<string, SkillEnrichmentRecord>;
  commandRunning: boolean;
  onRemove: (skillName: string) => void;
}

export function SkillCard({
  skill,
  skillEnrichments,
  commandRunning,
  onRemove,
}: SkillCardProps) {
  const enrichment = getSkillEnrichment(skill, skillEnrichments);
  const displayTags = getSkillTags(skill, skillEnrichments);
  const displayDescription = getSkillDescription(skill, skillEnrichments);
  const tooltipContent = (
    <SkillCardTooltip
      skill={skill}
      enrichment={enrichment}
      displayTags={displayTags}
    />
  );

  return (
    <div
      key={skill.dir}
      className="rounded-xl border border-gray-800 bg-black/10 px-3 py-3"
    >
      <div className="flex h-full flex-col justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-100">
                {skill.name}
              </p>
              <p className="mt-1 truncate text-[11px] text-gray-500">
                {skill.dir}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => void openPath(skill.path)}
                className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                title="打开技能目录"
                aria-label={`打开 ${skill.name} 目录`}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                打开
              </button>
              <button
                onClick={() => onRemove(skill.name)}
                disabled={commandRunning}
                className={`${BUTTON_DANGER_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                title="移除技能"
                aria-label={`移除 ${skill.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {skill.version && (
              <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-200">
                v{skill.version}
              </span>
            )}
            {skill.internal && (
              <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-gray-400">
                internal
              </span>
            )}
            {displayTags.slice(0, 4).map((category) => (
              <span
                key={category}
                className="rounded-full border border-gray-700 bg-gray-950 px-2 py-0.5 text-[10px] text-gray-400"
              >
                {category}
              </span>
            ))}
            {displayTags.length > 4 && (
              <span className="rounded-full border border-gray-700 bg-gray-950 px-2 py-0.5 text-[10px] text-gray-500">
                +{displayTags.length - 4}
              </span>
            )}
            {enrichment?.status && enrichment.status !== "success" && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  enrichment.status === "error"
                    ? "border border-red-500/30 bg-red-500/10 text-red-200"
                    : enrichment.status === "running"
                      ? "border border-indigo-500/30 bg-indigo-500/10 text-indigo-200"
                      : "border border-gray-700 bg-gray-950 text-gray-400"
                }`}
              >
                {enrichment.status === "running"
                  ? "处理中"
                  : enrichment.status === "error"
                    ? "失败"
                    : enrichment.status}
              </span>
            )}
          </div>
          <Tooltip
            placement="bottom"
            interactive
            contentClassName="w-[560px] max-w-[560px] rounded-2xl border-gray-700 bg-gray-900/98 p-0 shadow-2xl"
            content={tooltipContent}
          >
            <button
              type="button"
              className="mt-3 line-clamp-3 w-full text-left text-xs leading-5 text-gray-400 transition-colors hover:text-gray-200"
              aria-label={`查看 ${skill.name} 的技能详情`}
            >
              {displayDescription}
            </button>
          </Tooltip>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-gray-800 pt-2">
          <div className="flex min-w-0 flex-col">
            <span className="text-[11px] text-gray-500">
              {skill.hasSkillFile ? "含 SKILL.md" : "索引项"}
            </span>
            {skill.updatedAt && (
              <span className="mt-1 text-[10px] text-gray-600">
                更新于 {formatUpdatedAt(skill.updatedAt)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
