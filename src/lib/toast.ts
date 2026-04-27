type ToastType = "success" | "error" | "warning" | "info"

export interface ToastItem {
  id: string
  type: ToastType
  message: string
}

const EVENT = "app-toast"
const listeners = new Set<(item: ToastItem) => void>()
const FALLBACK_CONTAINER_ID = "app-toast-fallback"

function emitToast(item: ToastItem) {
  listeners.forEach(listener => listener(item))
}

function ensureFallbackContainer() {
  if (typeof document === "undefined") return null

  let container = document.getElementById(FALLBACK_CONTAINER_ID)
  if (container) return container

  container = document.createElement("div")
  container.id = FALLBACK_CONTAINER_ID
  Object.assign(container.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    zIndex: "9999",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    alignItems: "flex-end",
    pointerEvents: "none",
  })
  document.body.appendChild(container)
  return container
}

function getFallbackAccent(type: ToastType) {
  if (type === "success") return { border: "#10b981", background: "rgba(16,185,129,0.14)" }
  if (type === "error") return { border: "#ef4444", background: "rgba(239,68,68,0.14)" }
  if (type === "warning") return { border: "#f59e0b", background: "rgba(245,158,11,0.14)" }
  return { border: "#6366f1", background: "rgba(99,102,241,0.14)" }
}

function showFallbackToast(item: ToastItem) {
  const container = ensureFallbackContainer()
  if (!container) return

  const accent = getFallbackAccent(item.type)
  const toastEl = document.createElement("div")
  toastEl.setAttribute("data-toast-fallback", item.id)
  Object.assign(toastEl.style, {
    minWidth: "220px",
    maxWidth: "360px",
    padding: "12px 14px",
    borderRadius: "12px",
    border: `1px solid ${accent.border}`,
    borderLeft: `3px solid ${accent.border}`,
    background: accent.background,
    color: "#f3f4f6",
    boxShadow: "0 10px 30px rgba(0,0,0,0.28)",
    backdropFilter: "blur(8px)",
    fontSize: "14px",
    lineHeight: "20px",
    opacity: "0",
    transform: "translateX(24px)",
    transition: "opacity 180ms ease, transform 180ms ease",
    pointerEvents: "auto",
    wordBreak: "break-word",
  })
  toastEl.textContent = item.message
  container.appendChild(toastEl)

  requestAnimationFrame(() => {
    toastEl.style.opacity = "1"
    toastEl.style.transform = "translateX(0)"
  })

  const remove = () => {
    toastEl.style.opacity = "0"
    toastEl.style.transform = "translateX(24px)"
    window.setTimeout(() => {
      toastEl.remove()
      if (!container.hasChildNodes()) {
        container.remove()
      }
    }, 180)
  }

  window.setTimeout(remove, 3000)
}

export function toast(message: string, type: ToastType = "success") {
  const item = { id: Date.now().toString(), type, message }
  emitToast(item)
  if (typeof document !== "undefined") {
    window.setTimeout(() => {
      const rendered = document.querySelector(`[data-toast-item="${item.id}"]`)
      if (!rendered) {
        showFallbackToast(item)
      }
    }, 80)
  }
}

export function listenToast(cb: (item: ToastItem) => void) {
  listeners.add(cb)
  const handler = (e: Event) => cb((e as CustomEvent<ToastItem>).detail)
  window.addEventListener(EVENT, handler)
  return () => {
    listeners.delete(cb)
    window.removeEventListener(EVENT, handler)
  }
}
