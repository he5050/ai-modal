import type { ComponentProps } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SkillsPage } from '../SkillsPage'
import type {
  SkillEnrichmentRecord,
  SkillTargetConfig,
  SkillTargetStatus,
  SkillsCatalogSnapshot,
  SkillsCommandResult,
  SystemLlmSnapshot,
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
    mockResolveSystemLlm,
    mockEnrichSingleSkill,
    mockListen,
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
      mockResolveSystemLlm: vi.fn(),
      mockEnrichSingleSkill: vi.fn(),
      mockListen: vi.fn(),
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

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
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
  resolveSystemLlm: mockResolveSystemLlm,
  enrichSingleSkill: mockEnrichSingleSkill,
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

function createDocxSkill() {
  return {
    name: 'docx',
    dir: 'docx',
    description: 'docx description',
    version: '1.0.0',
    updatedAt: Date.now(),
    categories: ['docs'],
    internal: false,
    path: '/Users/test/.agents/skills/docx',
    hasSkillFile: true,
    sourceType: 'github' as const,
    sourceValue: 'example/docx',
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

function createSystemLlmSnapshot(
  overrides: Partial<SystemLlmSnapshot> = {},
): SystemLlmSnapshot {
  return {
    current: {
      toolId: 'codex',
      label: 'Codex',
      sourcePath: '/Users/test/.codex/config.toml',
      baseUrl: 'https://llm.example.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-5.4',
      requestKind: 'openai-responses',
      protocols: ['openai'],
      updatedAt: Date.now(),
    },
    profiles: [],
    ...overrides,
  }
}

function createEnrichmentRecord(
  overrides: Partial<SkillEnrichmentRecord> = {},
): SkillEnrichmentRecord {
  return {
    skillDir: 'demo-skill',
    skillPath: '/Users/test/.agents/skills/demo-skill',
    sourceUpdatedAt: Date.now(),
    sourceDescription: 'demo description',
    localizedDescription: '这是一个中文技能简介',
    fullDescription: '这是一个用于测试的完整中文技能介绍。',
    contentSummary: '内容摘要',
    usage: '用法说明',
    scenarios: '使用场景说明',
    tags: ['自动化', '工具链'],
    status: 'success',
    providerLabel: 'Codex',
    model: 'gpt-5.4',
    requestKind: 'openai-responses',
    rawResponse: '{}',
    errorMessage: null,
    enrichedAt: Date.now(),
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

async function renderSkillsPage(
  props: Partial<ComponentProps<typeof SkillsPage>> = {},
) {
  render(<SkillsPage onDirtyChange={vi.fn()} {...props} />)
  await screen.findByText('本地技能')
}

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  mockHomeDir.mockResolvedValue('/Users/test')
  mockLoadPersistedJson.mockImplementation(
    async (dbKey: string, _legacyKey: string, fallback: unknown) => {
      if (dbKey === 'skill_targets') return builtinTargets
      if (dbKey === 'skills_sources') return {}
      if (dbKey === 'skills_catalog') {
        return createCatalog([createDemoSkill(), createDocxSkill()])
      }
      if (dbKey === 'skill_enrichments') return {}
      if (dbKey === 'model_configs') {
        return [
          {
            id: 'model-config-1',
            baseUrl: 'https://llm.example.com/v1',
            apiKey: 'sk-test',
            model: 'gpt-5.4',
            lastTestAt: Date.now(),
            lastTestResult: {
              supported_protocols: ['openai'],
            },
          },
        ]
      }
      return fallback
    },
  )
  mockScanLocalSkills.mockResolvedValue(createCatalog([createDemoSkill(), createDocxSkill()]))
  mockInspectSkillTargets.mockResolvedValue(builtinStatuses)
  mockSearchOnlineSkills.mockResolvedValue({
    query: 'skill',
    searchType: 'skills.sh',
    skills: [],
    count: 0,
    durationMs: 0,
  })
  mockSyncSkillTargets.mockResolvedValue([])
  mockResolveSystemLlm.mockResolvedValue(createSystemLlmSnapshot())
  mockEnrichSingleSkill.mockResolvedValue(createEnrichmentRecord())
  mockRunSkillsCommand.mockResolvedValue(createCommandResult())
  mockListen.mockResolvedValue(() => {})
  mockSavePersistedJson.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SkillsPage', () => {
  it('runs global update and shows actual command in recent command results', async () => {
    const user = userEvent.setup()
    await renderSkillsPage()

    await user.click(screen.getByRole('button', { name: '同步与安装' }))
    await user.click(screen.getByRole('button', { name: '更新全部' }))
    await user.click(screen.getByRole('button', { name: '更新全部技能' }))

    await waitFor(() => {
      expect(mockRunSkillsCommand).toHaveBeenCalledWith({
        action: 'update',
        skillNames: ['demo-skill', 'docx'],
      })
    })

    await user.click(screen.getByRole('button', { name: /最近命令结果/ }))

    expect(
      await screen.findByText(/command:\s*npx -y skills update -g -y/i),
    ).toBeInTheDocument()
  })

  it('shows enriched chinese description and tooltip details', async () => {
    mockLoadPersistedJson.mockReset()
    mockLoadPersistedJson.mockImplementation(
      async (dbKey: string, _legacyKey: string, fallback: unknown) => {
        if (dbKey === 'skill_targets') return builtinTargets
        if (dbKey === 'skills_sources') return {}
        if (dbKey === 'skills_catalog') return createCatalog([createDemoSkill()])
        if (dbKey === 'skill_enrichments') {
          return {
            'demo-skill': createEnrichmentRecord(),
          }
        }
        if (dbKey === 'model_configs') {
          return [
            {
              id: 'model-config-1',
              baseUrl: 'https://llm.example.com/v1',
              apiKey: 'sk-test',
              model: 'gpt-5.4',
              lastTestAt: Date.now(),
              lastTestResult: {
                supported_protocols: ['openai'],
              },
            },
          ]
        }
        return fallback
      },
    )

    await renderSkillsPage()

    expect(
      await screen.findByRole('button', { name: '查看 demo-skill 的技能详情' }),
    ).toHaveTextContent('这是一个中文技能简介')

    await userEvent.hover(
      screen.getByRole('button', { name: '查看 demo-skill 的技能详情' }),
    )

    expect(await screen.findByText('完整介绍')).toBeInTheDocument()
    expect(
      await screen.findByText('这是一个用于测试的完整中文技能介绍。'),
    ).toBeInTheDocument()
  })

  it(
    'enriches skills strictly one by one with 5 second spacing',
    async () => {
    const user = userEvent.setup()
    const first = createEnrichmentRecord({
      skillDir: 'demo-skill',
      skillPath: '/Users/test/.agents/skills/demo-skill',
    })
    const second = createEnrichmentRecord({
      skillDir: 'docx',
      skillPath: '/Users/test/.agents/skills/docx',
      localizedDescription: '第二个技能简介',
    })

    let firstResolved = false
    mockEnrichSingleSkill
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              firstResolved = true
              resolve(first)
            }, 10)
          }),
      )
      .mockResolvedValueOnce(second)

    await renderSkillsPage({
      enrichmentDelayMs: 200,
    })

    await user.click(
      screen.getByRole('button', { name: '技能注解' }),
    )
    await user.click(
      screen.getByRole('button', {
        name: /全量注解.*全部重新处理一次/,
      }),
    )

    await waitFor(() => {
      expect(mockEnrichSingleSkill).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15))
    })
    expect(firstResolved).toBe(true)
    expect(mockEnrichSingleSkill).toHaveBeenCalledTimes(1)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15))
    })
    expect(mockEnrichSingleSkill).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(mockEnrichSingleSkill).toHaveBeenCalledTimes(2)
    })
    },
    15000,
  )

  it('shows progress immediately when running global update', async () => {
    const user = userEvent.setup()
    let resolveCommand: ((value: SkillsCommandResult) => void) | null = null
    mockRunSkillsCommand.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCommand = resolve
        }),
    )

    await renderSkillsPage()

    await user.click(screen.getByRole('button', { name: '同步与安装' }))
    await user.click(screen.getByRole('button', { name: '更新全部' }))
    await user.click(screen.getByRole('button', { name: '更新全部技能' }))

    expect(
      await screen.findByText('开始执行：更新全部全局技能'),
    ).toBeInTheDocument()

    resolveCommand?.(createCommandResult())

    await waitFor(() => {
      expect(mockRunSkillsCommand).toHaveBeenCalledWith({
        action: 'update',
        skillNames: ['demo-skill', 'docx'],
      })
    })
  })

  it('shows stderr warning summary when npm config warnings are folded', async () => {
    const user = userEvent.setup()
    mockRunSkillsCommand.mockResolvedValueOnce(
      createCommandResult({
        stderr: [
          'npm warn Unknown user config "python"',
          'npm warn Unknown env config "registry"',
        ].join('\n'),
      }),
    )

    await renderSkillsPage()

    await user.click(screen.getByRole('button', { name: '同步与安装' }))
    await user.click(screen.getByRole('button', { name: '更新全部' }))
    await user.click(screen.getByRole('button', { name: '更新全部技能' }))

    expect(
      await screen.findByText((content) =>
        content.includes('stderr 摘要：包含 2 条 npm 配置告警'),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/示例：npm warn Unknown user config "python"/),
    ).toBeInTheDocument()
  })

  it('updates visible progress from skills-command-progress events', async () => {
    const user = userEvent.setup()
    let progressHandler:
      | ((event: {
          payload: {
            action: 'update'
            stage: string
            message: string
            current?: number
            total?: number
            skillName?: string
          }
        }) => void)
      | null = null

    mockListen.mockImplementationOnce(async (_event, handler) => {
      progressHandler = handler
      return () => {}
    })

    await renderSkillsPage()
    await user.click(screen.getByRole('button', { name: '同步与安装' }))
    await user.click(screen.getByRole('button', { name: '更新全部' }))
    await user.click(screen.getByRole('button', { name: '更新全部技能' }))

    await act(async () => {
      progressHandler?.({
        payload: {
          action: 'update',
          stage: 'checking',
          message: '正在检查 23 / 76：docx',
          current: 23,
          total: 76,
          skillName: 'docx',
        },
      })
    })

    expect(await screen.findByText('正在检查 23 / 76：docx')).toBeInTheDocument()
    expect(await screen.findByText('当前进度：23 / 76 · docx')).toBeInTheDocument()
    expect(await screen.findByRole('progressbar', { name: '技能更新进度' })).toHaveAttribute('aria-valuenow', '30')
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
