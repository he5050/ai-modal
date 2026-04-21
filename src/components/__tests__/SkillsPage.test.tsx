import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SkillsPage } from '../SkillsPage'
import type {
  SkillTargetConfig,
  SkillTargetStatus,
  SkillsCatalogSnapshot,
  SkillsCommandResult,
} from '../../types'

const {
  mockHomeDir,
  mockPickPath,
  mockOpenPath,
  mockScanLocalSkills,
  mockInspectSkillTargets,
  mockRunSkillsCommand,
  mockSearchOnlineSkills,
  mockSyncSkillTargets,
  mockLoadPersistedJson,
  mockSavePersistedJson,
  mockToast,
  mockLogger,
} = vi.hoisted(() => ({
  mockHomeDir: vi.fn(),
  mockPickPath: vi.fn(),
  mockOpenPath: vi.fn(),
  mockScanLocalSkills: vi.fn(),
  mockInspectSkillTargets: vi.fn(),
  mockRunSkillsCommand: vi.fn(),
  mockSearchOnlineSkills: vi.fn(),
  mockSyncSkillTargets: vi.fn(),
  mockLoadPersistedJson: vi.fn(),
  mockSavePersistedJson: vi.fn(),
  mockToast: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@tauri-apps/api/path', () => ({
  homeDir: mockHomeDir,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: mockPickPath,
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: mockOpenPath,
}))

vi.mock('../../api', () => ({
  scanLocalSkills: mockScanLocalSkills,
  inspectSkillTargets: mockInspectSkillTargets,
  runSkillsCommand: mockRunSkillsCommand,
  searchOnlineSkills: mockSearchOnlineSkills,
  syncSkillTargets: mockSyncSkillTargets,
}))

vi.mock('../../lib/persistence', () => ({
  loadPersistedJson: mockLoadPersistedJson,
  savePersistedJson: mockSavePersistedJson,
}))

vi.mock('../../lib/toast', () => ({
  toast: mockToast,
}))

vi.mock('../../lib/devlog', () => ({
  logger: mockLogger,
}))

function createCatalog(skills: SkillsCatalogSnapshot['skills'] = []): SkillsCatalogSnapshot {
  return {
    sourceDir: '/Users/test/.agents/skills',
    scannedAt: Date.now(),
    totalSkills: skills.length,
    skills,
  }
}

function createDemoSkill() {
  return {
    name: 'demo-skill',
    dir: 'demo-skill',
    description: 'demo description',
    version: '1.0.0',
    updatedAt: Date.now(),
    categories: ['tools'],
    internal: false,
    path: '/Users/test/.agents/skills/demo-skill',
    hasSkillFile: true,
    sourceType: 'github' as const,
    sourceValue: 'example/repo',
  }
}

function createCommandResult(
  overrides: Partial<SkillsCommandResult> = {},
): SkillsCommandResult {
  return {
    action: 'update',
    command: ['npx', '-y', 'skills', 'update', '-g', '-y'],
    cwd: '/Users/test',
    success: true,
    code: 0,
    stdout: 'updated',
    stderr: '',
    catalogRefreshed: true,
    ...overrides,
  }
}

const builtinTargets: SkillTargetConfig[] = [
  {
    id: 'codex',
    label: 'Codex',
    path: '/Users/test/.codex/skills',
    isBuiltin: true,
    enabled: true,
  },
  {
    id: 'snow',
    label: 'Snow',
    path: '/Users/test/.snow/skills',
    isBuiltin: true,
    enabled: true,
  },
]

const builtinStatuses: SkillTargetStatus[] = [
  {
    id: 'codex',
    label: 'Codex',
    path: '/Users/test/.codex/skills',
    exists: true,
    managedCount: 1,
    brokenCount: 0,
    totalEntries: 1,
  },
  {
    id: 'snow',
    label: 'Snow',
    path: '/Users/test/.snow/skills',
    exists: false,
    managedCount: 0,
    brokenCount: 0,
    totalEntries: 0,
  },
]

async function renderSkillsPage() {
  render(<SkillsPage onDirtyChange={vi.fn()} />)
  await screen.findByText('本地技能')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockHomeDir.mockResolvedValue('/Users/test')
  mockLoadPersistedJson
    .mockResolvedValueOnce(builtinTargets)
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce(createCatalog([createDemoSkill()]))
  mockScanLocalSkills.mockResolvedValue(createCatalog([createDemoSkill()]))
  mockInspectSkillTargets.mockResolvedValue(builtinStatuses)
  mockSearchOnlineSkills.mockResolvedValue({
    query: 'skill',
    searchType: 'skills.sh',
    skills: [],
    count: 0,
    durationMs: 0,
  })
  mockSyncSkillTargets.mockResolvedValue([])
  mockRunSkillsCommand.mockResolvedValue(createCommandResult())
  mockSavePersistedJson.mockResolvedValue(undefined)
})

describe('SkillsPage', () => {
  it('runs global update and shows actual command in recent command results', async () => {
    const user = userEvent.setup()
    await renderSkillsPage()

    await user.click(screen.getByRole('button', { name: '同步与安装' }))
    await user.click(screen.getByRole('button', { name: '更新全部' }))
    await user.click(screen.getByRole('button', { name: '更新全部技能' }))

    await waitFor(() => {
      expect(mockRunSkillsCommand).toHaveBeenCalledWith({ action: 'update' })
    })

    await user.click(screen.getByRole('button', { name: /最近命令结果/ }))

    expect(
      await screen.findByText(/command:\s*npx -y skills update -g -y/i),
    ).toBeInTheDocument()
  })

  it('shows confirmation and removes a local skill from the list tab', async () => {
    const user = userEvent.setup()
    mockRunSkillsCommand.mockResolvedValueOnce(
      createCommandResult({
        action: 'remove',
        command: ['npx', '-y', 'skills', 'remove', 'demo-skill', '-g', '-y'],
      }),
    )

    await renderSkillsPage()
    await screen.findByRole('button', { name: '移除 demo-skill' })

    await user.click(screen.getByRole('button', { name: '移除 demo-skill' }))
    expect(await screen.findByText('确认移除技能')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认移除' }))

    await waitFor(() => {
      expect(mockRunSkillsCommand).toHaveBeenCalledWith({
        action: 'remove',
        skillNames: ['demo-skill'],
      })
    })
  })

  it('warns instead of running remove when no skill names are provided', async () => {
    const user = userEvent.setup()
    await renderSkillsPage()

    await user.click(screen.getByRole('button', { name: '同步与安装' }))
    await user.click(screen.getAllByRole('button', { name: '移除技能' })[0])
    await screen.findByPlaceholderText('输入技能名，支持逗号或换行分隔')
    await user.click(screen.getAllByRole('button', { name: '移除技能' })[1])

    expect(mockRunSkillsCommand).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'remove' }),
    )
    expect(mockToast).toHaveBeenCalledWith('请填写要移除的技能名', 'warning')
  })

  it('shows snow as a builtin sync target', async () => {
    const user = userEvent.setup()
    await renderSkillsPage()
    await user.click(screen.getByRole('button', { name: '同步与安装' }))

    expect(screen.getAllByText('Snow').length).toBeGreaterThan(0)
    await user.selectOptions(screen.getByRole('combobox'), 'snow')
    expect(screen.getByDisplayValue('/Users/test/.snow/skills')).toBeInTheDocument()
  })
})
