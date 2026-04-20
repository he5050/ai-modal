import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DetectPage } from '../DetectPage'
import type { Provider } from '../../types'

const {
  mockOpenPath,
  mockListModelsByProvider,
  mockTestSingleModelByProvider,
  mockToast,
  mockOpenExternalUrl,
  mockLogger,
} = vi.hoisted(() => ({
  mockOpenPath: vi.fn(),
  mockListModelsByProvider: vi.fn(),
  mockTestSingleModelByProvider: vi.fn(),
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

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: mockOpenPath,
}))

vi.mock('../../api', () => ({
  listModelsByProvider: mockListModelsByProvider,
  testSingleModelByProvider: mockTestSingleModelByProvider,
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
      results: [],
    },
    ...overrides,
  }
}

describe('DetectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens models page from the primary action', async () => {
    const onOpenModels = vi.fn()

    render(
      <DetectPage
        providers={[]}
        editTarget={null}
        onClearEditTarget={vi.fn()}
        onAddProvider={vi.fn()}
        onEditProvider={vi.fn()}
        onDeleteProvider={vi.fn()}
        onSaveResult={vi.fn()}
        onDirtyChange={vi.fn()}
        onOpenModels={onOpenModels}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '前往模型列表' }))

    expect(onOpenModels).toHaveBeenCalledTimes(1)
  })

  it('loads recent provider history into the form when clicking a recent row', async () => {
    const provider = createProvider({
      name: 'History Provider',
      baseUrl: 'https://history.example.com/v1',
      apiKey: 'sk-history',
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
    })

    render(
      <DetectPage
        providers={[provider]}
        editTarget={null}
        onClearEditTarget={vi.fn()}
        onAddProvider={vi.fn()}
        onEditProvider={vi.fn()}
        onDeleteProvider={vi.fn()}
        onSaveResult={vi.fn()}
        onDirtyChange={vi.fn()}
        onOpenModels={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByText('History Provider'))

    await waitFor(() => {
      expect(screen.getByDisplayValue('History Provider')).toBeInTheDocument()
      expect(
        screen.getByDisplayValue('https://history.example.com/v1'),
      ).toBeInTheDocument()
    })
  })

  it('confirms and deletes a recent provider', async () => {
    const provider = createProvider()
    const onDeleteProvider = vi.fn()

    render(
      <DetectPage
        providers={[provider]}
        editTarget={null}
        onClearEditTarget={vi.fn()}
        onAddProvider={vi.fn()}
        onEditProvider={vi.fn()}
        onDeleteProvider={onDeleteProvider}
        onSaveResult={vi.fn()}
        onDirtyChange={vi.fn()}
        onOpenModels={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(await screen.findByText('确认删除')).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: '删除' })[1])

    expect(onDeleteProvider).toHaveBeenCalledWith('provider-1')
    expect(mockToast).toHaveBeenCalledWith('「Demo Provider」已删除', 'info')
  })
})
