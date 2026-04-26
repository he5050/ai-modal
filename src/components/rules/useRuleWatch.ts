import { useEffect, type RefObject } from "react";
import { dirname } from "@tauri-apps/api/path";
import { watch } from "@tauri-apps/plugin-fs";
import { toast } from "../../lib/toast";
import { logger } from "../../lib/devlog";
import {
  normalizeText,
  detectExists,
  summarizeWatchError,
  formatWatchEventType,
} from "./utils";
import type { Tool } from "./useRuleFile";

interface UseRuleWatchOptions {
  selectedTool: Tool | null;
  homePath: string;
  dirtyRef: RefObject<boolean>;
  refreshCurrent: (tool: Tool, targetPath?: string) => Promise<void>;
}

export function useRuleWatch({
  selectedTool,
  homePath,
  dirtyRef,
  refreshCurrent,
}: UseRuleWatchOptions) {
  useEffect(() => {
    if (!selectedTool || !homePath || selectedTool.kind === "directory") {
      return;
    }

    // After the early return above, selectedTool is guaranteed non-null
    const tool = selectedTool!;

    const targetPath = normalizeText(
      (() => {
        const raw = tool.path;
        return raw.startsWith("~/") ? `${homePath}${raw.slice(1)}` : raw;
      })(),
    );
    if (!targetPath) return;

    let disposed = false;
    let unwatch: (() => void) | null = null;
    let pollTimer: number | null = null;

    function stopPolling() {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
        logger.debug(`[规则监听] 已停止轮询: ${targetPath}`);
      }
    }

    function startPolling(reason: string) {
      if (pollTimer !== null) return;

      logger.warn(
        `[规则监听] 已降级为轮询: target=${targetPath} reason=${reason}`,
      );
      pollTimer = window.setInterval(() => {
        if (disposed || dirtyRef.current) return;
        void refreshCurrent(tool, targetPath);
      }, 1500);
    }

    async function bindWatcher() {
      const targetExists = await detectExists(targetPath);
      const watchPath = targetExists ? targetPath : await dirname(targetPath);
      const watchTargetKind = targetExists ? "file" : "parent-directory";

      logger.info(
        `[规则监听] 准备绑定: target=${targetPath} watch=${watchPath} kind=${watchTargetKind} exists=${String(targetExists)}`,
      );

      try {
        unwatch = await watch(watchPath, async (event) => {
          const matched =
            targetExists ||
            event.paths.some(
              (eventPath) => normalizeText(eventPath) === targetPath,
            );

          logger.debug(
            `[规则监听] 收到事件: target=${targetPath} watch=${watchPath} type=${formatWatchEventType(event.type)} matched=${String(matched)} paths=${event.paths.join(", ") || "-"}`,
          );

          if (!matched) return;
          if (disposed) {
            logger.debug(`[规则监听] 已释放，忽略事件: ${targetPath}`);
            return;
          }
          if (dirtyRef.current) {
            logger.debug(
              `[规则监听] 存在未保存修改，忽略自动刷新: ${targetPath}`,
            );
            return;
          }

          await refreshCurrent(tool, targetPath);
        });
        logger.success(
          `[规则监听] 绑定成功: target=${targetPath} watch=${watchPath} kind=${watchTargetKind}`,
        );
      } catch (error) {
        const message = summarizeWatchError(error);
        console.error("Failed to watch rule file", error);
        logger.error(
          `[规则监听] 绑定失败: target=${targetPath} watch=${watchPath} kind=${watchTargetKind} exists=${String(targetExists)} error=${message}`,
        );
        startPolling(message);
        toast("规则文件监听失败，已降级为轮询自动刷新", "warning");
      }
    }

    void bindWatcher();

    return () => {
      disposed = true;
      stopPolling();
      logger.debug(`[规则监听] 解绑: ${targetPath}`);
      unwatch?.();
    };
  }, [homePath, selectedTool?.id, selectedTool?.path, selectedTool?.kind]);
}
