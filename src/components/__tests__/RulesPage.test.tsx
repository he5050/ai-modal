import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RulesPage } from '../RulesPage'
import type { RulePath } from '../../types'

const watchCallbacks: Array<(event: unknown) => void | Promise<void>> = []

const {
  mockHomeDir,
  mockExists,
  mockMkdir,
  mockReadTextFile,
  mockWatch,
  mockWriteTextFile,
  mockPickPath,
  mockOpenPath,
  mockToast,
} = vi.hoisted(() => ({
  mockHomeDir: vi.fn(),
  mockExists: vi.fn(),
  mockMkdir: vi.fn(),
  mockReadTextFile: vi.fn(),
  mockWatch: vi.fn(),
  mockWriteTextFile: vi.fn(),
  mockPickPath: vi.fn(),
  mockOpenPath: vi.fn(),
  mockToast: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
  dirname: vi
    .fn()
    .mockImplementation(async (path: string) => path.split('/').slice(0, -1).join('/') || '/'),
  homeDir: mockHomeDir,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: mockExists,
  mkdir: mockMkdir,
  readTextFile: mockReadTextFile,
  watch: mockWatch,
  writeTextFile: mockWriteTextFile,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: mockPickPath,
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: mockOpenPath,
}))

vi.mock('../../lib/toast', () => ({
  toast: mockToast,
}))

const storedPaths: RulePath[] = []

describe('RulesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    watchCallbacks.length = 0

    mockHomeDir.mockResolvedValue('/Users/test')
    mockExists.mockResolvedValue(true)
    mockMkdir.mockResolvedValue(undefined)
    mockWriteTextFile.mockResolvedValue(undefined)
    mockPickPath.mockResolvedValue(null)
    mockOpenPath.mockResolvedValue(undefined)
    mockWatch.mockImplementation(async (_path: string, cb: (event: unknown) => void | Promise<void>) => {
      watchCallbacks.push(cb)
      return vi.fn()
    })
  })

  it('refreshes the preview when the current rule file changes on disk', async () => {
    mockReadTextFile
      .mockResolvedValueOnce('# Rule v1')
      .mockResolvedValueOnce('# Rule v2')

    render(
      <RulesPage
        storedPaths={storedPaths}
        onPathChange={vi.fn()}
        onAddPath={vi.fn()}
        onDeletePath={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    const editor = await screen.findByTestId('codemirror')
    await waitFor(() => {
      expect(editor).toHaveValue('# Rule v1')
      expect(watchCallbacks).toHaveLength(1)
    })

    await act(async () => {
      await watchCallbacks[0]?.({ kind: { type: 'modify' } })
    })

    await waitFor(() => {
      expect(editor).toHaveValue('# Rule v2')
    })
  })

  it('does not overwrite unsaved draft content when the file changes externally', async () => {
    mockReadTextFile
      .mockResolvedValueOnce('# Rule v1')
      .mockResolvedValueOnce('# Rule external')

    render(
      <RulesPage
        storedPaths={storedPaths}
        onPathChange={vi.fn()}
        onAddPath={vi.fn()}
        onDeletePath={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    const editor = await screen.findByTestId('codemirror')
    await waitFor(() => {
      expect(editor).toHaveValue('# Rule v1')
      expect(watchCallbacks).toHaveLength(1)
    })

    await userEvent.type(editor, '\nlocal draft')
    await waitFor(() => {
      expect(screen.getByText('有未保存改动')).toBeInTheDocument()
    })

    await act(async () => {
      await watchCallbacks[0]?.({ kind: { type: 'modify' } })
    })

    expect(editor).toHaveValue('# Rule v1\nlocal draft')
    expect(mockReadTextFile).toHaveBeenCalledTimes(1)
  })
})
