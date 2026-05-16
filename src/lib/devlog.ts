type LogLevel = "debug" | "info" | "warn" | "error" | "success"

export interface LogEntry {
  id: number
  time: string
  level: LogLevel
  msg: string
}

let seq = 0

function isDebugEnabled(): boolean {
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
  error: (msg: string, err?: unknown) => {
    log("error", err ? `${msg}: ${String(err ?? "")}` : msg);
    if (!isDebugEnabled()) logger.error("[ai-modal]", msg, err ?? "");
  },
  success: (msg: string) => log("success", msg),
}
