import { exists } from "@tauri-apps/plugin-fs";

export async function detectExists(path: string) {
  try {
    return await exists(path);
  } catch {
    return false;
  }
}
