import { useEffect, useMemo, useState } from "react";
import { dirname } from "@tauri-apps/api/path";
import { mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "../../lib/toast";
import { normalizeText, toAbsolutePath } from "./utils";
import type { Tool } from "./useRuleFile";

interface UseSyncOptions {
  tools: Tool[];
  selectedId: string;
  homePath: string;
  pathDraft: string;
  fileExists: boolean;
  selectedTool: Tool | null;
}

export function useSync({
  tools,
  selectedId,
  homePath,
  pathDraft,
  fileExists,
  selectedTool,
}: UseSyncOptions) {
  const [syncTargetIds, setSyncTargetIds] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);

  const syncCandidates = useMemo(
    () =>
      tools.filter(
        (tool) => tool.id !== selectedId && tool.kind !== "directory",
      ),
    [tools, selectedId],
  );

  useEffect(() => {
    setSyncTargetIds((prev) =>
      prev.filter((id) => syncCandidates.some((tool) => tool.id === id)),
    );
  }, [syncCandidates]);

  function toggleSyncTarget(id: string) {
    setSyncTargetIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  async function executeSync(sourceContentOverride?: string) {
    if (!selectedTool || !homePath) return;
    const sourcePath = normalizeText(toAbsolutePath(pathDraft, homePath));
    const targets = syncCandidates.filter((tool) =>
      syncTargetIds.includes(tool.id),
    );

    if (!sourcePath || !fileExists) {
      toast("源文件不存在，无法同步", "warning");
      return;
    }
    if (selectedTool.kind === "directory") {
      toast("目录型规则项不能作为同步源", "warning");
      return;
    }
    if (!targets.length) {
      toast("请至少选择一个同步目标", "warning");
      return;
    }

    setSyncing(true);
    try {
      const sourceContent =
        sourceContentOverride ?? (await readTextFile(sourcePath));
      const results = await Promise.allSettled(
        targets.map(async (target) => {
          const targetPath = normalizeText(
            toAbsolutePath(target.path, homePath),
          );
          const folder = await dirname(targetPath);
          await mkdir(folder, { recursive: true });
          await writeTextFile(targetPath, sourceContent);
          return target.label;
        }),
      );

      const success = results.filter(
        (item) => item.status === "fulfilled",
      ) as PromiseFulfilledResult<string>[];
      const failed = results.filter((item) => item.status === "rejected");

      if (failed.length === 0) {
        toast(`已同步到 ${success.length} 个目标`, "success");
        return;
      }

      const names = success.map((item) => item.value).join("、");
      const failedNames = failed
        .map((_, index) => targets[index]?.label)
        .filter(Boolean)
        .join("、");
      toast(
        names
          ? `部分同步成功：${names}${failedNames ? `；失败：${failedNames}` : `，另有 ${failed.length} 个目标失败`}`
          : `同步失败：${failedNames || `${failed.length} 个目标未写入`}`,
        "warning",
      );
    } catch (error) {
      console.error("Failed to sync rule file", error);
      toast("同步失败，请检查源文件与目标路径", "error");
    } finally {
      setSyncing(false);
    }
  }

  return {
    syncCandidates,
    syncTargetIds,
    toggleSyncTarget,
    syncing,
    executeSync,
  };
}
