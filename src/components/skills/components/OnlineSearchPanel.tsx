import { Search, Loader2 } from "lucide-react";
import { FIELD_MONO_INPUT_CLASS } from "../../../lib/formStyles";
import { OnlineSkillCard } from "./OnlineSkillCard";
import type { LocalizedOnlineSkillDetail, OnlineSkill } from "../../../types";

interface OnlineSearchPanelProps {
  searchQuery: string;
  loadingSearch: boolean;
  searchDuration: number | null;
  searched: boolean;
  searchResults: OnlineSkill[];
  localizedOnlineSkillDetails: Record<string, LocalizedOnlineSkillDetail>;
  loadingLocalizedOnlineDetailIds: Set<string>;
  localizedOnlineDetailErrors: Record<string, string>;
  installingOnlineSkillIds: Set<string>;
  copiedSkillIds: Set<string>;
  commandRunning: boolean;
  onSearch: (query: string) => void;
  onInstallOnlineSkill: (skill: OnlineSkill) => void;
  onCopyInstallCommand: (skill: OnlineSkill) => void;
  onEnsureLocalizedOnlineSkillDetail: (skill: OnlineSkill) => void;
}

export function OnlineSearchPanel({
  searchQuery,
  loadingSearch,
  searchDuration,
  searched,
  searchResults,
  localizedOnlineSkillDetails,
  loadingLocalizedOnlineDetailIds,
  localizedOnlineDetailErrors,
  installingOnlineSkillIds,
  copiedSkillIds,
  commandRunning,
  onSearch,
  onInstallOnlineSkill,
  onCopyInstallCommand,
  onEnsureLocalizedOnlineSkillDetail,
}: OnlineSearchPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="搜索 skills.sh 上的技能..."
            className={`${FIELD_MONO_INPUT_CLASS} pl-9`}
          />
        </div>
        {loadingSearch && (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        )}
      </div>

      {searchDuration !== null && (
        <p className="text-xs text-gray-500">
          {searchResults.length} 个结果 ({searchDuration}ms)
        </p>
      )}

      {!loadingSearch && searched && searchResults.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {searchResults.map((skill) => (
            <OnlineSkillCard
              key={skill.id}
              skill={skill}
              localizedOnlineSkillDetails={localizedOnlineSkillDetails}
              loadingLocalizedOnlineDetailIds={loadingLocalizedOnlineDetailIds}
              localizedOnlineDetailErrors={localizedOnlineDetailErrors}
              isInstalled={false}
              isInstalling={installingOnlineSkillIds.has(skill.skillId)}
              isCopied={copiedSkillIds.has(skill.skillId)}
              commandRunning={commandRunning}
              onInstall={onInstallOnlineSkill}
              onCopyCommand={onCopyInstallCommand}
              onFetchDetail={onEnsureLocalizedOnlineSkillDetail}
            />
          ))}
        </div>
      )}

      {!loadingSearch && searched && searchResults.length === 0 && (
        <p className="text-xs text-gray-500">未找到匹配的技能</p>
      )}

      {!loadingSearch && !searched && (
        <p className="text-xs text-gray-500">
          输入关键词搜索 skills.sh 上的所有技能
        </p>
      )}
    </div>
  );
}
