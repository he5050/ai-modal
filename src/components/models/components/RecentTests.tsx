import { HintTooltip } from "../../HintTooltip";
import { Tooltip } from "../../Tooltip";
import {
  BUTTON_ICON_DANGER_SM_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "@/lib/buttonStyles";
import { Trash2, ArrowRight } from "lucide-react";
import type { Provider } from "@/types";
import { RECENT_PAGE_SIZE } from "@/constants";
import { maskPreviewText } from "../utils";
import type { DetectFormState } from "@/hooks/useDetectForm";

interface RecentTestsProps {
  providers: Provider[];
  recentPage: number;
  recentTotalPages: number;
  form: DetectFormState;
  onOpenModels: () => void;
  onPageChange: (page: number) => void;
  onDeleteClick: (id: string) => void;
  onLoadHistory: (provider: Provider) => void;
}

export function RecentTests({
  providers,
  recentPage,
  recentTotalPages,
  form,
  onOpenModels,
  onPageChange,
  onDeleteClick,
  onLoadHistory,
}: RecentTestsProps) {
  const recentProviders = [...providers].sort(
    (a, b) =>
      (b.lastResult?.timestamp ?? b.createdAt) -
      (a.lastResult?.timestamp ?? a.createdAt),
  );

  const pagedRecentProviders = recentProviders.slice(
    (recentPage - 1) * RECENT_PAGE_SIZE,
    recentPage * RECENT_PAGE_SIZE,
  );

  if (recentProviders.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-medium uppercase tracking-widest text-gray-500">
            最近使用接口
          </h3>
          <HintTooltip content="展示全部记录，按最近时间倒序；本地分页为每页 20 条。" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">共 {recentProviders.length} 条</span>
          <button
            onClick={onOpenModels}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            <ArrowRight className="h-3.5 w-3.5" />
            查看全部接口管理
          </button>
        </div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="w-12 px-4 py-2.5 text-left text-xs text-gray-400">#</th>
              <th className="w-[76px] px-4 py-2.5 text-left text-xs text-gray-400">状态</th>
              <th className="w-[24%] px-4 py-2.5 text-left text-xs text-gray-400">名称</th>
              <th className="w-[28%] px-4 py-2.5 text-left text-xs text-gray-400">Base URL</th>
              <th className="w-[140px] px-4 py-2.5 text-left text-xs text-gray-400">上次检测</th>
              <th className="w-[72px] px-4 py-2.5 text-center text-xs text-gray-400">操作</th>
            </tr>
          </thead>
          <tbody>
            {pagedRecentProviders.map((p, i) => {
              const results = p.lastResult?.results ?? [];
              const hasTested = results.length > 0;
              const hasAvailable = results.some((r) => r.available);
              return (
                <tr
                  key={p.id}
                  className={`hover:bg-gray-800/30 transition-colors cursor-pointer ${i < pagedRecentProviders.length - 1 ? "border-b border-gray-800/50" : ""}`}
                  onClick={() => onLoadHistory(p)}
                >
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {(recentPage - 1) * RECENT_PAGE_SIZE + i + 1}
                  </td>
                  <td className="px-4 py-2">
                    {!hasTested ? (
                      <Tooltip content="未检测" placement="top">
                        <span className="w-2 h-2 rounded-full bg-gray-600 inline-block cursor-default" />
                      </Tooltip>
                    ) : hasAvailable ? (
                      <Tooltip content="可用" placement="top">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block cursor-default" />
                      </Tooltip>
                    ) : (
                      <Tooltip content="不可用" placement="top">
                        <span className="w-2 h-2 rounded-full bg-red-400 inline-block cursor-default" />
                      </Tooltip>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-200 text-sm font-medium">{p.name}</span>
                      {i === 0 && p.lastResult && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400">最新</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <Tooltip content={p.baseUrl} placement="top">
                      <span className="font-mono text-xs text-gray-400 truncate max-w-[200px] block cursor-default">
                        {maskPreviewText(p.baseUrl)}
                      </span>
                    </Tooltip>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {p.lastResult
                      ? new Date(p.lastResult.timestamp).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-center">
                      <Tooltip content="删除接口" placement="top">
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteClick(p.id); }}
                          className={BUTTON_ICON_DANGER_SM_CLASS}
                          aria-label="删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {recentProviders.length > RECENT_PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">
            第 {recentPage} / {recentTotalPages} 页，每页 {RECENT_PAGE_SIZE} 条
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => onPageChange(1)} disabled={recentPage === 1} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>首页</button>
            <button onClick={() => onPageChange(Math.max(1, recentPage - 1))} disabled={recentPage === 1} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>上一页</button>
            <span className="text-xs text-gray-500">{recentPage} / {recentTotalPages}</span>
            <button onClick={() => onPageChange(Math.min(recentTotalPages, recentPage + 1))} disabled={recentPage === recentTotalPages} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>下一页</button>
            <button onClick={() => onPageChange(recentTotalPages)} disabled={recentPage === recentTotalPages} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>末页</button>
          </div>
        </div>
      )}
    </div>
  );
}
