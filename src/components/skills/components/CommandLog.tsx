import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { HintTooltip } from "../../HintTooltip";
import type { SkillsCommandResult } from "../../../types";

interface CommandLogProps {
  commandResult: SkillsCommandResult | null;
  commandWarnings: {
    warningLines: string[];
    remainingLines: string[];
  };
}

export function CommandLog({ commandResult, commandWarnings }: CommandLogProps) {
  const [commandLogExpanded, setCommandLogExpanded] = useState(false);

  return (
    <div className="mt-4 rounded-xl border border-gray-800 bg-black/10 px-4 py-3">
      <button
        onClick={() => setCommandLogExpanded(!commandLogExpanded)}
        className="flex w-full items-center justify-between gap-1.5"
      >
        <div className="flex items-center gap-1.5">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">
            最近命令结果
          </p>
          <HintTooltip content="展示原始 command / stdout / stderr，避免假成功。" />
        </div>
        {commandLogExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        )}
      </button>

      {commandLogExpanded && commandResult && (
        <div className="mt-3 space-y-2">
          <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-xs text-gray-400">
            <div>cwd: {commandResult.cwd || "—"}</div>
            <div className="mt-1 break-all">
              command: {commandResult.command.join(" ")}
            </div>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
            <p className="mb-2 text-xs text-gray-500">stdout</p>
            <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap break-words text-xs text-gray-300">
              {commandResult.stdout || "—"}
            </pre>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
            <p className="mb-2 text-xs text-gray-500">stderr</p>
            <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap break-words text-xs text-gray-300">
              {commandResult.stderr || "—"}
            </pre>
          </div>
        </div>
      )}

      {!commandLogExpanded && commandResult && (
        <div className="mt-2 space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 ${commandResult.success ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border border-red-500/30 bg-red-500/10 text-red-300"}`}
            >
              {commandResult.success ? "成功" : "失败"}
            </span>
            <span className="font-mono text-gray-500">
              {commandResult.command.join(" ")}
            </span>
          </div>
          {commandWarnings.warningLines.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90">
              <div>
                stderr 摘要：包含{" "}
                {commandWarnings.warningLines.length} 条 npm
                配置告警，已折叠。
              </div>
              <div className="mt-1 truncate text-amber-200/70">
                示例：{commandWarnings.warningLines[0]}
              </div>
            </div>
          )}
          {commandWarnings.remainingLines.length > 0 && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] text-red-200/90">
              <div>stderr 摘要：存在非 npm 告警内容。</div>
              <div className="mt-1 truncate text-red-200/70">
                示例：{commandWarnings.remainingLines[0]}
              </div>
            </div>
          )}
        </div>
      )}

      {!commandResult && (
        <div className="mt-3 text-sm text-gray-500">还没有执行记录。</div>
      )}
    </div>
  );
}
