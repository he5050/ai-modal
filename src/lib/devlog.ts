export type LogLevel = "debug" | "info" | "warn" | "error" | "success"

export interface LogEntry {
  id: number
  time: string
  level: LogLevel
  msg: string
}

let seq = 0

export function isDebugEnabled(): boolean {
  return localStorage.getItem("ai-modal-debug") === "true"
}

export function log(level: LogLevel, msg: string) {
  if (!isDebugEnabled()) return
  const entry: LogEntry = {
    id: ++seq,
    time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    level,
    msg,
  }
  window.dispatchEvent(new CustomEvent("devlog", { detail: entry }))
}

export const logger = {
  debug: (msg: string) => log("debug", msg),
  info: (msg: string) => log("info", msg),
  warn: (msg: string) => log("warn", msg),
  error: (msg: string) => log("error", msg),
  success: (msg: string) => log("success", msg),
}
