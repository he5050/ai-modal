import { exists } from "@tauri-apps/plugin-fs";

export function normalizeText(value: string) {
  return value.trim();
}

export function isAbsolutePath(value: string | undefined) {
  return typeof value === "string" && value.startsWith("/");
}

export function toDisplayPath(value: string, homePath: string) {
  return value.startsWith(homePath)
    ? `~${value.slice(homePath.length)}`
    : value;
}

export function toAbsolutePath(value: string, homePath: string) {
  return value.startsWith("~/") ? `${homePath}${value.slice(1)}` : value;
}

export function buildDefaultPath(homePath: string, relativePath: string) {
  return `${homePath.replace(/\/$/, "")}/${relativePath}`;
}

export async function detectExists(path: string) {
  try {
    return await exists(path);
  } catch {
    return false;
  }
}

export function summarizeWatchError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function formatWatchEventType(type: unknown) {
  if (typeof type === "string") return type;
  try {
    return JSON.stringify(type);
  } catch {
    return String(type);
  }
}
