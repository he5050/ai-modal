import { createElement } from 'react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'

vi.mock('animejs', () => ({
  animate: () => undefined,
  spring: () => ({}),
}))

vi.mock('@uiw/react-codemirror', () => ({
  default: ({
    value,
    onChange,
    placeholder,
    className,
  }: {
    value?: string
    onChange?: (value: string) => void
    placeholder?: string
    className?: string
  }) =>
    createElement('textarea', {
      'data-testid': 'codemirror',
      value: value ?? '',
      onChange: (event: Event) =>
        onChange?.((event.target as HTMLTextAreaElement).value),
      placeholder,
      className,
    }),
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
})
