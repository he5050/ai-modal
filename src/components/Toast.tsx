import { useState, useEffect, useRef } from "react"
import { listenToast } from "../lib/toast"
import type { ToastItem } from "../lib/toast"
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react"
import { animate, spring } from "animejs"

const ICONS = {
  success: <CheckCircle className="w-4 h-4 text-emerald-400" />,
  error:   <XCircle className="w-4 h-4 text-red-400" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400" />,
  info:    <Info className="w-4 h-4 text-indigo-400" />,
}

const COLORS = {
  success: "border-emerald-500/30 bg-emerald-500/10",
  error:   "border-red-500/30 bg-red-500/10",
  warning: "border-amber-500/30 bg-amber-500/10",
  info:    "border-indigo-500/30 bg-indigo-500/10",
}

const LEFT_BORDER = {
  success: "border-l-emerald-500",
  error:   "border-l-red-500",
  warning: "border-l-amber-500",
  info:    "border-l-indigo-500",
}

function ToastEl({ item, onRemove }: { item: ToastItem; onRemove: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  // 入场动效：从右侧滑入 + 淡入 + spring
  useEffect(() => {
    if (!ref.current) return
    animate(ref.current, {
      opacity: [0, 1],
      translateX: [32, 0],
      ease: spring({ stiffness: 320, damping: 20 }),
      duration: 500,
    })
  }, [])

  // 自动消失
  useEffect(() => {
    const t = setTimeout(() => handleRemove(), 3000)
    return () => clearTimeout(t)
  }, [item.id])

  function handleRemove() {
    if (!ref.current) { onRemove(item.id); return }
    animate(ref.current, {
      opacity: [1, 0],
      translateX: [0, 24],
      scale: [1, 0.95],
      ease: "outQuad",
      duration: 200,
      onComplete: () => onRemove(item.id),
    })
  }

  return (
    <div
      ref={ref}
      style={{ opacity: 0 }}
      className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border border-l-2 shadow-lg text-sm text-gray-100 min-w-[220px] max-w-sm ${COLORS[item.type]} ${LEFT_BORDER[item.type]}`}
    >
      {ICONS[item.type]}
      <span className="flex-1">{item.message}</span>
      <button onClick={handleRemove} className="ml-auto text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    return listenToast(item => {
      setItems(prev => [...prev, item])
    })
  }, [])

  function remove(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 items-end">
      {items.map(item => (
        <ToastEl key={item.id} item={item} onRemove={remove} />
      ))}
    </div>
  )
}
