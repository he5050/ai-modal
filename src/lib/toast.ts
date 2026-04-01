export type ToastType = "success" | "error" | "warning" | "info"

export interface ToastItem {
  id: string
  type: ToastType
  message: string
}

const EVENT = "app-toast"

export function toast(message: string, type: ToastType = "success") {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id: Date.now().toString(), type, message } }))
}

export function listenToast(cb: (item: ToastItem) => void) {
  const handler = (e: Event) => cb((e as CustomEvent<ToastItem>).detail)
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
