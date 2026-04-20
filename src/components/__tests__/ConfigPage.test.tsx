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
})
