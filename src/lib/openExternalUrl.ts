import { openUrl } from "@tauri-apps/plugin-opener";
import { logger } from "./devlog";
import { toast } from "./toast";

export async function openExternalUrl(url: string) {
  const target = url.trim();
  if (!target) {
    logger.warn("[外链打开] URL 为空，已跳过");
    toast("URL 为空，无法打开", "warning");
    return;
  }

  logger.info(`[外链打开] 准备打开：${target}`);
  try {
    await openUrl(target);
    logger.success(`[外链打开] 已调用系统浏览器：${target}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[外链打开] 打开失败：${target} -> ${message}`);
    toast(`打开失败：${message}`, "error");
  }
}
