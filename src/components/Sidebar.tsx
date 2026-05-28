const APP_VERSION = "0.7.0";
import { useRef, useState } from "react";
import { Zap, ChevronDown, ChevronRight } from "lucide-react";
import { animate, spring } from "animejs";
import type { AppPage } from "@/types";
import { Tooltip } from "./Tooltip";
import { NAV_GROUPS, STANDALONE_NAV_ITEMS, type NavGroup } from "@/lib/appNavigation";

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
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    model: true,
    config: true,
  });

  // 检查页面是否是模型列表（只有模型列表显示徽章）
  const isModelListPage = (p: AppPage) => {
    return p === 'model-list';
  };

  // 检查页面是否激活
  function isActive(key: AppPage) {
    return (
      page === key ||
      (page === "provider-detail" && key === "model-list") ||
      (page === "prompt-detail" && key === "config-prompts")
    );
  }

  // 切换分组展开状态
  function toggleGroup(groupKey: string) {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
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

  // 渲染二级菜单项
  function renderNavItem(item: { key: AppPage; label: string; Icon: React.ComponentType<{ className?: string }> }, isChild = false) {
    const active = isActive(item.key);
    const isModelListItem = isModelListPage(item.key);

    return (
      <button
        key={item.key}
        ref={(el) => {
          btnRefs.current[item.key] = el;
        }}
        onClick={() => handleNav(item.key)}
        className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-sm transition-colors ${
          active
            ? "border border-indigo-500/60 bg-indigo-600/90 text-white"
            : "border border-transparent text-gray-400 hover:border-gray-700 hover:bg-gray-800/85 hover:text-gray-200"
        } ${isChild ? "ml-2 w-[calc(100%-8px)]" : ""}`}
      >
        <item.Icon className="h-4 w-4 flex-shrink-0" />
        {item.label}
        {isModelListItem && modelCount > 0 && (
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
    );
  }

  // 渲染一级菜单分组
  function renderNavGroup(group: NavGroup) {
    const isExpanded = expandedGroups[group.key];
    const hasActiveChild = group.children.some(child => isActive(child.key));

    return (
      <div key={group.key} className="space-y-0.5">
        {/* 一级菜单标题 */}
        <button
          onClick={() => toggleGroup(group.key)}
          className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-sm transition-colors ${
            hasActiveChild
              ? "border border-indigo-500/30 bg-indigo-600/20 text-indigo-300"
              : "border border-transparent text-gray-300 hover:border-gray-700 hover:bg-gray-800/85 hover:text-gray-200"
          }`}
        >
          <group.Icon className="h-4 w-4 flex-shrink-0" />
          <span className="font-medium">{group.label}</span>
          {isExpanded ? (
            <ChevronDown className="ml-auto h-4 w-4 text-gray-500" />
          ) : (
            <ChevronRight className="ml-auto h-4 w-4 text-gray-500" />
          )}
        </button>

        {/* 二级菜单 */}
        {isExpanded && (
          <div className="space-y-0.5 py-1">
            {group.children.map(child => renderNavItem(child, true))}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="flex h-full w-52 flex-col border-r border-gray-800 bg-gray-900/95">
      {/* Logo */}
      <div
        data-tauri-drag-region
        className="border-b border-gray-800 px-4 pb-4 pt-8"
      >
        <div className="pointer-events-none flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-indigo-500/50 bg-indigo-600/90">
            <Zap className="h-3.5 w-3.5 fill-white text-white" />
          </div>
          <span className="text-sm font-bold text-white">AIModal</span>
        </div>
      </div>

      {/* 导航 */}
      <nav className="space-y-1 px-3 pb-2 pt-3">
        {/* 一级菜单分组 */}
        {NAV_GROUPS.map(group => renderNavGroup(group))}

        {/* 独立菜单项 */}
        <div className="pt-2 border-t border-gray-800/50 mt-2">
          {STANDALONE_NAV_ITEMS.map(item => renderNavItem(item))}
        </div>
      </nav>

      <div className="mt-auto flex items-center gap-2 border-t border-gray-800 px-4 py-3">
        <div className="h-1.5 w-1.5 rounded-full bg-indigo-500/60" />
        <p className="text-xs text-gray-600">{`v${APP_VERSION}`}</p>
      </div>
    </aside>
  );
}
