import { useRef } from "react";
import {
  BookOpen,
  List,
  ScanSearch,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from "lucide-react";
import { animate, spring } from "animejs";
import type { AppPage } from "../types";
import { Tooltip } from "./Tooltip";

interface Props {
  page: AppPage;
  onPageChange: (p: AppPage) => void;
  modelCount: number;
  availableCount: number;
}

const NAV_ITEMS = [
  { key: "detect" as AppPage, label: "模型检测", Icon: ScanSearch },
  { key: "models" as AppPage, label: "模型列表", Icon: List },
  { key: "skills" as AppPage, label: "技能管理", Icon: Sparkles },
  { key: "rules" as AppPage, label: "规则管理", Icon: BookOpen },
  { key: "configs" as AppPage, label: "配置管理", Icon: SlidersHorizontal },
  { key: "settings" as AppPage, label: "系统配置", Icon: Settings },
];

export function Sidebar({
  page,
  onPageChange,
  modelCount,
  availableCount,
}: Props) {
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function isActive(key: AppPage) {
    return page === key || (page === "provider-detail" && key === "models");
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
    <aside className="w-52 h-full bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* Logo */}
      <div
        data-tauri-drag-region
        className="px-4 pt-8 pb-4 border-b border-gray-800"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow-[0_0_10px_2px_rgba(99,102,241,0.6)]">
            <Zap className="w-4 h-4 text-white fill-white" />
          </div>
          <span className="text-sm font-bold text-white">AIModal</span>
        </div>
      </div>

      {/* 导航 */}
      <nav className="px-3 pt-3 pb-2 space-y-0.5">
        {NAV_ITEMS.map(({ key, label, Icon }) => (
          <button
            key={key}
            ref={(el) => {
              btnRefs.current[key] = el;
            }}
            onClick={() => handleNav(key)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive(key)
                ? "bg-indigo-600 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
            {key === "models" && modelCount > 0 && (
              <Tooltip
                content={`${availableCount} 个接口有可用模型 / 共 ${modelCount} 个接口`}
                placement="right"
              >
                <span
                  className={`ml-auto text-xs px-1.5 py-0.5 rounded-full ${
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

      <div className="mt-auto px-4 py-3 border-t border-gray-800 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/60" />
        <p className="text-xs text-gray-600">v0.1.0</p>
      </div>
    </aside>
  );
}
