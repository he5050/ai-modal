import { useState } from "react";
import { BUTTON_ICON_SM_CLASS } from "../lib/buttonStyles";
import { savePersistedJson } from "../lib/persistence";
import { HintTooltip } from "./HintTooltip";
import { ModelConfigSection } from "./ModelConfigSection";
import { toast } from "../lib/toast";
import type { Provider } from "../types";

export const DEBUG_KEY = "ai-modal-debug";
export const DEBUG_DB_KEY = "debug_enabled";
export const CONCURRENCY_KEY = "ai-modal-concurrency";
export const CONCURRENCY_DB_KEY = "concurrency";
const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 20;

export function getConcurrency(): number {
  const v = parseInt(localStorage.getItem(CONCURRENCY_KEY) ?? "", 10);
  return isNaN(v)
    ? DEFAULT_CONCURRENCY
    : Math.min(Math.max(1, v), MAX_CONCURRENCY);
}

interface Props {
  providers: Provider[];
  debugEnabled: boolean;
  onDebugChange: (v: boolean) => void;
  onDirtyChange?: (v: boolean) => void;
}

export function SettingsPage({
  providers,
  debugEnabled,
  onDebugChange,
  onDirtyChange,
}: Props) {
  const [concurrency, setConcurrency] = useState<number>(getConcurrency);

  async function handleToggle() {
    const next = !debugEnabled;
    try {
      await savePersistedJson(DEBUG_DB_KEY, next, DEBUG_KEY);
      localStorage.setItem(DEBUG_KEY, String(next));
      onDebugChange(next);
      toast(next ? "Debug 模式已开启" : "Debug 模式已关闭", "success");
    } catch (error) {
      console.error("Failed to update debug mode", error);
      toast("Debug 模式更新失败", "error");
    }
  }

  async function handleConcurrencyChange(v: number) {
    if (v === concurrency) return;
    try {
      await savePersistedJson(CONCURRENCY_DB_KEY, v, CONCURRENCY_KEY);
      setConcurrency(v);
      localStorage.setItem(CONCURRENCY_KEY, String(v));
      toast(`检测并发数已更新为 ${v}`, "success");
    } catch (error) {
      console.error("Failed to update concurrency", error);
      toast("检测并发数更新失败", "error");
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="shrink-0 px-6 pb-6">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight text-white">
            系统配置
          </h2>
          <HintTooltip content="全局配置与调试辅助。" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <section>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-gray-500">
            通用
          </h3>
          <div className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-gray-200">
                    Debug 模式
                  </p>
                  <HintTooltip content="开启后右下角显示实时操作日志面板。" />
                </div>
              </div>
              <button
                onClick={() => void handleToggle()}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  debugEnabled ? "bg-indigo-600" : "bg-gray-700"
                }`}
                role="switch"
                aria-checked={debugEnabled}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                    debugEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-gray-200">
                    检测并发数
                  </p>
                  <HintTooltip
                    content={`同时发起检测的最大请求数，范围 1 - ${MAX_CONCURRENCY}。`}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    void handleConcurrencyChange(Math.max(1, concurrency - 1))
                  }
                  disabled={concurrency <= 1}
                  className={BUTTON_ICON_SM_CLASS}
                >
                  −
                </button>
                <span className="w-6 text-center font-mono text-sm font-semibold text-indigo-400">
                  {concurrency}
                </span>
                <button
                  onClick={() =>
                    void handleConcurrencyChange(
                      Math.min(MAX_CONCURRENCY, concurrency + 1),
                    )
                  }
                  disabled={concurrency >= MAX_CONCURRENCY}
                  className={BUTTON_ICON_SM_CLASS}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </section>

        <ModelConfigSection
          providers={providers}
          onDirtyChange={onDirtyChange ?? (() => {})}
        />
      </div>
    </div>
  );
}
