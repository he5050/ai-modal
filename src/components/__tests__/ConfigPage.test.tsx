import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigPage } from '../ConfigPage'
import type { ConfigPath, Provider } from '../../types'

const {
  mockHomeDir,
  mockExists,
  mockMkdir,
  mockReadTextFile,
  mockWriteTextFile,
  mockOpenPath,
  mockLoadPersistedJson,
  mockSavePersistedJson,
  mockTestModelConfig,
  mockToast,
} = vi.hoisted(() => ({
  mockHomeDir: vi.fn(),
  mockExists: vi.fn(),
  mockMkdir: vi.fn(),
  mockReadTextFile: vi.fn(),
  mockWriteTextFile: vi.fn(),
  mockOpenPath: vi.fn(),
  mockLoadPersistedJson: vi.fn(),
  mockSavePersistedJson: vi.fn(),
  mockTestModelConfig: vi.fn(),
  mockToast: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
  dirname: vi.fn().mockResolvedValue('/Users/test/.claude'),
  homeDir: mockHomeDir,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: mockExists,
  mkdir: mockMkdir,
  readTextFile: mockReadTextFile,
  writeTextFile: mockWriteTextFile,
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: mockOpenPath,
}))

vi.mock('../../lib/persistence', () => ({
  loadPersistedJson: mockLoadPersistedJson,
  savePersistedJson: mockSavePersistedJson,
}))

vi.mock('../../api', () => ({
  testModelConfig: mockTestModelConfig,
}))

vi.mock('../../lib/toast', () => ({
  toast: mockToast,
}))

const providers: Provider[] = []

function createAvailableProvider(): Provider {
  return {
    id: 'provider-1',
    name: 'Claude Relay',
    baseUrl: 'https://claude.example.com/v1',
    apiKey: 'sk-claude-secret',
    createdAt: 1,
    lastResult: {
      timestamp: 1_700_000_000_000,
      results: [
        {
          model: 'claude-3-5-sonnet',
          available: true,
          latency_ms: 123,
          error: null,
          response_text: 'ok',
          supported_protocols: ['claude', 'openai'],
        },
        {
          model: 'claude-3-5-haiku',
          available: true,
          latency_ms: 110,
          error: null,
          response_text: 'ok',
          supported_protocols: ['claude', 'openai'],
        },
        {
          model: 'claude-3-opus',
          available: true,
          latency_ms: 130,
          error: null,
          response_text: 'ok',
          supported_protocols: ['claude', 'openai'],
        },
      ],
    },
  }
}

function createGeminiAvailableProvider(): Provider {
  return {
    id: 'provider-gemini',
    name: 'Gemini Relay',
    baseUrl: 'https://iruidong.com',
    apiKey: 'sk-needkey',
    createdAt: 1,
    lastResult: {
      timestamp: 1_700_000_000_000,
      results: [
        {
          model: 'gemini-3.1-pro',
          available: true,
          latency_ms: 88,
          error: null,
          response_text: 'ok',
          supported_protocols: ['gemini'],
        },
        {
          model: 'gemini-2.5-flash',
          available: true,
          latency_ms: 66,
          error: null,
          response_text: 'ok',
          supported_protocols: ['gemini'],
        },
      ],
    },
  }
}

const storedPaths: ConfigPath[] = [
  {
    id: 'claude-custom',
    label: 'Claude Hooks',
    path: '/Users/test/.claude/hooks/custom.json',
    isBuiltin: false,
    kind: 'file',
    format: 'json',
  },
]

