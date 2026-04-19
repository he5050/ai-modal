import { useState, useRef, useEffect } from "react"
import { Copy, Check } from "lucide-react"
import { animate, spring } from "animejs"
import { BUTTON_GHOST_CLASS } from "../lib/buttonStyles"
import { toast } from "../lib/toast"
import { Tooltip } from "./Tooltip"

export function CopyButton({ text, message = "已复制到剪贴板" }: { text: string; message?: string }) {
  const [copied, setCopied] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast(message, "success")
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast("复制失败，请重试", "error")
    }
  }

  useEffect(() => {
    if (!btnRef.current) return
    if (copied) {
      animate(btnRef.current, {
        scale: [1, 1.4, 1],
        ease: spring({ stiffness: 400, damping: 10 }),
        duration: 400,
      })
    }
  }, [copied])

  return (
    <Tooltip content="复制" placement="top">
      <button
        ref={btnRef}
        onClick={handleCopy}
        className={`${BUTTON_GHOST_CLASS} h-7 w-7 rounded-md p-0 text-gray-500 hover:text-gray-300`}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </Tooltip>
  )
}
