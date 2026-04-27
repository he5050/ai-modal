import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ModelsPage } from '../ModelsPage'
import type { Provider } from '../../types'

const {
  mockSaveDialog,
  mockWriteTextFile,
  mockOpenPath,
  mockListModelsByProvider,
  mockTestModelsByProvider,
  mockTestSingleModelByProvider,
  mockSavePersistedJson,
  mockToast,
  mockOpenExternalUrl,
  mockLogger,
} = vi.hoisted(() => ({
  mockSaveDialog: vi.fn(),
  mockWriteTextFile: vi.fn(),
  mockOpenPath: vi.fn(),
  mockListModelsByProvider: vi.fn(),
  mockTestModelsByProvider: vi.fn(),
  mockTestSingleModelByProvider: vi.fn(),
  mockSavePersistedJson: vi.fn(),
  mockToast: vi.fn(),
  mockOpenExternalUrl: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: mockSaveDialog,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: mockWriteTextFile,
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: mockOpenPath,
}))

vi.mock('../../api', () => ({
  listModelsByProvider: mockListModelsByProvider,
  testModelsByProvider: mockTestModelsByProvider,
  testSingleModelByProvider: mockTestSingleModelByProvider,
}))

vi.mock('../../lib/persistence', () => ({
  savePersistedJson: mockSavePersistedJson,
}))

vi.mock('../../lib/toast', () => ({
  toast: mockToast,
}))

vi.mock('../../lib/openExternalUrl', () => ({
  openExternalUrl: mockOpenExternalUrl,
}))

vi.mock('../../lib/devlog', () => ({
  logger: mockLogger,
}))

function createProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'provider-1',
    name: 'Demo Provider',
    baseUrl: 'https://demo.example.com/v1',
    apiKey: 'sk-demo',
    createdAt: 1,
    lastResult: {
      timestamp: 1_700_000_000_000,
      results: [
        {
          model: 'gpt-4.1-mini',
          available: true,
          latency_ms: 123,
          error: null,
          response_text: 'ok',
        },
      ],
    },
    ...overrides,
  }
}

describe('ModelsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSavePersistedJson.mockResolvedValue(undefined)
  })

  it('opens detect page from the primary header action', async () => {
    const onGoDetect = vi.fn()

    render(
      <ModelsPage
        providers={[createProvider()]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSaveResult={vi.fn()}
        onImport={vi.fn()}
        onGoDetect={onGoDetect}
        onOpenDetail={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '前往模型检测' }))
    expect(onGoDetect).toHaveBeenCalledTimes(1)
  })

  it('dispatches detail and edit actions from a provider row', async () => {
    const provider = createProvider()
    const onOpenDetail = vi.fn()
    const onEdit = vi.fn()

    render(
      <ModelsPage
        providers={[provider]}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onSaveResult={vi.fn()}
        onImport={vi.fn()}
        onGoDetect={vi.fn()}
        onOpenDetail={onOpenDetail}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '详情' }))
    await userEvent.click(screen.getByRole('button', { name: '编辑' }))

    expect(onOpenDetail).toHaveBeenCalledWith(provider)
    expect(onEdit).toHaveBeenCalledWith(provider)
  })

  it('confirms and deletes a provider from the list', async () => {
    const onDelete = vi.fn()

    render(
      <ModelsPage
        providers={[createProvider()]}
        onEdit={vi.fn()}
        onDelete={onDelete}
        onSaveResult={vi.fn()}
        onImport={vi.fn()}
        onGoDetect={vi.fn()}
        onOpenDetail={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(await screen.findByText('确认删除')).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: '删除' })[1])

    expect(onDelete).toHaveBeenCalledWith('provider-1')
    expect(mockToast).toHaveBeenCalledWith('已删除', 'info')
  })
})
