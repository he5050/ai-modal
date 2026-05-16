import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { SkillRecord } from "@/types";
import { useSkillData } from "../hooks/useSkillData";
import { useSkillCommand } from "../hooks/useSkillCommand";
import { useOnlineSearch } from "../hooks/useOnlineSearch";
import { SkillCard } from "./SkillCard";

interface VirtualSkillGridProps {
  skills: SkillRecord[];
  skillEnrichments: ReturnType<typeof useSkillData>["skillEnrichments"];
  commandRunning: ReturnType<typeof useSkillCommand>["commandRunning"];
  onRemove: ReturnType<typeof useOnlineSearch>["confirmRemoveSkill"];
  containerMaxHeight?: number;
}

const VIRTUALIZATION_THRESHOLD = 30;

export function VirtualSkillGrid({
  skills,
  skillEnrichments,
  commandRunning,
  onRemove,
  containerMaxHeight = 540,
}: VirtualSkillGridProps) {
  const shouldUseVirtualization = skills.length > VIRTUALIZATION_THRESHOLD;

  if (skills.length === 0) {
    return (
      <div className="col-span-full rounded-xl border border-dashed border-gray-800 bg-black/10 px-4 py-5 text-sm text-gray-500">
        没有匹配的本地技能。
      </div>
    );
  }

  if (!shouldUseVirtualization) {
    return (
      <div className="mt-4 grid max-h-[540px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-4">
        {skills.map((skill) => (
          <SkillCard
            key={skill.dir}
            skill={skill}
            skillEnrichments={skillEnrichments}
            commandRunning={commandRunning}
            onRemove={onRemove}
          />
        ))}
      </div>
    );
  }

  return <VirtualizedGrid skills={skills} skillEnrichments={skillEnrichments} commandRunning={commandRunning} onRemove={onRemove} containerMaxHeight={containerMaxHeight} />;
}

function VirtualizedGrid({
  skills,
  skillEnrichments,
  commandRunning,
  onRemove,
  containerMaxHeight,
}: VirtualSkillGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: skills.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="mt-4 overflow-y-auto pr-1"
      style={{ maxHeight: `${containerMaxHeight}px` }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        <div
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
          }}
        >
          {virtualItems.map((virtualRow) => {
            const skill = skills[virtualRow.index];
            return (
              <div
                key={skill.dir}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
              >
                <SkillCard
                  skill={skill}
                  skillEnrichments={skillEnrichments}
                  commandRunning={commandRunning}
                  onRemove={onRemove}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}