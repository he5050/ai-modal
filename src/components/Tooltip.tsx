import { useState, useRef, useEffect, useCallback, cloneElement } from "react"
import { createPortal } from "react-dom"

type Placement = "top" | "bottom" | "left" | "right"

interface TooltipProps {
  content: React.ReactNode
  placement?: Placement
  delay?: number
  children: React.ReactElement
  disabled?: boolean
}

interface Pos {
  top: number
  left: number
  actualPlacement: Placement
}

function calcPos(trigger: DOMRect, tooltip: DOMRect, preferred: Placement, gap = 8): Pos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const margin = 6

  const candidates: Placement[] = [preferred, "top", "bottom", "right", "left"]
  for (const p of candidates) {
    let top = 0
    let left = 0
    if (p === "top") {
      top = trigger.top - tooltip.height - gap
      left = trigger.left + trigger.width / 2 - tooltip.width / 2
    } else if (p === "bottom") {
      top = trigger.bottom + gap
      left = trigger.left + trigger.width / 2 - tooltip.width / 2
    } else if (p === "left") {
      top = trigger.top + trigger.height / 2 - tooltip.height / 2
      left = trigger.left - tooltip.width - gap
    } else {
      top = trigger.top + trigger.height / 2 - tooltip.height / 2
      left = trigger.right + gap
    }
    left = Math.min(Math.max(left, margin), vw - tooltip.width - margin)
    top = Math.min(Math.max(top, margin), vh - tooltip.height - margin)
    if (
      top >= margin &&
      left >= margin &&
      top + tooltip.height <= vh - margin &&
      left + tooltip.width <= vw - margin
    ) {
      return { top, left, actualPlacement: p }
    }
  }
  const top = Math.max(trigger.top - tooltip.height - gap, margin)
  const left = Math.min(
    Math.max(trigger.left + trigger.width / 2 - tooltip.width / 2, margin),
    vw - tooltip.width - margin
  )
  return { top, left, actualPlacement: "top" }
}

function Arrow({ placement }: { placement: Placement }) {
  const base = "absolute w-0 h-0 pointer-events-none"
  const color = "#1f2937" // gray-800
  if (placement === "top") {
    return (
      <span
        className={base}
        style={{
          bottom: -5, left: "50%", transform: "translateX(-50%)",
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
          borderTop: `5px solid ${color}`,
        }}
      />
    )
  }
  if (placement === "bottom") {
    return (
      <span
        className={base}
        style={{
          top: -5, left: "50%", transform: "translateX(-50%)",
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
          borderBottom: `5px solid ${color}`,
        }}
      />
    )
  }
  if (placement === "left") {
    return (
      <span
        className={base}
        style={{
          right: -5, top: "50%", transform: "translateY(-50%)",
          borderTop: "5px solid transparent",
          borderBottom: "5px solid transparent",
          borderLeft: `5px solid ${color}`,
        }}
      />
    )
  }
  return (
    <span
      className={base}
      style={{
        left: -5, top: "50%", transform: "translateY(-50%)",
        borderTop: "5px solid transparent",
        borderBottom: "5px solid transparent",
        borderRight: `5px solid ${color}`,
      }}
    />
  )
}

export function Tooltip({
  content,
  placement = "top",
  delay = 100,
  children,
  disabled = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<Pos | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reposition = useCallback(() => {
    const triggerEl = triggerRef.current
    const tooltipEl = tooltipRef.current
    if (!triggerEl || !tooltipEl) return
    const triggerRect = triggerEl.getBoundingClientRect()
    const tooltipRect = tooltipEl.getBoundingClientRect()
    setPos(calcPos(triggerRect, tooltipRect, placement))
  }, [placement])

  useEffect(() => {
    if (!visible) return
    // RAF ensures tooltip is painted and has real dimensions before positioning
    const id = requestAnimationFrame(() => {
      reposition()
    })
    return () => cancelAnimationFrame(id)
  }, [visible, reposition])

  function show() {
    if (disabled || !content) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(true), delay)
  }

  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
    setPos(null)
  }

  const child = cloneElement(children, {
    ref: (el: HTMLElement | null) => {
      triggerRef.current = el
      // forward existing ref
      const existingRef = (children as { ref?: React.Ref<HTMLElement> }).ref
      if (typeof existingRef === "function") existingRef(el)
      else if (existingRef && "current" in existingRef) {
        (existingRef as React.MutableRefObject<HTMLElement | null>).current = el
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      children.props.onMouseEnter?.(e)
      show()
    },
    onMouseLeave: (e: React.MouseEvent) => {
      children.props.onMouseLeave?.(e)
      hide()
    },
    onFocus: (e: React.FocusEvent) => {
      children.props.onFocus?.(e)
      show()
    },
    onBlur: (e: React.FocusEvent) => {
      children.props.onBlur?.(e)
      hide()
    },
  })

  return (
    <>
      {child}
      {visible && createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: "fixed",
            top: pos ? pos.top : -9999,
            left: pos ? pos.left : -9999,
            zIndex: 9999,
            pointerEvents: "none",
            opacity: pos ? 1 : 0,
            transition: "opacity 0.12s ease",
          }}
          className="max-w-xs rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-xs text-gray-100 shadow-xl break-all"
        >
          {content}
          <Arrow placement={pos?.actualPlacement ?? placement} />
        </div>,
        document.body
      )}
    </>
  )
}