describe('ConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHomeDir.mockResolvedValue('/Users/test')
    mockExists.mockResolvedValue(true)
    mockReadTextFile.mockResolvedValue('{}')
    mockWriteTextFile.mockResolvedValue(undefined)
    mockLoadPersistedJson.mockResolvedValue([])
    mockSavePersistedJson.mockResolvedValue(undefined)
    mockTestModelConfig.mockResolvedValue({
      model: 'demo-model',
      available: true,
      latency_ms: 123,
      error: null,
      response_text: 'ok',
    })
  })

  it('warns when adding a group file with invalid relative path', async () => {
    render(
      <ConfigPage
        providers={providers}
        storedPaths={storedPaths}
        onUpsertPath={vi.fn()}
        onDeletePath={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    await screen.findByText('配置管理')
    await userEvent.click(screen.getByRole('button', { name: '添加文件' }))
    await userEvent.type(
      screen.getByPlaceholderText('hooks/custom.json'),
      '../bad.json',
    )
    await userEvent.click(screen.getAllByRole('button', { name: '保存' })[0])

    expect(mockToast).toHaveBeenCalledWith(
      '只允许当前目录下的相对路径，且不能包含 ../',
      'warning',
    )
  })

  it('confirms and deletes a custom file entry', async () => {
    const onDeletePath = vi.fn()

    render(
      <ConfigPage
        providers={providers}
        storedPaths={storedPaths}
        onUpsertPath={vi.fn()}
        onDeletePath={onDeletePath}
        onDirtyChange={vi.fn()}
      />,
    )

    await screen.findByText('配置管理')
    await userEvent.click(screen.getByRole('button', { name: 'custom.json' }))
    await userEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(await screen.findByText('删除当前组内文件？')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(onDeletePath).toHaveBeenCalledWith('claude-custom')
    })
  })

  it('applies selected available Claude models into settings.json draft env', async () => {
    mockReadTextFile.mockResolvedValue(
      JSON.stringify({ env: { EXISTING_FLAG: 'keep-me' } }, null, 2),
    )

    render(
      <ConfigPage
        providers={[createAvailableProvider()]}
        storedPaths={storedPaths}
        onUpsertPath={vi.fn()}
        onDeletePath={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    await screen.findByText('配置管理')
    await userEvent.click(screen.getByRole('button', { name: '应用' }))
    expect(await screen.findByText('应用到 Claude settings.json')).toBeInTheDocument()

    screen.getByText('应用到 Claude settings.json').closest('div[role], div')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '选择 ANTHROPIC_DEFAULT_OPUS_MODEL' }),
      'claude-3-opus',
    )
    await userEvent.click(screen.getByRole('button', { name: '应用到草稿' }))

    const saveButtons = screen.getAllByRole('button', { name: '保存' })
    await userEvent.click(saveButtons[0])

    await waitFor(() => {
      expect(mockWriteTextFile).toHaveBeenCalled()
    })

    const [, savedContent] = mockWriteTextFile.mock.calls.at(-1)
    const parsed = JSON.parse(savedContent)
    expect(parsed.env).toMatchObject({
      EXISTING_FLAG: 'keep-me',
      ANTHROPIC_BASE_URL: 'https://claude.example.com',
      ANTHROPIC_AUTH_TOKEN: 'sk-claude-secret',
      ANTHROPIC_MODEL: 'claude-3-5-sonnet',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-3-5-haiku',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-3-5-sonnet',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-3-opus',
    })
  })

  it('applies selected available provider into codex config.toml and auth.json drafts', async () => {
    mockReadTextFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.codex/config.toml')) {
        return 'model = "old-model"\n'
      }
      if (path.endsWith('/.codex/auth.json')) {
        return JSON.stringify({ EXISTING: 'keep-me' }, null, 2)
      }
      return '{}'
    })

    render(
      <ConfigPage
        providers={[createAvailableProvider()]}
        storedPaths={storedPaths}
        onUpsertPath={vi.fn()}
        onDeletePath={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    await screen.findByText('配置管理')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '选择工具' }),
      'codex',
    )
    await userEvent.click(screen.getByRole('button', { name: '应用' }))
    expect(await screen.findByText('应用到 Codex 配置')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '应用到草稿' }))

    const saveButtons = screen.getAllByRole('button', { name: '保存' })
    await userEvent.click(saveButtons[0])

    await waitFor(() => {
      expect(mockWriteTextFile).toHaveBeenCalledTimes(1)
    })

    const [configPath, configTomlContent] = mockWriteTextFile.mock.calls[0]
    expect(configPath).toContain('/.codex/config.toml')
    expect(configTomlContent).toContain('model = "claude-3-5-sonnet"')
    expect(configTomlContent).toContain('model_provider = "codex"')
    expect(configTomlContent).toContain('base_url = "https://claude.example.com/v1"')
    expect(configTomlContent).toContain('name = "codex"')
    expect(configTomlContent).toContain('wire_api = "responses"')

    await userEvent.click(screen.getByRole('button', { name: /auth\.json/ }))
    const saveButtonsAfterSwitch = screen.getAllByRole('button', { name: '保存' })
    await userEvent.click(saveButtonsAfterSwitch[0])

    await waitFor(() => {
      expect(mockWriteTextFile).toHaveBeenCalledTimes(2)
    })

    const [authPath, authJsonContent] = mockWriteTextFile.mock.calls[1]
    expect(authPath).toContain('/.codex/auth.json')
    expect(JSON.parse(authJsonContent)).toMatchObject({
      EXISTING: 'keep-me',
      OPENAI_API_KEY: 'sk-claude-secret',
    })
  })

  it('applies selected checked models into opencode provider config draft', async () => {
    mockReadTextFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.config/opencode/opencode.json')) {
        return JSON.stringify(
          {
            provider: {
              old: {
                npm: '@ai-sdk/openai-compatible',
                name: 'old',
                options: { baseURL: 'https://old.example.com/v1', apiKey: 'old-key' },
                models: { 'old-model': { name: 'old-model' } },
              },
            },
          },
          null,
          2,
        )
      }
      return '{}'
    })

    render(
      <ConfigPage
        providers={[createAvailableProvider()]}
        storedPaths={storedPaths}
        onUpsertPath={vi.fn()}
        onDeletePath={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    await screen.findByText('配置管理')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '选择工具' }),
      'opencode',
    )
    await userEvent.click(screen.getByRole('button', { name: '应用' }))
    expect(await screen.findByText('应用到 OpenCode 配置')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('claude-3-5-sonnet'))
    await userEvent.click(screen.getByLabelText('claude-3-opus'))
    await userEvent.click(screen.getByLabelText('claude-3-5-haiku'))
    await userEvent.click(screen.getByRole('button', { name: '应用到草稿' }))

    const saveButtons = screen.getAllByRole('button', { name: '保存' })
    await userEvent.click(saveButtons[0])

    await waitFor(() => {
      expect(mockWriteTextFile).toHaveBeenCalled()
    })

    const [path, content] = mockWriteTextFile.mock.calls.at(-1)
    expect(path).toContain('/.config/opencode/opencode.json')
    expect(JSON.parse(content)).toMatchObject({
      provider: {
        old: {
          name: 'old',
        },
        'Claude Relay': {
          npm: '@ai-sdk/openai-compatible',
          name: 'Claude Relay',
          options: {
            baseURL: 'https://claude.example.com',
            apiKey: 'sk-claude-secret',
          },
          models: {
            'claude-3-5-sonnet': { name: 'claude-3-5-sonnet' },
            'claude-3-opus': { name: 'claude-3-opus' },
          },
        },
      },
    })
  })

  it('applies selected Gemini model into .settings.json and .env drafts', async () => {
    mockReadTextFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.gemini/.settings.json')) {
        return JSON.stringify(
          {
            general: { existingFlag: true },
            security: { audit: 'keep-me' },
            extra: 'keep-me',
          },
          null,
          2,
        )
      }
      if (path.endsWith('/.gemini/.env')) {
        return 'EXISTING_FLAG=keep-me\n'
      }
      return '{}'
    })

    render(
      <ConfigPage
        providers={[createGeminiAvailableProvider()]}
        storedPaths={storedPaths}
        onUpsertPath={vi.fn()}
        onDeletePath={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    await screen.findByText('配置管理')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '选择工具' }),
      'gemini',
    )
    await userEvent.click(screen.getByRole('button', { name: '应用' }))
    expect(await screen.findByText('应用到 Gemini 配置')).toBeInTheDocument()
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '选择 Gemini 模型' }),
      'gemini-3.1-pro',
    )
    await userEvent.click(screen.getByRole('button', { name: '应用到草稿' }))

    const saveButtons = screen.getAllByRole('button', { name: '保存' })
    await userEvent.click(saveButtons[0])

    await waitFor(() => {
      expect(mockWriteTextFile).toHaveBeenCalledTimes(1)
    })

    const [settingsPath, settingsContent] = mockWriteTextFile.mock.calls[0]
    expect(settingsPath).toContain('/.gemini/.settings.json')
    expect(JSON.parse(settingsContent)).toMatchObject({
      model: {
        name: 'gemini-3.1-pro',
      },
      general: {
        existingFlag: true,
        previewFeatures: true,
      },
      security: {
        audit: 'keep-me',
        auth: {
          selectedType: 'gemini-api-key',
        },
      },
      extra: 'keep-me',
    })

    await userEvent.click(screen.getByRole('button', { name: /\.env/ }))
    const saveButtonsAfterSwitch = screen.getAllByRole('button', { name: '保存' })
    await userEvent.click(saveButtonsAfterSwitch[0])

    await waitFor(() => {
      expect(mockWriteTextFile).toHaveBeenCalledTimes(2)
    })

    const [envPath, envContent] = mockWriteTextFile.mock.calls[1]
    expect(envPath).toContain('/.gemini/.env')
    expect(envContent).toContain('EXISTING_FLAG=keep-me')
    expect(envContent).not.toContain('\n\nGEMINI_API_KEY=')
    expect(envContent).toContain('GEMINI_API_KEY=sk-needkey')
    expect(envContent).toContain(
      'GEMINI_API_KEY=sk-needkey\nGOOGLE_GEMINI_BASE_URL=https://iruidong.com/v1beta',
    )
  })

  it('applies selected requestMethod and models into snow config draft', async () => {
    mockReadTextFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.snow/config.json')) {
        return JSON.stringify(
          {
            snowcfg: {
              existingFlag: 'keep-me',
            },
            extra: 'keep-me',
          },
          null,
          2,
        )
      }
      return '{}'
    })

    render(
      <ConfigPage
        providers={[createAvailableProvider()]}
        storedPaths={storedPaths}
        onUpsertPath={vi.fn()}
        onDeletePath={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    await screen.findByText('配置管理')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '选择工具' }),
      'snow',
    )
    await userEvent.click(screen.getByRole('button', { name: '应用' }))
    expect(await screen.findByText('应用到 Snow 配置')).toBeInTheDocument()

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '选择 Snow 请求模式' }),
      'anthropic',
    )
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '选择 Snow advancedModel' }),
      'claude-3-opus',
    )
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '选择 Snow basicModel' }),
      'claude-3-5-haiku',
    )
    await userEvent.click(screen.getByRole('button', { name: '应用到草稿' }))

    await userEvent.click(screen.getByRole('button', { name: 'config.json未保存' }))
    const saveButtons = screen.getAllByRole('button', { name: '保存' })
    await userEvent.click(saveButtons[0])

    await waitFor(() => {
      expect(mockWriteTextFile).toHaveBeenCalledTimes(1)
    })

    const [configPath, configContent] = mockWriteTextFile.mock.calls[0]
    expect(configPath).toContain('/.snow/config.json')
    expect(JSON.parse(configContent)).toMatchObject({
      snowcfg: {
        existingFlag: 'keep-me',
        baseUrl: 'https://claude.example.com',
        apiKey: 'sk-claude-secret',
        requestMethod: 'anthropic',
        advancedModel: 'claude-3-opus',
        basicModel: 'claude-3-5-haiku',
      },
      extra: 'keep-me',
    })
  })
})
