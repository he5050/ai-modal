import { useState } from "react";
import { savePersistedJson } from "../lib/persistence";
import { ModelConfigSection } from "./ModelConfigSection";
import type { Provider } from "../types";

export const DEBUG_KEY = "ai-modal-debug";
export const DEBUG_DB_KEY = "debug_enabled";
export const CONCURRENCY_KEY = "ai-modal-concurrency";
export const CONCURRENCY_DB_KEY = "concurrency";
export const DEFAULT_CONCURRENCY = 3;
export const MAX_CONCURRENCY = 20;

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
  onDirtyChange: (v: boolean) => void;
}

export function SettingsPage({
  providers,
  debugEnabled,
  onDebugChange,
  onDirtyChange,
}: Props) {
  const [concurrency, setConcurrency] = useState<number>(getConcurrency);

  function handleToggle() {
    const next = !debugEnabled;
    localStorage.setItem(DEBUG_KEY, String(next));
    void savePersistedJson(DEBUG_DB_KEY, next, DEBUG_KEY);
    onDebugChange(next);
  }

  function handleConcurrencyChange(v: number) {
    setConcurrency(v);
    localStorage.setItem(CONCURRENCY_KEY, String(v));
    void savePersistedJson(CONCURRENCY_DB_KEY, v, CONCURRENCY_KEY);
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="shrink-0 px-6 pb-6">
        <h2 className="text-base font-semibold tracking-tight text-white">
          系统配置
        </h2>
        <p className="mt-2 text-sm text-gray-400">全局配置与调试辅助。</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <section>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-gray-500">
            通用
          </h3>
          <div className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-gray-200">Debug 模式</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  开启后右下角显示实时操作日志面板
                </p>
              </div>
              <button
                onClick={handleToggle}
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
                <p className="text-sm font-medium text-gray-200">检测并发数</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  同时发起检测的最大请求数，范围 1 – {MAX_CONCURRENCY}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    handleConcurrencyChange(Math.max(1, concurrency - 1))
                  }
                  disabled={concurrency <= 1}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-base leading-none text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-6 text-center font-mono text-sm font-semibold text-indigo-400">
                  {concurrency}
                </span>
                <button
                  onClick={() =>
                    handleConcurrencyChange(
                      Math.min(MAX_CONCURRENCY, concurrency + 1),
                    )
                  }
                  disabled={concurrency >= MAX_CONCURRENCY}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-base leading-none text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </section>
        <ModelConfigSection
          providers={providers}
          onDirtyChange={onDirtyChange}
        />
      </div>
    </div>
  );
}
