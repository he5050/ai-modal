import { Check, Copy, Loader2, Upload } from "lucide-react";
import { Tooltip } from "../../Tooltip";
import { OnlineSkillTooltip } from "./OnlineSkillTooltip";
import { formatInstalls } from "../constants";
import type { LocalizedOnlineSkillDetail, OnlineSkill } from "../../../types";

interface OnlineSkillCardProps {
  skill: OnlineSkill;
  localizedOnlineSkillDetails: Record<string, LocalizedOnlineSkillDetail>;
  loadingLocalizedOnlineDetailIds: Set<string>;
  localizedOnlineDetailErrors: Record<string, string>;
  isInstalled: boolean;
  isInstalling: boolean;
  isCopied: boolean;
  commandRunning: boolean;
  onInstall: (skill: OnlineSkill) => void;
  onCopyCommand: (skill: OnlineSkill) => void;
  onFetchDetail: (skill: OnlineSkill) => void;
}

export function OnlineSkillCard({
  skill,
  localizedOnlineSkillDetails,
  loadingLocalizedOnlineDetailIds,
  localizedOnlineDetailErrors,
  isInstalled,
  isInstalling,
  isCopied,
  commandRunning,
  onInstall,
  onCopyCommand,
  onFetchDetail,
}: OnlineSkillCardProps) {
  const localizedOnlineDetail = localizedOnlineSkillDetails[skill.id];
  const onlineDetailLoading = loadingLocalizedOnlineDetailIds.has(skill.id);
  const onlineDetailError = localizedOnlineDetailErrors[skill.id];

  const tooltipContent = (
    <OnlineSkillTooltip
      skill={skill}
      localizedOnlineDetail={localizedOnlineDetail}
      onlineDetailLoading={onlineDetailLoading}
      onlineDetailError={onlineDetailError}
    />
  );

  return (
    <div
      key={skill.id}
      className="rounded-xl border border-gray-800 bg-black/10 px-3 py-2.5"
    >
      {/* Progress message */}
      {isInstalling && (
        <div className="mb-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-2 py-1 text-[10px] text-indigo-200">
          安装中...
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <Tooltip
          placement="bottom"
          interactive
          contentClassName="w-[560px] max-w-[560px] rounded-2xl border-gray-700 bg-gray-900/98 p-0 shadow-2xl"
          content={tooltipContent}
        >
          <button
            type="button"
            onMouseEnter={() => void onFetchDetail(skill)}
            className="min-w-0 flex-1 text-left"
            aria-label={`查看 ${skill.name} 在线详情`}
          >
            <p className="truncate text-sm font-medium text-gray-100 transition-colors hover:text-white">
              {skill.name}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-[10px] text-gray-400">
                {formatInstalls(skill.installs)}
              </span>
              <span className="truncate rounded-full border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-200">
                {skill.source}
              </span>
            </div>
          </button>
        </Tooltip>

        {/* Action buttons */}
        <div className="flex flex-shrink-0 flex-col gap-1">
          {isInstalled ? (
            <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">
              <Check className="h-3 w-3" />
              已安装
            </span>
          ) : (
            <>
              <button
                onClick={() => onInstall(skill)}
                disabled={commandRunning || isInstalling}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-200 transition-colors hover:border-indigo-400/50 hover:text-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isInstalling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                {isInstalling ? "安装中" : "安装"}
              </button>
              <button
                onClick={() => onCopyCommand(skill)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 px-2 py-1 text-[10px] text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
                title="复制安装命令"
              >
                {isCopied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-400">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    命令
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
