import { useState, useEffect, useRef } from "react"
import { BUTTON_GHOST_CLASS } from "../lib/buttonStyles"
import type { LogEntry } from "../lib/devlog"

const LEVEL_STYLE: Record<LogEntry["level"], string> = {
  debug:   "text-gray-500",
  info:    "text-blue-400",
  warn:    "text-yellow-400",
  error:   "text-red-400",
  success: "text-emerald-400",
}

const LEVEL_TAG: Record<LogEntry["level"], string> = {
  debug:   "DBG ",
  info:    "INFO",
  warn:    "WARN",
  error:   "ERR ",
  success: "OK  ",
}

const LEVEL_BADGE: Record<LogEntry["level"], string> = {
  debug:   "bg-gray-500/20 text-gray-400",
  info:    "bg-blue-500/20 text-blue-400",
  warn:    "bg-yellow-500/20 text-yellow-400",
  error:   "bg-red-500/20 text-red-400",
  success: "bg-emerald-500/20 text-emerald-400",
}

type Filter = "all" | LogEntry["level"]

export function DevLog() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [open, setOpen] = useState(true)
  const [filter, setFilter] = useState<Filter>("all")
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: Event) {
      const entry = (e as CustomEvent<LogEntry>).detail
      setEntries(prev => [...prev.slice(-499), entry])
    }
    window.addEventListener("devlog", handler)
    return () => window.removeEventListener("devlog", handler)
  }, [])

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [entries, open])

  function copyEntry(entry: LogEntry) {
    navigator.clipboard.writeText(`[${entry.time}] ${LEVEL_TAG[entry.level].trim()} ${entry.msg}`)
    setCopiedId(entry.id)
    setTimeout(() => setCopiedId(null), 1200)
  }

  const filtered = filter === "all" ? entries : entries.filter(e => e.level === filter)

  const counts = {
    debug:   entries.filter(e => e.level === "debug").length,
    info:    entries.filter(e => e.level === "info").length,
    warn:    entries.filter(e => e.level === "warn").length,
    error:   entries.filter(e => e.level === "error").length,
    success: entries.filter(e => e.level === "success").length,
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[560px] max-w-[calc(100vw-2rem)] font-mono text-xs">
      {/* 标题栏 */}
      <div
        className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-t-lg px-3 py-1.5 cursor-pointer select-none"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-400 font-semibold tracking-wide">DEBUG LOG</span>
          <span className="text-gray-600 text-[10px]">{entries.length} 条</span>
          {counts.error > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px]">{counts.error} ERR</span>
          )}
          {counts.warn > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-[10px]">{counts.warn} WARN</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {entries.length > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setEntries([]); setFilter("all") }}
              className={`${BUTTON_GHOST_CLASS} h-6 px-2 text-[10px] text-gray-500 hover:text-gray-300`}
            >
              清空
            </button>
          )}
          <span className="text-gray-600">{open ? "▾" : "▸"}</span>
        </div>
      </div>

      {/* 级别筛选 */}
      {open && (
        <div className="flex items-center gap-1 bg-gray-900 border-x border-gray-700 px-3 py-1.5" onClick={e => e.stopPropagation()}>
          {(["all", "debug", "info", "warn", "error", "success"] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded text-[10px] transition-colors ${
                filter === f
                  ? f === "all"
                    ? "bg-gray-700 px-2 py-0.5 text-gray-200"
                    : `${LEVEL_BADGE[f as LogEntry["level"]]} px-2 py-0.5 font-semibold`
                  : `${BUTTON_GHOST_CLASS} h-6 px-2 text-gray-500 hover:text-gray-300`
              }`}
            >
              {f === "all" ? `全部 (${entries.length})` :
               f === "debug" ? `DBG (${counts.debug})` :
               f === "info" ? `INFO (${counts.info})` :
               f === "warn" ? `WARN (${counts.warn})` :
               f === "error" ? `ERR (${counts.error})` :
               `OK (${counts.success})`}
            </button>
          ))}
        </div>
      )}

      {/* 日志列表 */}
      {open && (
        <div className="bg-gray-950 border border-t-0 border-gray-700 rounded-b-lg h-56 overflow-y-auto p-2 space-y-0.5">
          {filtered.length === 0 ? (
            <p className="text-gray-700 p-1">{entries.length === 0 ? "等待日志..." : "当前筛选无日志"}</p>
          ) : (
            filtered.map(e => (
              <div
                key={e.id}
                className="flex gap-2 leading-5 group hover:bg-gray-900/60 rounded px-1 cursor-default"
                title="点击复制"
                onClick={() => copyEntry(e)}
              >
                <span className="text-gray-600 flex-shrink-0">{e.time}</span>
                <span className={`flex-shrink-0 ${LEVEL_STYLE[e.level]}`}>{LEVEL_TAG[e.level]}</span>
                <span className="text-gray-300 break-all flex-1">{e.msg}</span>
                <span className={`flex-shrink-0 text-[10px] transition-opacity ${
                  copiedId === e.id ? "text-emerald-400 opacity-100" : "text-gray-700 opacity-0 group-hover:opacity-100"
                }`}>
                  {copiedId === e.id ? "✓" : "复制"}
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
