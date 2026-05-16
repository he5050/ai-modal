import { CheckCircle2, FilePenLine, Loader2, Plus, Trash2, X } from "lucide-react";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_DANGER_OUTLINE_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "@/lib/buttonStyles";
import type { McpConfig, McpServerConfig, McpServiceTestState } from "@/types";
import { countServerInfo, getServerValidationLabel } from "../utils";

interface McpServerListProps {
  serverEntries: [string, McpServerConfig][];
  serverTests: Record<string, McpServiceTestState>;
  testingCount: number;
  busy: string | null;
  onTest: (name: string, server: McpServerConfig) => void;
  onBatchTest: () => void;
  onEdit: (name: string | null) => void;
  onRemove: (name: string) => void;
}

export function McpServerList({
  serverEntries,
  serverTests,
  testingCount,
  busy,
  onTest,
  onBatchTest,
  onEdit,
  onRemove,
}: McpServerListProps) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/80">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-200">MCP 服务列表</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void onBatchTest()}
            disabled={testingCount > 0}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            {testingCount > 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            一键测试
          </button>
          <button
            onClick={() => onEdit(null)}
            className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            <Plus className="h-3.5 w-3.5" />
            新增服务
          </button>
        </div>
      </div>
      {serverEntries.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-gray-400">当前没有 MCP 服务配置。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {serverEntries.map(([name, server]) => {
            const info = countServerInfo(server);
            const testState = serverTests[name];
            return (
              <div key={name} className="rounded-xl border border-gray-800 bg-black/10 px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-100">{name}</p>
                    <p className="mt-1 truncate text-[11px] text-gray-500">
                      {server.type === "http"
                        ? String(server.url ?? "—")
                        : [server.command, ...(server.args ?? [])].filter(Boolean).join(" ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-[10px] text-gray-400">
                      {server.type ?? "stdio"}
                    </span>
                    {testState?.running ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
                    ) : testState?.checkedAt ? (
                      testState.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-red-400" />
                      )
                    ) : null}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-gray-700 bg-gray-950 px-2 py-0.5 text-[10px] text-gray-400">
                    args {info.args} / env {info.env}
                  </span>
                  {testState?.checkedAt && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        testState.ok
                          ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          : "border border-red-500/30 bg-red-500/10 text-red-200"
                      }`}
                    >
                      {testState.ok ? "可用" : "不可用"}
                      {typeof testState.latency_ms === "number" ? ` · ${testState.latency_ms}ms` : ""}
                    </span>
                  )}
                  {testState?.checkedAt && getServerValidationLabel(server, testState) && (
                    <span className="rounded-full border border-gray-700 bg-gray-950 px-2 py-0.5 text-[10px] text-gray-300">
                      {getServerValidationLabel(server, testState)}
                    </span>
                  )}
                  {!testState?.checkedAt && !testState?.running && (
                    <span className="rounded-full border border-gray-800 bg-gray-900 px-2 py-0.5 text-[10px] text-gray-600">
                      未测试
                    </span>
                  )}
                </div>

                {testState?.checkedAt && testState.message && (
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500">
                    {testState.message}
                    {testState.detail ? `：${testState.detail}` : ""}
                  </p>
                )}

                <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-gray-800 pt-2">
                  <button
                    onClick={() => void onTest(name, server)}
                    disabled={!!testState?.running}
                    className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                    title="测试"
                  >
                    {testState?.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    测试
                  </button>
                  <button onClick={() => onEdit(name)} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`} title="编辑">
                    <FilePenLine className="h-3.5 w-3.5" />
                    编辑
                  </button>
                  <button onClick={() => onRemove(name)} className={`${BUTTON_DANGER_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`} title="删除">
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
