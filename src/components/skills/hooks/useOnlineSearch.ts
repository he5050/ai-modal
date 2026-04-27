import { useCallback, useEffect, useRef, useState } from "react";
import { searchOnlineSkills, inspectOnlineSkill, translateOnlineSkillDetail, runSkillsCommand, scanLocalSkills, syncSkillTargets } from "../../../api";
import { logger } from "../../../lib/devlog";
import { toast } from "../../../lib/toast";
import { ONLINE_SKILL_DETAIL_PREFETCH_CONCURRENCY } from "../constants";
import type { LlmProfile } from "./useLlmProfile";
import type {
  OnlineSkill,
  SkillSourceMeta,
  SkillTargetConfig,
  SkillsCatalogSnapshot,
  SkillsCommandResult,
} from "../../../types";

interface UseOnlineSearchOptions {
  selectedLlmProfile: LlmProfile | null;
  catalog: SkillsCatalogSnapshot | null;
  skillSources: Record<string, SkillSourceMeta>;
  targets: SkillTargetConfig[];
  localizedOnlineSkillDetails: Record<string, import("../../../types").LocalizedOnlineSkillDetail>;
  setLocalizedOnlineSkillDetails: React.Dispatch<
    React.SetStateAction<Record<string, import("../../../types").LocalizedOnlineSkillDetail>>
  >;
  setSkillSources: React.Dispatch<
    React.SetStateAction<Record<string, SkillSourceMeta>>
  >;
  refreshCatalog: (nextSources?: Record<string, SkillSourceMeta>) => Promise<void>;
  refreshTargetStatuses: () => Promise<void>;
  setCommandResult: React.Dispatch<
    React.SetStateAction<SkillsCommandResult | null>
  >;
}

