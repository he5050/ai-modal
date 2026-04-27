import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { runSkillsCommand, scanLocalSkills } from "../../../api";
import { logger } from "../../../lib/devlog";
import { toast } from "../../../lib/toast";
import {
  describeSkillsCommand,
  extractNpmConfigWarnings,
  getSkillsCommandActionLabel,
  summarizeCommandFailure,
} from "../constants";
import type {
  SkillSourceMeta,
  SkillSourceType,
  SkillsCatalogSnapshot,
  SkillsCommandAction,
  SkillsCommandProgressEvent,
  SkillsCommandRequest,
  SkillsCommandResult,
} from "../../../types";

interface UseSkillCommandOptions {
  catalog: SkillsCatalogSnapshot | null;
  skillSources: Record<string, SkillSourceMeta>;
  setSkillSources: React.Dispatch<
    React.SetStateAction<Record<string, SkillSourceMeta>>
  >;
  refreshCatalog: (
    nextSources?: Record<string, SkillSourceMeta>,
  ) => Promise<void>;
  refreshTargetStatuses: () => Promise<void>;
}

export function useSkillCommand(options: UseSkillCommandOptions) {
  const {
    catalog,
    skillSources,
    setSkillSources,
    refreshCatalog,
    refreshTargetStatuses,
  } = options;

  const [commandRunning, setCommandRunning] = useState(false);
  const [commandProgress, setCommandProgress] = useState<string>("");
  const [commandProgressStage, setCommandProgressStage] = useState<string>("");
  const [commandProgressMeta, setCommandProgressMeta] = useState<{
    current: number | null;
    total: number | null;
    skillName: string | null;
  }>({
    current: null,
    total: null,
    skillName: null,
  });
  const [commandResult, setCommandResult] =
    useState<SkillsCommandResult | null>(null);
  const [commandLogExpanded, setCommandLogExpanded] = useState(false);

  // ─── Command progress event listener ───────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    void listen<SkillsCommandProgressEvent>(
      "skills-command-progress",
      (event) => {
        const payload = event.payload;
        setCommandProgress(payload.message);
        setCommandProgressStage(payload.stage);
        setCommandProgressMeta({
          current: payload.current ?? null,
          total: payload.total ?? null,
          skillName: payload.skillName ?? null,
        });
      },
    ).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  // ─── Derived values ────────────────────────────────────────────
  const commandWarnings = commandResult
    ? extractNpmConfigWarnings(commandResult.stderr)
    : { warningLines: [], remainingLines: [] };

  const commandProgressPercent =
    commandProgressMeta.current != null &&
    commandProgressMeta.total != null &&
    commandProgressMeta.total > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              (commandProgressMeta.current / commandProgressMeta.total) * 100,
            ),
          ),
        )
      : null;

  // ─── Core command execution ────────────────────────────────────
  const executeSkillsCommand = useCallback(
    async (
      request: SkillsCommandRequest,
      successMessage = "技能命令执行完成",
      sourceMeta?: {
        sourceType: SkillSourceType;
        sourceValue?: string | null;
      },
    ) => {
      setCommandRunning(true);
      const actionLabel = getSkillsCommandActionLabel(request.action);
      const commandLabel = describeSkillsCommand(request);
      setCommandProgress(`开始${actionLabel}：${commandLabel}`);
      setCommandProgressStage("starting");
      logger.info(`[技能] ${actionLabel}开始：${commandLabel}`);
      try {
        const previousDirs = new Set(
          (catalog?.skills ?? []).map((skill) => skill.dir),
        );
        const result = await runSkillsCommand(request);
        setCommandResult(result);
        const actualCommand = result.command.join(" ");
        logger.debug(`[技能] 实际命令: ${actualCommand}`);
        const { warningLines, remainingLines } = extractNpmConfigWarnings(
          result.stderr,
        );
        if (result.success) {
          logger.success(`[技能] ${actionLabel}完成：${commandLabel}`);
          if (result.stdout.trim()) {
            logger.debug(`[技能] stdout: ${result.stdout.trim()}`);
          }
          if (remainingLines.length > 0) {
            logger.warn(
              `[技能] ${actionLabel}附加输出：${remainingLines.join("\n")}`,
            );
          } else if (warningLines.length > 0) {
            logger.info(
              `[技能] stderr 含 ${warningLines.length} 条 npm 配置告警，已折叠显示；示例：${warningLines[0]}；原文可在"最近命令结果"查看`,
            );
          }
        } else {
          logger.error(
            `[技能] ${actionLabel}失败：${commandLabel}；${summarizeCommandFailure(result)}`,
          );
          if (result.stderr.trim()) {
            logger.error(`[技能] stderr: ${result.stderr.trim()}`);
          }
        }
        toast(
          result.success ? successMessage : "技能命令执行失败",
          result.success ? "success" : "error",
        );
        if (result.success) {
          setCommandProgress("正在刷新本地技能目录...");
          setCommandProgressStage("refreshing");
        } else {
          setCommandProgress(`失败：${commandLabel}`);
          setCommandProgressStage("failed");
        }
        if (result.success && request.action === "add" && sourceMeta) {
          const nextCatalog = await scanLocalSkills();
          const nextSources = { ...skillSources };
          const addedDirs = nextCatalog.skills
            .map((skill) => skill.dir)
            .filter((dir) => !previousDirs.has(dir));

          if (addedDirs.length > 0) {
            addedDirs.forEach((dir) => {
              nextSources[dir] = {
                sourceType: sourceMeta.sourceType,
                sourceValue: sourceMeta.sourceValue ?? null,
                trackedAt: Date.now(),
              };
            });
          }

          setSkillSources(nextSources);
          await refreshCatalog(nextSources);
        } else if (result.success && request.action === "remove") {
          const nextCatalog = await scanLocalSkills();
          const currentDirs = new Set(
            nextCatalog.skills.map((s) => s.dir),
          );
          const nextSources = { ...skillSources };

          Object.keys(nextSources).forEach((dir) => {
            if (!currentDirs.has(dir)) {
              delete nextSources[dir];
            }
          });

          setSkillSources(nextSources);
          await refreshCatalog(nextSources);
        } else {
          await refreshCatalog();
        }
        if (result.success) {
          setCommandProgress("正在检查同步目标状态...");
          setCommandProgressStage("checking-targets");
        }
        await refreshTargetStatuses();
        if (result.success) {
          setCommandProgress(`已完成：${commandLabel}`);
          setCommandProgressStage("done");
        }
      } catch (error) {
        console.error("Failed to run skills command", error);
        logger.error(
          `[技能] ${actionLabel}异常：${commandLabel}；${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        setCommandProgress(`异常：${commandLabel}`);
        setCommandProgressStage("failed");
        toast("技能命令执行失败", "error");
      } finally {
        setCommandRunning(false);
      }
    },
    [catalog?.skills, skillSources, setSkillSources, refreshCatalog, refreshTargetStatuses],
  );

  async function handleRunCommand(action: SkillsCommandAction) {
    setCommandProgress("");
    setCommandProgressStage("");
    setCommandProgressMeta({
      current: null,
      total: null,
      skillName: null,
    });
    const request =
      action === "add"
        ? {
            action,
            source: "", // caller must set source before calling
            skillNames: undefined as string[] | undefined,
          }
        : action === "remove"
          ? {
              action,
              skillNames: [] as string[],
            }
          : { action };

    await executeSkillsCommand(request);
  }

  return {
    commandRunning,
    commandProgress,
    commandProgressStage,
    commandProgressMeta,
    commandResult,
    setCommandResult,
    commandLogExpanded,
    setCommandLogExpanded,
    commandWarnings,
    commandProgressPercent,
    executeSkillsCommand,
    handleRunCommand,
  };
}
