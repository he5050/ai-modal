import { homeDir } from "@tauri-apps/api/path";

/**
 * 缓存 homeDir() 结果，避免多个 hook/component 各自重复调用 Tauri FFI。
 * 首次调用触发实际 FFI，后续调用返回同一 Promise。
 */
let cachedPromise: Promise<string> | null = null;

export function getHomePath(): Promise<string> {
  if (!cachedPromise) {
    cachedPromise = homeDir().catch(() => "");
  }
  return cachedPromise;
}
