import { useRef } from "react";
import { Zap } from "lucide-react";
import { animate, spring } from "animejs";
import type { AppPage } from "../types";
import { Tooltip } from "./Tooltip";
import { APP_NAV_ITEMS } from "../lib/appNavigation";

interface Props {
  page: AppPage;
  onPageChange: (p: AppPage) => void;
  modelCount: number;
  availableCount: number;
}

export function Sidebar({
  page,
  onPageChange,
  modelCount,
  availableCount,
}: Props) {
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function isActive(key: AppPage) {
    return (
      page === key ||
      (page === "provider-detail" && key === "models") ||
      (page === "prompt-detail" && key === "prompts")
    );
  }

  function handleNav(key: AppPage) {
    const el = btnRefs.current[key];
    if (el) {
      animate(el, {
        scale: [1, 0.94, 1],
        ease: spring({ stiffness: 500, damping: 18 }),
        duration: 300,
      });
    }
    onPageChange(key);
  }

  return (
    <aside className="flex h-full w-52 flex-col border-r border-gray-800 bg-gray-900/95">
      {/* Logo */}
      <div
        data-tauri-drag-region
        className="border-b border-gray-800 px-4 pb-4 pt-8"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-indigo-500/50 bg-indigo-600/90">
            <Zap className="h-3.5 w-3.5 fill-white text-white" />
          </div>
          <span className="text-sm font-bold text-white">AIModal</span>
        </div>
      </div>

      {/* 导航 */}
      <nav className="space-y-0.5 px-3 pb-2 pt-3">
        {APP_NAV_ITEMS.map(({ key, label, Icon }) => (
          <button
            key={key}
            ref={(el) => {
              btnRefs.current[key] = el;
            }}
            onClick={() => handleNav(key)}
            className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-sm transition-colors ${
              isActive(key)
                ? "border border-indigo-500/60 bg-indigo-600/90 text-white"
                : "border border-transparent text-gray-400 hover:border-gray-700 hover:bg-gray-800/85 hover:text-gray-200"
            }`}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
            {key === "models" && modelCount > 0 && (
              <Tooltip
                content={`${availableCount} 个接口有可用模型 / 共 ${modelCount} 个接口`}
                placement="right"
              >
                <span
                  className={`ml-auto rounded-full px-1.5 py-0.5 text-xs ${
                    availableCount > 0
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-gray-700 text-gray-400"
                  }`}
                >
                  {availableCount}/{modelCount}
                </span>
              </Tooltip>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-2 border-t border-gray-800 px-4 py-3">
        <div className="h-1.5 w-1.5 rounded-full bg-indigo-500/60" />
        <p className="text-xs text-gray-600">v0.1.0</p>
      </div>
    </aside>
  );
}
