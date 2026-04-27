import { Copy, Link2, Loader2 } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { BUTTON_SECONDARY_CLASS, BUTTON_SIZE_XS_CLASS } from "../../../lib/buttonStyles";
import { toast } from "../../../lib/toast";
import { formatInstalls } from "../constants";
import type { LocalizedOnlineSkillDetail, OnlineSkill } from "../../../types";

interface OnlineSkillTooltipProps {
  skill: OnlineSkill;
  localizedOnlineDetail: LocalizedOnlineSkillDetail | undefined;
  onlineDetailLoading: boolean;
  onlineDetailError: string | undefined;
}

export function OnlineSkillTooltip({
  skill,
  localizedOnlineDetail,
  onlineDetailLoading,
  onlineDetailError,
}: OnlineSkillTooltipProps) {
  return (
    <div className="overflow-hidden rounded-2xl">
      <div className="border-b border-gray-800 px-4 py-3">
        <div className="text-sm font-semibold text-white">{skill.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-gray-700 bg-gray-950 px-2 py-0.5 text-[10px] text-gray-400">
            {formatInstalls(skill.installs)}
          </span>
          <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-200">
            {skill.source}
          </span>
        </div>
      </div>
      <div className="max-h-[420px] space-y-4 overflow-y-auto px-4 py-4 text-sm">
        {onlineDetailLoading ? (
          <div className="flex items-center gap-2 text-gray-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在拉取并翻译 skills.sh 在线详情...
          </div>
        ) : localizedOnlineDetail ? (
          <>
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-gray-500">
                中文简介
              </div>
              <div className="mt-1 whitespace-pre-wrap leading-6 text-gray-200">
                {localizedOnlineDetail.localizedSummary}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-gray-500">
                使用提示
              </div>
              <div className="mt-2 space-y-2 text-gray-200">
                {localizedOnlineDetail.localizedUsageHints.map((hint) => (
                  <p
                    key={`${skill.id}-localized-hint-${hint}`}
                    className="whitespace-pre-wrap leading-6"
                  >
                    - {hint}
                  </p>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-gray-500">
                来源信息
              </div>
              <div className="mt-1 space-y-1 text-gray-300">
                <p className="leading-6">
                  skillId: {localizedOnlineDetail.skillId}
                </p>
                <p className="leading-6">
                  source: {localizedOnlineDetail.source}
                </p>
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-gray-500">
                安装命令
              </div>
              <div className="mt-2 rounded-lg border border-gray-800 bg-black/30 px-2.5 py-2 font-mono text-[11px] leading-5 text-gray-300">
                {localizedOnlineDetail.installCommand}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-gray-500">
                快捷操作
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-gray-800 pt-1">
              <button
                onClick={() =>
                  void navigator.clipboard
                    .writeText(localizedOnlineDetail.installCommand)
                    .then(
                      () => toast("命令已复制到剪贴板", "success"),
                      () => toast("复制命令失败", "error"),
                    )
                }
                className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              >
                <Copy className="h-3.5 w-3.5" />
                复制命令
              </button>
              <button
                onClick={() => void openPath(localizedOnlineDetail.pageUrl)}
                className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              >
                <Link2 className="h-3.5 w-3.5" />
                打开详情页
              </button>
            </div>
          </>
        ) : onlineDetailError ? (
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-red-300/80">
              加载失败
            </div>
            <div className="mt-1 whitespace-pre-wrap leading-6 text-red-200">
              {onlineDetailError}
            </div>
          </div>
        ) : (
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-gray-500">
              在线详情
            </div>
            <div className="mt-1 leading-6 text-gray-400">
              悬浮后会自动拉取并翻译线上详情
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
