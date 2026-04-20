import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  List,
  MessageSquareQuote,
  ScanSearch,
  Settings,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import type { AppPage } from '../types'

export type AppNavSection = 'core' | 'assets' | 'system'

export interface AppNavItem {
  key: AppPage
  label: string
  Icon: LucideIcon
  section: AppNavSection
}

export const APP_NAV_ITEMS: AppNavItem[] = [
  { key: 'detect', label: '模型检测', Icon: ScanSearch, section: 'core' },
  { key: 'models', label: '模型列表', Icon: List, section: 'core' },
  { key: 'skills', label: '技能管理', Icon: Sparkles, section: 'assets' },
  { key: 'prompts', label: '提示词管理', Icon: MessageSquareQuote, section: 'assets' },
  { key: 'rules', label: '规则管理', Icon: BookOpen, section: 'assets' },
  {
    key: 'configs',
    label: '配置管理',
    Icon: SlidersHorizontal,
    section: 'assets',
  },
  { key: 'settings', label: '系统配置', Icon: Settings, section: 'system' },
]
