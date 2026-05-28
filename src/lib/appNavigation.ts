import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Cable,
  GitBranch,
  List,
  MessageSquareQuote,
  ScanSearch,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Cpu,
  Terminal,
} from 'lucide-react'
import type { AppPage } from '../types'

// 菜单项类型
export interface NavItem {
  key: AppPage
  label: string
  Icon: LucideIcon
}

// 一级菜单分组
export interface NavGroup {
  key: string
  label: string
  Icon: LucideIcon
  children: NavItem[]
  defaultPage: AppPage
}

// 模型管理二级菜单
export const MODEL_NAV_ITEMS: NavItem[] = [
  { key: 'model-detect', label: '模型检测', Icon: ScanSearch },
  { key: 'model-list', label: '模型列表', Icon: List },
  { key: 'model-mapping', label: '模型映射', Icon: GitBranch },
]

// 配置管理二级菜单
export const CONFIG_NAV_ITEMS: NavItem[] = [
  { key: 'config-mcp', label: 'MCP 管理', Icon: Cable },
  { key: 'config-skills', label: '技能管理', Icon: Sparkles },
  { key: 'config-prompts', label: '提示词管理', Icon: MessageSquareQuote },
  { key: 'config-rules', label: '规则管理', Icon: BookOpen },
  { key: 'config-settings', label: '配置管理', Icon: SlidersHorizontal },
]

// 一级菜单定义
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'model',
    label: '模型管理',
    Icon: Cpu,
    children: MODEL_NAV_ITEMS,
    defaultPage: 'model-detect',
  },
  {
    key: 'config',
    label: '配置管理',
    Icon: Settings,
    children: CONFIG_NAV_ITEMS,
    defaultPage: 'config-mcp',
  },
]

// 独立菜单项（不在分组中）
export const STANDALONE_NAV_ITEMS: NavItem[] = [
  { key: 'curl-task', label: 'cURL 任务', Icon: Terminal },
  { key: 'settings', label: '系统配置', Icon: Settings },
]

// 向后兼容：获取所有页面（用于路由匹配）
export function getAllPages(): AppPage[] {
  return [
    ...MODEL_NAV_ITEMS.map(item => item.key),
    ...CONFIG_NAV_ITEMS.map(item => item.key),
    ...STANDALONE_NAV_ITEMS.map(item => item.key),
    'prompt-detail',
    'provider-detail',
    'curl-task',
    'curl-task-detail',
  ] as AppPage[]
}

// 获取页面所属的分组
export function getPageGroup(page: AppPage): NavGroup | null {
  for (const group of NAV_GROUPS) {
    if (group.children.some(child => child.key === page)) {
      return group
    }
  }
  return null
}

// 检查页面是否属于某个分组
export function isPageInGroup(page: AppPage, groupKey: string): boolean {
  const group = NAV_GROUPS.find(g => g.key === groupKey)
  return group?.children.some(child => child.key === page) ?? false
}