export function useOnlineSearch(options: UseOnlineSearchOptions) {
  const {
    selectedLlmProfile,
    catalog,
    skillSources,
    targets,
    localizedOnlineSkillDetails,
    setLocalizedOnlineSkillDetails,
    setSkillSources,
    refreshCatalog,
    refreshTargetStatuses,
    setCommandResult,
  } = options;

  // ─── Search state ──────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<OnlineSkill[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchDuration, setSearchDuration] = useState<number | null>(null);
  const [searched, setSearched] = useState(false);
  const [loadingLocalizedOnlineDetailIds, setLoadingLocalizedOnlineDetailIds] =
    useState<Set<string>>(new Set());
  const [localizedOnlineDetailErrors, setLocalizedOnlineDetailErrors] =
    useState<Record<string, string>>({});

  // ─── Install state ─────────────────────────────────────────────
  const [installingOnlineSkillIds, setInstallingOnlineSkillIds] = useState<
    Set<string>
  >(new Set());
  const [installProgress, setInstallProgress] = useState<
    Record<string, string>
  >({});
  const [copiedSkillIds, setCopiedSkillIds] = useState<Set<string>>(new Set());

  // ─── Remove state ──────────────────────────────────────────────
  const [pendingRemoveSkill, setPendingRemoveSkill] = useState<string | null>(
    null,
  );

  const prefetchingOnlineDetailIdsRef = useRef<Set<string>>(new Set());
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  // ─── Search ────────────────────────────────────────────────────
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setSearched(true);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (searchAbortRef.current) searchAbortRef.current.abort();

    searchTimerRef.current = setTimeout(async () => {
      if (searchAbortRef.current) searchAbortRef.current.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setLoadingSearch(true);
      try {
        const q = query.trim() || "skill";
        const res = await searchOnlineSkills(q, 100);
        if (controller.signal.aborted) return;
        setSearchResults(res.skills);
        setSearchDuration(res.durationMs);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Failed to search skills", err);
        toast("搜索技能失败", "error");
        setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoadingSearch(false);
        }
      }
    }, 300);
  }, []);

  // ─── Auto-load top skills ──────────────────────────────────────
  useEffect(() => {
    if (!searched) {
      void handleSearch("");
    }
  }, [searched, handleSearch]);

  // ─── Localized online skill detail ─────────────────────────────
  async function ensureLocalizedOnlineSkillDetail(skill: OnlineSkill) {
    if (localizedOnlineSkillDetails[skill.id]) return;
    if (loadingLocalizedOnlineDetailIds.has(skill.id)) return;

    if (!selectedLlmProfile) {
      setLocalizedOnlineDetailErrors((prev) => ({
        ...prev,
        [skill.id]: "未配置可用的 LLM，无法翻译在线详情",
      }));
      return;
    }

    setLoadingLocalizedOnlineDetailIds((prev) => {
      const next = new Set(prev);
      next.add(skill.id);
      return next;
    });
    setLocalizedOnlineDetailErrors((prev) => {
      const next = { ...prev };
      delete next[skill.id];
      return next;
    });

    try {
      const detail = await inspectOnlineSkill(skill.skillId, skill.source);
      const localized = await translateOnlineSkillDetail({
        baseUrl: selectedLlmProfile.baseUrl,
        apiKey: selectedLlmProfile.apiKey,
        model: selectedLlmProfile.model,
        requestKind: selectedLlmProfile.requestKind as import("../../../types").LlmRequestKind,
        providerLabel: selectedLlmProfile.label,
        skillDir: skill.id,
        skillName: skill.name,
        detail,
      });

      setLocalizedOnlineSkillDetails((prev) => ({
        ...prev,
        [skill.id]: localized,
      }));
      logger.success(
        `[技能查询] 已缓存在线详情: ${skill.name} <- ${skill.source}/${skill.skillId}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[技能查询] 在线详情加载失败: ${skill.name} - ${message}`);
      setLocalizedOnlineDetailErrors((prev) => ({
        ...prev,
        [skill.id]: message,
      }));
    } finally {
      setLoadingLocalizedOnlineDetailIds((prev) => {
        const next = new Set(prev);
        next.delete(skill.id);
        return next;
      });
    }
  }

  // ─── Prefetch online details ───────────────────────────────────
  useEffect(() => {
    if (loadingSearch || searchResults.length === 0) return;
    if (!selectedLlmProfile) return;

    const pendingSkills = searchResults.filter(
      (skill) =>
        !localizedOnlineSkillDetails[skill.id] &&
        !loadingLocalizedOnlineDetailIds.has(skill.id) &&
        !localizedOnlineDetailErrors[skill.id] &&
        !prefetchingOnlineDetailIdsRef.current.has(skill.id),
    );

    if (pendingSkills.length === 0) return;

    pendingSkills.forEach((skill) =>
      prefetchingOnlineDetailIdsRef.current.add(skill.id),
    );

    logger.info(
      `[技能查询] 后台预取详情启动: total=${pendingSkills.length} concurrency=${ONLINE_SKILL_DETAIL_PREFETCH_CONCURRENCY}`,
    );

    let cancelled = false;
    let cursor = 0;

    async function worker() {
      while (!cancelled) {
        const currentIndex = cursor;
        cursor += 1;
        if (currentIndex >= pendingSkills.length) return;

        const skill = pendingSkills[currentIndex];
        try {
          await ensureLocalizedOnlineSkillDetail(skill);
        } finally {
          prefetchingOnlineDetailIdsRef.current.delete(skill.id);
        }
      }
    }

    void Promise.all(
      Array.from(
        {
          length: Math.min(
            ONLINE_SKILL_DETAIL_PREFETCH_CONCURRENCY,
            pendingSkills.length,
          ),
        },
        () => worker(),
      ),
    ).then(() => {
      if (!cancelled) {
        logger.info(
          `[技能查询] 后台预取详情完成: total=${pendingSkills.length}`,
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    loadingLocalizedOnlineDetailIds,
    loadingSearch,
    localizedOnlineDetailErrors,
    localizedOnlineSkillDetails,
    searchResults,
    selectedLlmProfile,
  ]);

  // ─── Install helpers ───────────────────────────────────────────
  function isOnlineSkillInstalled(skill: OnlineSkill): boolean {
    const localNames = new Set(
      catalog?.skills.map((s) => s.name) ?? new Set(),
    );
    const localDirs = new Set(
      catalog?.skills.map((s) => s.dir) ?? new Set(),
    );
    const skillName = skill.name;
    const skillId = skill.skillId;
    return (
      localNames.has(skillName) ||
      localNames.has(skillId) ||
      localDirs.has(skillId)
    );
  }

  function getInstallCommand(skill: OnlineSkill): string {
    return `npx -y skills add https://github.com/${skill.source} --agent * -g --skill ${skill.skillId} -y`;
  }

  async function handleCopyInstallCommand(skill: OnlineSkill) {
    const command = getInstallCommand(skill);
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = command;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
    setCopiedSkillIds((prev) => {
      const next = new Set(prev);
      next.add(skill.skillId);
      return next;
    });
    toast("命令已复制到剪贴板", "success");

    setTimeout(() => {
      setCopiedSkillIds((prev) => {
        const next = new Set(prev);
        next.delete(skill.skillId);
        return next;
      });
    }, 2000);
  }

  async function handleInstallOnlineSkill(skill: OnlineSkill) {
    const skillKey = skill.skillId;
    setInstallingOnlineSkillIds((prev) => {
      const next = new Set(prev);
      next.add(skillKey);
      return next;
    });

    setInstallProgress((prev) => ({
      ...prev,
      [skillKey]: "⬇️ 正在下载技能...",
    }));

    logger.info(`[技能安装] 开始安装: ${skill.name} (${skill.skillId})`);
    logger.debug(`[技能安装] 来源: https://github.com/${skill.source}`);

    try {
      setInstallProgress((prev) => ({
        ...prev,
        [skillKey]: "📦 正在安装技能到 ~/.agents/skills...",
      }));

      const previousDirs = new Set(
        (catalog?.skills ?? []).map((s) => s.dir),
      );

      const installResult = await runSkillsCommand({
        action: "add",
        source: `https://github.com/${skill.source}`,
        skillNames: [skill.skillId],
      });

      setCommandResult(installResult);

      if (!installResult.success) {
        const errorMsg =
          installResult.stderr.trim() || "安装失败，未知错误";
        logger.error(`[技能安装] 安装失败: ${skill.name}`);
        logger.error(`[技能安装] stderr: ${errorMsg}`);

        setInstallProgress((prev) => ({
          ...prev,
          [skillKey]: `❌ 安装失败: ${errorMsg.substring(0, 100)}`,
        }));

        toast(`${skill.name} 安装失败`, "error");

        setTimeout(() => {
          setInstallProgress((prev) => {
            const next = { ...prev };
            delete next[skillKey];
            return next;
          });
        }, 5000);

        return; // STOP here
      }

      logger.success(`[技能安装] ${skill.name} 安装成功`);
      if (installResult.stdout.trim()) {
        logger.debug(
          `[技能安装] stdout: ${installResult.stdout.trim()}`,
        );
      }

      const nextCatalog = await scanLocalSkills();
      const nextSources = { ...skillSources };
      const addedDirs = nextCatalog.skills
        .map((s) => s.dir)
        .filter((dir) => !previousDirs.has(dir));

      if (addedDirs.length > 0) {
        addedDirs.forEach((dir) => {
          nextSources[dir] = {
            sourceType: "github",
            sourceValue: skill.source,
            trackedAt: Date.now(),
          };
        });
        setSkillSources(nextSources);
        await refreshCatalog(nextSources);
      } else {
        await refreshCatalog();
      }

      // Auto-sync to enabled targets
      const enabledTargets = targets.filter((item) => item.enabled);
      if (enabledTargets.length > 0) {
        logger.info(
          `[技能安装] 开始同步到 ${enabledTargets.length} 个目标...`,
        );
        setInstallProgress((prev) => ({
          ...prev,
          [skillKey]: `🔄 正在同步到 ${enabledTargets.map((t) => t.label).join(", ")}...`,
        }));

        try {
          const syncResult = await syncSkillTargets(enabledTargets);
          const failed = syncResult.filter((item) => item.errors.length > 0);

          if (failed.length === 0) {
            logger.success(
              `[技能安装] 同步完成: ${enabledTargets.map((t) => t.label).join(", ")}`,
            );
            setInstallProgress((prev) => ({
              ...prev,
              [skillKey]: `✅ 已同步到 ${enabledTargets.map((t) => t.label).join(", ")}`,
            }));
          } else {
            logger.warn(
              `[技能安装] 同步部分失败: ${failed.map((f) => f.label).join(", ")}`,
            );
            setInstallProgress((prev) => ({
              ...prev,
              [skillKey]: `⚠️ 同步部分失败: ${failed.map((f) => f.label).join(", ")}`,
            }));
          }

          await refreshTargetStatuses();
        } catch (syncError) {
          logger.error(
            `[技能安装] 同步失败: ${syncError instanceof Error ? syncError.message : String(syncError)}`,
          );
          setInstallProgress((prev) => ({
            ...prev,
            [skillKey]: "❌ 同步失败，请手动点击同步按钮",
          }));
        }
      } else {
        setInstallProgress((prev) => ({
          ...prev,
          [skillKey]: "⚠️ 安装成功，但未启用同步目标",
        }));
      }

      const successMsg = `${skill.name} 安装完成${enabledTargets.length > 0 ? "并已同步" : "（请手动同步）"}`;
      toast(successMsg, "success");

      setTimeout(() => {
        setInstallProgress((prev) => {
          const next = { ...prev };
          delete next[skillKey];
          return next;
        });
      }, 3000);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      logger.error(`[技能安装] 安装异常: ${errorMsg}`);
      setInstallProgress((prev) => ({
        ...prev,
        [skillKey]: `❌ 安装失败: ${errorMsg}`,
      }));

      toast(`${skill.name} 安装失败`, "error");

      setTimeout(() => {
        setInstallProgress((prev) => {
          const next = { ...prev };
          delete next[skillKey];
          return next;
        });
      }, 5000);
    } finally {
      setInstallingOnlineSkillIds((prev) => {
        const next = new Set(prev);
        next.delete(skillKey);
        return next;
      });
    }
  }

  function confirmRemoveSkill(skillName: string) {
    setPendingRemoveSkill(skillName);
  }

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    loadingSearch,
    searchDuration,
    searched,
    loadingLocalizedOnlineDetailIds,
    localizedOnlineDetailErrors,
    installingOnlineSkillIds,
    installProgress,
    copiedSkillIds,
    pendingRemoveSkill,
    setPendingRemoveSkill,
    handleSearch,
    ensureLocalizedOnlineSkillDetail,
    isOnlineSkillInstalled,
    getInstallCommand,
    handleCopyInstallCommand,
    handleInstallOnlineSkill,
    confirmRemoveSkill,
  };
}
