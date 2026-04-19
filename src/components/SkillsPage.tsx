import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";
import { open as pickPath } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  inspectSkillTargets,
  runSkillsCommand,
  scanLocalSkills,
  searchOnlineSkills,
  syncSkillTargets,
} from "../api";
import { loadPersistedJson, savePersistedJson } from "../lib/persistence";
import {
  FIELD_INPUT_CLASS,
  FIELD_MONO_INPUT_CLASS,
  FIELD_SELECT_CLASS,
} from "../lib/formStyles";
import { logger } from "../lib/devlog";
import {
  ACTION_GROUP_BUTTON_ACTIVE_CLASS,
  ACTION_GROUP_BUTTON_BASE_CLASS,
  ACTION_GROUP_BUTTON_INACTIVE_CLASS,
  ACTION_GROUP_WRAPPER_CLASS,
} from "../lib/actionGroupStyles";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_DANGER_OUTLINE_CLASS,
  BUTTON_ICON_SM_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../lib/buttonStyles";
import { toast } from "../lib/toast";
import { HintTooltip } from "./HintTooltip";
import type {
  OnlineSkill,
  SkillRecord,
  SkillSourceMeta,
  SkillSourceType,
  SkillTargetConfig,
  SkillTargetStatus,
  SkillsCatalogSnapshot,
  SkillsCommandAction,
  SkillsCommandRequest,
  SkillsCommandResult,
} from "../types";
import {
  Check,
  Copy,
  FilePenLine,
  FolderOpen,
  GitBranch,
  Link2,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  Upload,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const SKILL_TARGETS_KEY = "ai-modal-skill-targets";
const SKILL_TARGETS_DB_KEY = "skill_targets";
const SKILLS_CATALOG_KEY = "ai-modal-skills-catalog";
const SKILLS_CATALOG_DB_KEY = "skills_catalog";
const SKILL_SOURCES_KEY = "ai-modal-skill-sources";
const SKILL_SOURCES_DB_KEY = "skills_sources";

type InstallMode = "search" | "github" | "local" | "update" | "remove";
type SkillsTab = "list" | "manage";

type BuiltinSkillTarget = {
  id: string;
  label: string;
  relativePath: string;
  accentClass: string;
};

function formatInstalls(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const BUILTIN_TARGETS: BuiltinSkillTarget[] = [
  {
    id: "codex",
    label: "Codex",
    relativePath: ".codex/skills",
    accentClass: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  },
  {
    id: "claude",
    label: "Claude",
    relativePath: ".claude/skills",
    accentClass: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
  },
  {
    id: "gemini",
    label: "Gemini",
    relativePath: ".gemini/skills",
    accentClass: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200",
  },
  {
    id: "qwen",
    label: "Qwen",
    relativePath: ".qwen/skills",
    accentClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  },
  {
    id: "opencode",
    label: "OpenCode",
    relativePath: ".config/opencode/skills",
    accentClass: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  },
];

function createEmptyCatalog(
  sourceDir = "~/.agents/skills",
): SkillsCatalogSnapshot {
  return {
    sourceDir,
    scannedAt: null,
    totalSkills: 0,
    skills: [],
  };
}

function createEmptySkillSources(): Record<string, SkillSourceMeta> {
  return {};
}

function formatUpdatedAt(timestamp?: number | null) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

function mergeCatalogWithSources(
  catalog: SkillsCatalogSnapshot,
  sources: Record<string, SkillSourceMeta>,
): SkillsCatalogSnapshot {
  return {
    ...catalog,
    skills: catalog.skills.map((skill) => {
      const sourceMeta = sources[skill.dir];
      return {
        ...skill,
        sourceType: sourceMeta?.sourceType ?? "unknown",
        sourceValue: sourceMeta?.sourceValue ?? null,
      };
    }),
  };
}

function toAbsolutePath(path: string, homePath: string) {
  const trimmed = path.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("~/")) {
    return `${homePath}/${trimmed.slice(2)}`;
  }
  return trimmed;
}

function buildBuiltinTargets(homePath: string): SkillTargetConfig[] {
  if (!homePath) return [];
  return BUILTIN_TARGETS.map((target) => ({
    id: target.id,
    label: target.label,
    path: `${homePath}/${target.relativePath}`,
    isBuiltin: true,
    enabled: true,
  }));
}

function parseStoredTargets(raw: unknown): SkillTargetConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is SkillTargetConfig =>
        typeof item?.id === "string" &&
        typeof item?.label === "string" &&
        typeof item?.path === "string",
    )
    .map((item) => ({
      id: item.id,
      label: item.label,
      path: item.path,
      isBuiltin: item.isBuiltin === true,
      enabled: item.enabled !== false,
    }));
}

function parseNameList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sourceNeedsWildcard(source: string) {
  const trimmed = source.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/") || trimmed.startsWith("~/")) return false;
  if (trimmed.includes("/tree/") && trimmed.includes("/skills/")) return false;
  return true;
}

function describeSkillsCommand(request: SkillsCommandRequest) {
  if (request.action === "add") {
    return request.source ? `安装来源：${request.source}` : "安装技能";
  }
  if (request.action === "remove") {
    return request.skillNames?.length
      ? `移除技能：${request.skillNames.join("、")}`
      : "移除技能";
  }
  return "更新全部技能";
}

export function SkillsPage({
  onDirtyChange,
}: {
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [homePath, setHomePath] = useState("");
  const [targetsReady, setTargetsReady] = useState(false);
  const [targets, setTargets] = useState<SkillTargetConfig[]>([]);
  const [skillSources, setSkillSources] = useState<
    Record<string, SkillSourceMeta>
  >({});
  const [targetStatuses, setTargetStatuses] = useState<
    Record<string, SkillTargetStatus>
  >({});
  const [catalog, setCatalog] = useState<SkillsCatalogSnapshot | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [checkingTargets, setCheckingTargets] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [commandRunning, setCommandRunning] = useState(false);
  const [commandResult, setCommandResult] =
    useState<SkillsCommandResult | null>(null);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [selectedTab, setSelectedTab] = useState<SkillsTab>("list");
  const [installMode, setInstallMode] = useState<InstallMode>("search");
  const [githubSource, setGithubSource] = useState("");
  const [localSource, setLocalSource] = useState("");
  const [removeNames, setRemoveNames] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customPath, setCustomPath] = useState("");
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [pathDraft, setPathDraft] = useState("");

  // Online search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<OnlineSkill[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchDuration, setSearchDuration] = useState<number | null>(null);
  const [searched, setSearched] = useState(false);

  // Command log collapsed state
  const [commandLogExpanded, setCommandLogExpanded] = useState(false);

  useEffect(() => {
    onDirtyChange(false);
    return () => onDirtyChange(false);
  }, [onDirtyChange]);

  useEffect(() => {
    let active = true;

    async function bootstrapTargets() {
      try {
        const [home, raw, storedSources, storedCatalog] = await Promise.all([
          homeDir().catch(() => ""),
          loadPersistedJson<unknown[]>(
            SKILL_TARGETS_DB_KEY,
            SKILL_TARGETS_KEY,
            [],
          ),
          loadPersistedJson<Record<string, SkillSourceMeta>>(
            SKILL_SOURCES_DB_KEY,
            SKILL_SOURCES_KEY,
            createEmptySkillSources(),
          ),
          loadPersistedJson<SkillsCatalogSnapshot>(
            SKILLS_CATALOG_DB_KEY,
            SKILLS_CATALOG_KEY,
            createEmptyCatalog(),
          ),
        ]);
        if (!active) return;

        const builtins = buildBuiltinTargets(home);
        const stored = parseStoredTargets(raw);
        const mergedBuiltins = builtins.map((builtin) => ({
          ...builtin,
          path:
            stored.find((item) => item.id === builtin.id)?.path?.trim() ||
            builtin.path,
          enabled:
            stored.find((item) => item.id === builtin.id)?.enabled ??
            builtin.enabled,
        }));
        const customTargets = stored.filter((item) => !item.isBuiltin);

        setHomePath(home);
        setTargets([...mergedBuiltins, ...customTargets]);
        setSkillSources(storedSources);
        setCatalog(
          storedCatalog && storedCatalog.sourceDir
            ? mergeCatalogWithSources(storedCatalog, storedSources)
            : createEmptyCatalog(
                home ? `${home}/.agents/skills` : "~/.agents/skills",
              ),
        );
      } catch (error) {
        console.error("Failed to bootstrap skill targets", error);
        toast("读取技能目标失败", "error");
      } finally {
        if (active) setTargetsReady(true);
      }
    }

    void bootstrapTargets();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!targetsReady) return;
    void savePersistedJson(
      SKILL_TARGETS_DB_KEY,
      targets,
      SKILL_TARGETS_KEY,
    ).catch((error) => {
      console.error("Failed to persist skill targets", error);
    });
  }, [targets, targetsReady]);

  useEffect(() => {
    if (!targetsReady) return;
    void savePersistedJson(
      SKILL_SOURCES_DB_KEY,
      skillSources,
      SKILL_SOURCES_KEY,
    ).catch((error) => {
      console.error("Failed to persist skill sources", error);
    });
  }, [skillSources, targetsReady]);

  async function refreshCatalog(nextSources?: Record<string, SkillSourceMeta>) {
    setLoadingCatalog(true);
    try {
      const next = await scanLocalSkills();
      const mergedSources = nextSources ?? skillSources;
      const mergedCatalog = mergeCatalogWithSources(next, mergedSources);
      setCatalog(mergedCatalog);
      await savePersistedJson(
        SKILLS_CATALOG_DB_KEY,
        mergedCatalog,
        SKILLS_CATALOG_KEY,
      );
    } catch (error) {
      console.error("Failed to scan local skills", error);
      toast("读取本地技能失败", "error");
    } finally {
      setLoadingCatalog(false);
    }
  }

  async function refreshTargetStatuses(nextTargets = targets) {
    if (nextTargets.length === 0) {
      setTargetStatuses({});
      return;
    }

    setCheckingTargets(true);
    try {
      const result = await inspectSkillTargets(nextTargets);
      setTargetStatuses(
        Object.fromEntries(result.map((item) => [item.id, item])),
      );
    } catch (error) {
      console.error("Failed to inspect skill targets", error);
      toast("检查技能目标状态失败", "error");
    } finally {
      setCheckingTargets(false);
    }
  }

  useEffect(() => {
    void refreshCatalog();
  }, []);

  useEffect(() => {
    if (!targetsReady) return;
    void refreshTargetStatuses();
  }, [targets, targetsReady]);
  // Auto-load top skills when switching to search tab
  useEffect(() => {
    if (installMode === "search" && !searched) {
      void handleSearch("");
    }
  }, [installMode, searched]);

  useEffect(() => {
    if (targets.length === 0) {
      setSelectedTargetId("");
      setPathDraft("");
      return;
    }

    setSelectedTargetId((prev) =>
      targets.some((item) => item.id === prev) ? prev : targets[0].id,
    );
  }, [targets]);

  useEffect(() => {
    const selected = targets.find((item) => item.id === selectedTargetId);
    setPathDraft(selected?.path ?? "");
  }, [selectedTargetId, targets]);

  const localSkills = catalog?.skills ?? [];
  const categories = useMemo(() => {
    const values = new Set<string>();
    localSkills.forEach((skill) => {
      skill.categories.forEach((category) => values.add(category));
    });
    return ["全部", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [localSkills]);

  const filteredSkills = useMemo(() => {
    return localSkills.filter((skill) => {
      const matchesQuery =
        !query.trim() ||
        skill.name.toLowerCase().includes(query.trim().toLowerCase()) ||
        skill.description.toLowerCase().includes(query.trim().toLowerCase()) ||
        skill.dir.toLowerCase().includes(query.trim().toLowerCase());
      const matchesCategory =
        selectedCategory === "全部" ||
        skill.categories.includes(selectedCategory);
      return matchesQuery && matchesCategory;
    });
  }, [localSkills, query, selectedCategory]);

  const enabledTargets = targets.filter((item) => item.enabled);
  const selectedTarget =
    targets.find((item) => item.id === selectedTargetId) ?? null;

  function setTargetEnabled(id: string, enabled: boolean) {
    setTargets((prev) =>
      prev.map((item) => (item.id === id ? { ...item, enabled } : item)),
    );
  }

  function handleDeleteCustomTarget(id: string) {
    setTargets((prev) => prev.filter((item) => item.id !== id));
  }

  async function handlePickTargetPath() {
    const selected = await pickPath({
      directory: true,
      defaultPath: selectedTarget?.path || homePath || undefined,
    });
    if (typeof selected === "string") {
      setPathDraft(selected);
    }
  }

  function handleSaveTargetPath() {
    if (!selectedTarget) return;

    const path = toAbsolutePath(pathDraft, homePath);
    if (!path) {
      toast("路径不能为空", "warning");
      return;
    }

    setTargets((prev) =>
      prev.map((item) =>
        item.id === selectedTarget.id ? { ...item, path } : item,
      ),
    );
    toast("路径已更新", "success");
  }

  async function handlePickLocalSource() {
    const selected = await pickPath({
      directory: true,
      defaultPath: homePath || undefined,
    });
    if (typeof selected === "string") {
      setLocalSource(selected);
    }
  }

  async function handleAddCustomTarget() {
    const label = customLabel.trim();
    const path = toAbsolutePath(customPath, homePath);
    if (!label || !path) {
      toast("请填写自定义目标名称和目录", "warning");
      return;
    }

    if (targets.some((item) => item.path === path)) {
      toast("目标路径已存在，请不要重复添加", "warning");
      return;
    }

    const nextTarget = {
      id: `custom-skill-target-${Date.now()}`,
      label,
      path,
      isBuiltin: false,
      enabled: true,
    };

    setTargets((prev) => [...prev, nextTarget]);
    setSelectedTargetId(nextTarget.id);
    setPathDraft(nextTarget.path);
    setCustomLabel("");
    setCustomPath("");
    setShowCustomForm(false);
  }

  // Debounce & abort controller for search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setSearched(true);

    // Cancel previous pending request
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (searchAbortRef.current) searchAbortRef.current.abort();

    // Debounce: 300ms
    searchTimerRef.current = setTimeout(async () => {
      // Mark previous in-flight request as stale
      if (searchAbortRef.current) searchAbortRef.current.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setLoadingSearch(true);
      try {
        const q = query.trim() || "skill";
        const res = await searchOnlineSkills(q, 100);
        // Ignore result if a newer search was triggered
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

  // Track which online skills are being installed
  const [installingOnlineSkillIds, setInstallingOnlineSkillIds] = useState<
    Set<string>
  >(new Set());
  // Track installation progress messages
  const [installProgress, setInstallProgress] = useState<
    Record<string, string>
  >({});
  // Track which skills have their command copied
  const [copiedSkillIds, setCopiedSkillIds] = useState<Set<string>>(new Set());
  // Track skill pending removal (confirmation state)
  const [pendingRemoveSkill, setPendingRemoveSkill] = useState<string | null>(
    null,
  );

  function confirmRemoveSkill(skillName: string) {
    setPendingRemoveSkill(skillName);
  }

  async function executeRemoveSkill(skillName: string) {
    setPendingRemoveSkill(null);
    await executeSkillsCommand(
      { action: "remove", skillNames: [skillName] },
      `已移除技能：${skillName}`,
    );
  }

  function isOnlineSkillInstalled(skill: OnlineSkill): boolean {
    const localNames = new Set(catalog?.skills.map((s) => s.name) ?? new Set());
    const localDirs = new Set(catalog?.skills.map((s) => s.dir) ?? new Set());
    const skillName = skill.name;
    const skillId = skill.skillId;
    // Check by name, skillId, or common directory patterns
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
      setCopiedSkillIds((prev) => {
        const next = new Set(prev);
        next.add(skill.skillId);
        return next;
      });
      toast("命令已复制到剪贴板", "success");

      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopiedSkillIds((prev) => {
          const next = new Set(prev);
          next.delete(skill.skillId);
          return next;
        });
      }, 2000);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = command;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      toast("命令已复制到剪贴板", "success");

      setCopiedSkillIds((prev) => {
        const next = new Set(prev);
        next.add(skill.skillId);
        return next;
      });

      setTimeout(() => {
        setCopiedSkillIds((prev) => {
          const next = new Set(prev);
          next.delete(skill.skillId);
          return next;
        });
      }, 2000);
    }
  }

  async function handleInstallOnlineSkill(skill: OnlineSkill) {
    const skillKey = skill.skillId;
    setInstallingOnlineSkillIds((prev) => {
      const next = new Set(prev);
      next.add(skillKey);
      return next;
    });

    // Set initial progress message
    setInstallProgress((prev) => ({
      ...prev,
      [skillKey]: "⬇️ 正在下载技能...",
    }));

    logger.info(`[技能安装] 开始安装: ${skill.name} (${skill.skillId})`);
    logger.debug(`[技能安装] 来源: https://github.com/${skill.source}`);
    console.log(`[技能安装] 开始安装: ${skill.name}`, {
      skillId: skill.skillId,
      source: skill.source,
      url: `https://github.com/${skill.source}`,
    });

    try {
      // Step 1: Install skill
      logger.info(`[技能安装] 执行 npx skills add 命令...`);
      setInstallProgress((prev) => ({
        ...prev,
        [skillKey]: "📦 正在安装技能到 ~/.agents/skills...",
      }));
      console.log(
        `[技能安装] 执行命令: npx -y skills add https://github.com/${skill.source} --agent * -g --skill ${skill.skillId} -y`,
      );

      // Track previous skills to detect new additions
      const previousDirs = new Set((catalog?.skills ?? []).map((s) => s.dir));

      const installResult = await runSkillsCommand({
        action: "add",
        source: `https://github.com/${skill.source}`,
        skillNames: [skill.skillId],
      });

      setCommandResult(installResult);

      // Check if installation was successful
      if (!installResult.success) {
        const errorMsg = installResult.stderr.trim() || "安装失败，未知错误";
        logger.error(`[技能安装] 安装失败: ${skill.name}`);
        logger.error(`[技能安装] stderr: ${errorMsg}`);
        console.error(`[技能安装] 安装失败:`, {
          skill: skill.name,
          stderr: errorMsg,
          stdout: installResult.stdout,
        });

        setInstallProgress((prev) => ({
          ...prev,
          [skillKey]: `❌ 安装失败: ${errorMsg.substring(0, 100)}`,
        }));

        toast(`${skill.name} 安装失败`, "error");

        // Clear progress after delay
        setTimeout(() => {
          setInstallProgress((prev) => {
            const next = { ...prev };
            delete next[skillKey];
            return next;
          });
        }, 5000);

        return; // STOP here, don't continue to sync
      }

      // Installation succeeded, refresh catalog
      logger.success(`[技能安装] ${skill.name} 安装成功`);
      if (installResult.stdout.trim()) {
        logger.debug(`[技能安装] stdout: ${installResult.stdout.trim()}`);
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

      // Step 2: Auto-sync to enabled targets
      if (enabledTargets.length > 0) {
        logger.info(`[技能安装] 开始同步到 ${enabledTargets.length} 个目标...`);
        console.log(
          `[技能安装] 同步目标: ${enabledTargets.map((t) => t.label).join(", ")}`,
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
            console.log(
              `[技能安装] 同步成功到: ${enabledTargets.map((t) => t.label).join(", ")}`,
            );
            setInstallProgress((prev) => ({
              ...prev,
              [skillKey]: `✅ 已同步到 ${enabledTargets.map((t) => t.label).join(", ")}`,
            }));
          } else {
            logger.warn(
              `[技能安装] 同步部分失败: ${failed.map((f) => f.label).join(", ")}`,
            );
            console.warn(
              `[技能安装] 同步失败: ${failed.map((f) => f.label).join(", ")}`,
              failed,
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
          console.error(`[技能安装] 同步失败:`, syncError);
          setInstallProgress((prev) => ({
            ...prev,
            [skillKey]: "❌ 同步失败，请手动点击同步按钮",
          }));
        }
      } else {
        logger.warn(`[技能安装] 未启用任何同步目标，请手动同步`);
        console.warn(`[技能安装] 未启用任何同步目标`);
        setInstallProgress((prev) => ({
          ...prev,
          [skillKey]: "⚠️ 安装成功，但未启用同步目标",
        }));
      }

      // Show final success toast
      const successMsg = `${skill.name} 安装完成${enabledTargets.length > 0 ? "并已同步" : "（请手动同步）"}`;
      console.log(`[技能安装] ✅ ${successMsg}`);
      toast(successMsg, "success");

      // Clear progress after delay
      setTimeout(() => {
        setInstallProgress((prev) => {
          const next = { ...prev };
          delete next[skillKey];
          return next;
        });
      }, 3000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[技能安装] 安装异常: ${errorMsg}`);
      console.error(`[技能安装] 安装异常:`, error);
      setInstallProgress((prev) => ({
        ...prev,
        [skillKey]: `❌ 安装失败: ${errorMsg}`,
      }));

      toast(`${skill.name} 安装失败`, "error");

      // Clear progress after delay
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

  async function handleSyncEnabledTargets() {
    if (enabledTargets.length === 0) {
      toast("请先启用至少一个同步目标", "warning");
      return;
    }

    setSyncing(true);
    try {
      const result = await syncSkillTargets(enabledTargets);
      const failed = result.filter((item) => item.errors.length > 0);
      setCommandResult({
        action: "update",
        command: [
          "sync",
          "--targets",
          enabledTargets.map((t) => t.label).join(", "),
        ],
        cwd: catalog?.sourceDir ?? "",
        success: failed.length === 0,
        code: failed.length === 0 ? 0 : 1,
        stdout: result
          .map(
            (item) =>
              `${item.label}: linked=${item.linkedCount}, replaced=${item.replacedCount}, kept=${item.keptCount}, backedUp=${item.backedUpCount}`,
          )
          .join("\n"),
        stderr: failed
          .map((item) => `${item.label}: ${item.errors.join(" | ")}`)
          .join("\n"),
        catalogRefreshed: false,
      });
      toast(
        failed.length === 0 ? "技能分发完成" : "技能分发部分失败",
        failed.length === 0 ? "success" : "warning",
      );
      await refreshTargetStatuses();
    } catch (error) {
      console.error("Failed to sync skill targets", error);
      toast("技能分发失败", "error");
    } finally {
      setSyncing(false);
    }
  }

  async function executeSkillsCommand(
    request: SkillsCommandRequest,
    successMessage = "技能命令执行完成",
    sourceMeta?: {
      sourceType: SkillSourceType;
      sourceValue?: string | null;
    },
  ) {
    setCommandRunning(true);
    logger.info(
      `[技能] 开始执行 ${request.action}，${describeSkillsCommand(request)}`,
    );
    try {
      const previousDirs = new Set(
        (catalog?.skills ?? []).map((skill) => skill.dir),
      );
      const result = await runSkillsCommand(request);
      setCommandResult(result);
      if (result.success) {
        logger.success(
          `[技能] ${request.action} 执行成功：${describeSkillsCommand(request)}`,
        );
        if (result.stdout.trim()) {
          logger.debug(`[技能] stdout: ${result.stdout.trim()}`);
        }
        if (result.stderr.trim()) {
          logger.warn(`[技能] stderr: ${result.stderr.trim()}`);
        }
      } else {
        logger.error(
          `[技能] ${request.action} 执行失败：${describeSkillsCommand(request)}`,
        );
        if (result.stderr.trim()) {
          logger.error(`[技能] stderr: ${result.stderr.trim()}`);
        }
      }
      toast(
        result.success ? successMessage : "技能命令执行失败",
        result.success ? "success" : "error",
      );
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
        // Clean up source metadata for removed skills
        const nextCatalog = await scanLocalSkills();
        const currentDirs = new Set(nextCatalog.skills.map((s) => s.dir));
        const nextSources = { ...skillSources };

        // Remove entries for directories that no longer exist
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
      await refreshTargetStatuses();
    } catch (error) {
      console.error("Failed to run skills command", error);
      logger.error(
        `[技能] ${request.action} 执行异常：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      toast("技能命令执行失败", "error");
    } finally {
      setCommandRunning(false);
    }
  }

  async function handleRunCommand(action: SkillsCommandAction) {
    const request =
      action === "add"
        ? {
            action,
            source:
              installMode === "github"
                ? githubSource.trim()
                : toAbsolutePath(localSource, homePath),
            skillNames:
              installMode === "github" &&
              sourceNeedsWildcard(githubSource.trim())
                ? ["*"]
                : undefined,
          }
        : action === "remove"
          ? {
              action,
              skillNames: parseNameList(removeNames),
            }
          : { action };

    if (action === "add" && !request.source) {
      toast("请先填写安装来源", "warning");
      return;
    }
    if (
      action === "remove" &&
      (!request.skillNames || request.skillNames.length === 0)
    ) {
      toast("请填写要移除的技能名", "warning");
      return;
    }

    await executeSkillsCommand(request);
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="shrink-0 px-6 pb-6">
        <div className="flex items-center justify-end gap-3">
          <div className={ACTION_GROUP_WRAPPER_CLASS}>
            {[
              ["list", "技能列表"],
              ["manage", "同步与安装"],
            ].map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setSelectedTab(tab as SkillsTab)}
                className={`${ACTION_GROUP_BUTTON_BASE_CLASS} ${
                  selectedTab === tab
                    ? ACTION_GROUP_BUTTON_ACTIVE_CLASS
                    : ACTION_GROUP_BUTTON_INACTIVE_CLASS
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {selectedTab === "list" && (
          <section className="rounded-2xl border border-gray-800 bg-gray-900/80 px-5 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-medium text-gray-100">
                    本地技能
                  </h3>
                  <HintTooltip content="技能源目录固定为 ~/.agents/skills，优先展示本地扫描结果与 .skill-index.json 元信息。" />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {catalog?.sourceDir || "~/.agents/skills"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-gray-700 bg-gray-950 px-2.5 py-1 text-xs text-gray-300">
                  {catalog?.totalSkills ?? 0} 个技能
                </span>
                <button
                  onClick={() => void refreshCatalog()}
                  disabled={loadingCatalog}
                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  {loadingCatalog ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                  刷新
                </button>
                <button
                  onClick={() =>
                    void openPath(
                      catalog?.sourceDir || `${homePath}/.agents/skills`,
                    )
                  }
                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  <FolderOpen className="h-4 w-4" />
                  打开目录
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索技能名、目录名或说明"
                className={`${FIELD_INPUT_CLASS} min-w-[220px] flex-1`}
              />
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                      selectedCategory === category
                        ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-100"
                        : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid max-h-[540px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-4">
              {filteredSkills.map((skill: SkillRecord) => (
                <div
                  key={skill.dir}
                  className="rounded-xl border border-gray-800 bg-black/10 px-3 py-3"
                >
                  <div className="flex h-full flex-col justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-100">
                            {skill.name}
                          </p>
                          <p className="mt-1 truncate text-[11px] text-gray-500">
                            {skill.dir}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => void openPath(skill.path)}
                            className={BUTTON_ICON_SM_CLASS}
                            title="打开技能目录"
                            aria-label={`打开 ${skill.name} 目录`}
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => confirmRemoveSkill(skill.name)}
                            disabled={commandRunning}
                            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${BUTTON_DANGER_OUTLINE_CLASS}`}
                            title="移除技能"
                            aria-label={`移除 ${skill.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {skill.version && (
                          <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-200">
                            v{skill.version}
                          </span>
                        )}
                        {skill.internal && (
                          <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-gray-400">
                            internal
                          </span>
                        )}
                        {skill.categories.slice(0, 3).map((category) => (
                          <span
                            key={category}
                            className="rounded-full border border-gray-700 bg-gray-950 px-2 py-0.5 text-[10px] text-gray-400"
                          >
                            {category}
                          </span>
                        ))}
                        {skill.categories.length > 3 && (
                          <span className="rounded-full border border-gray-700 bg-gray-950 px-2 py-0.5 text-[10px] text-gray-500">
                            +{skill.categories.length - 3}
                          </span>
                        )}
                      </div>
                      <p className="mt-3 line-clamp-3 text-xs leading-5 text-gray-400">
                        {skill.description || "暂无说明"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-gray-800 pt-2">
                      <div className="flex min-w-0 flex-col">
                        <span className="text-[11px] text-gray-500">
                          {skill.hasSkillFile ? "含 SKILL.md" : "索引项"}
                        </span>
                        {skill.updatedAt && (
                          <span className="mt-1 text-[10px] text-gray-600">
                            更新于 {formatUpdatedAt(skill.updatedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {filteredSkills.length === 0 && (
                <div className="col-span-full rounded-xl border border-dashed border-gray-800 bg-black/10 px-4 py-5 text-sm text-gray-500">
                  没有匹配的本地技能。
                </div>
              )}
            </div>
          </section>
        )}

        {selectedTab === "manage" && (
          <div className="space-y-4">
            <section className="rounded-2xl border border-gray-800 bg-gray-900/80 px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-medium text-gray-100">
                      同步目标
                    </h3>
                    <HintTooltip content="本地技能统一留在 ~/.agents/skills，选中的目标目录通过软连接分发；冲突目录会先备份再替换。" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void refreshTargetStatuses()}
                    disabled={checkingTargets}
                    className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                  >
                    {checkingTargets ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-4 w-4" />
                    )}
                    检查
                  </button>
                  <button
                    onClick={() => void handleSyncEnabledTargets()}
                    disabled={syncing || enabledTargets.length === 0}
                    className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                  >
                    {syncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                    同步已启用目标
                  </button>
                </div>
              </div>

              {/* Target overview cards */}
              {targets.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {targets.map((target) => {
                    const status = targetStatuses[target.id];
                    const accent =
                      BUILTIN_TARGETS.find((t) => t.id === target.id)
                        ?.accentClass ??
                      "border-gray-700 bg-gray-950 text-gray-300";
                    return (
                      <div
                        key={target.id}
                        className="rounded-xl border border-gray-800 bg-black/10 px-3 py-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`rounded-full border px-1.5 py-0.5 text-[10px] ${accent}`}
                          >
                            {target.label}
                          </span>
                          <button
                            onClick={() =>
                              setTargetEnabled(target.id, !target.enabled)
                            }
                            className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full border border-transparent transition-colors ${target.enabled ? "bg-indigo-600" : "bg-gray-700"}`}
                            role="switch"
                            aria-checked={target.enabled}
                          >
                            <span
                              className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition duration-200 ${target.enabled ? "translate-x-3" : "translate-x-0"}`}
                            />
                          </button>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2 text-[10px] text-gray-500">
                          <span
                            className={
                              status?.exists
                                ? "text-emerald-400"
                                : "text-red-400"
                            }
                          >
                            {status?.exists ? "存在" : "缺失"}
                          </span>
                          <span>{status?.managedCount ?? 0} 链接</span>
                          {(status?.brokenCount ?? 0) > 0 && (
                            <span className="text-amber-400">
                              {status?.brokenCount} 损坏
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Edit target inline */}
              {selectedTarget && (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedTargetId}
                      onChange={(event) => {
                        setSelectedTargetId(event.target.value);
                        const t = targets.find(
                          (item) => item.id === event.target.value,
                        );
                        if (t) setPathDraft(t.path);
                      }}
                      className={`w-36 ${FIELD_SELECT_CLASS}`}
                    >
                      {targets.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={pathDraft}
                      onChange={(event) => setPathDraft(event.target.value)}
                      placeholder="~/tool/skills"
                      className={`${FIELD_MONO_INPUT_CLASS} flex-1`}
                    />
                    <button
                      onClick={() => void handlePickTargetPath()}
                      className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                    >
                      选择目录
                    </button>
                    <button
                      onClick={handleSaveTargetPath}
                      className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                    >
                      <FilePenLine className="h-4 w-4" />
                      保存
                    </button>
                    <button
                      onClick={() => void openPath(selectedTarget.path)}
                      className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                    >
                      <FolderOpen className="h-4 w-4" />
                      打开
                    </button>
                    {!selectedTarget.isBuiltin && (
                      <button
                        onClick={() =>
                          handleDeleteCustomTarget(selectedTarget.id)
                        }
                        className={`${BUTTON_DANGER_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                      >
                        <Trash2 className="h-4 w-4" />
                        删除
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-3 rounded-xl border border-gray-800/80 bg-gray-950/30 px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-200">
                    自定义目标
                  </p>
                  {!showCustomForm ? (
                    <button
                      onClick={() => setShowCustomForm(true)}
                      className={`${BUTTON_ACCENT_OUTLINE_CLASS} h-8 px-3 text-sm`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      新增
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setShowCustomForm(false);
                        setCustomLabel("");
                        setCustomPath("");
                      }}
                      className={`${BUTTON_SECONDARY_CLASS} h-8 px-3 text-sm`}
                    >
                      取消
                    </button>
                  )}
                </div>
                {showCustomForm && (
                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    <input
                      value={customLabel}
                      onChange={(event) => setCustomLabel(event.target.value)}
                      placeholder="目标名称"
                      className={`${FIELD_INPUT_CLASS} w-40`}
                    />
                    <input
                      value={customPath}
                      onChange={(event) => setCustomPath(event.target.value)}
                      placeholder="~/custom-tool/skills"
                      className={`${FIELD_MONO_INPUT_CLASS} min-w-[260px] flex-1`}
                    />
                    <button
                      onClick={async () => {
                        const selected = await pickPath({
                          directory: true,
                          defaultPath: homePath || undefined,
                        });
                        if (typeof selected === "string")
                          setCustomPath(selected);
                      }}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
                    >
                      <FolderOpen className="h-4 w-4" />
                      选择目录
                    </button>
                    <button
                      onClick={() => void handleAddCustomTarget()}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 text-sm text-indigo-200 transition-colors hover:border-indigo-400/50 hover:text-indigo-100"
                    >
                      保存
                    </button>
                  </div>
                )}
              </div>
            </section>
            <section className="rounded-2xl border border-gray-800 bg-gray-900/80 px-5 py-5">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-medium text-gray-100">在线安装</h3>
                <HintTooltip content="浏览仓库查看技能列表、搜索 skills.sh 技能库，或通过 GitHub / 本地目录安装。安装后自动同步到已启用的目标工具。" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  ["search", "搜索技能"],
                  ["github", "GitHub 安装"],
                  ["local", "本地目录导入"],
                  ["update", "更新全部"],
                  ["remove", "移除技能"],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setInstallMode(mode as InstallMode)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                      installMode === mode
                        ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-100"
                        : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                {/* Search mode */}
                {installMode === "search" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                        <input
                          value={searchQuery}
                          onChange={(e) => void handleSearch(e.target.value)}
                          placeholder="搜索 skills.sh 上的技能..."
                          className={`${FIELD_MONO_INPUT_CLASS} pl-9`}
                        />
                      </div>
                      {loadingSearch && (
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      )}
                    </div>

                    {searchDuration !== null && (
                      <p className="text-xs text-gray-500">
                        {searchResults.length} 个结果 ({searchDuration}ms)
                      </p>
                    )}

                    {!loadingSearch && searched && searchResults.length > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        {searchResults.map((skill) => (
                          <div
                            key={skill.id}
                            className="rounded-xl border border-gray-800 bg-black/10 px-3 py-2.5"
                          >
                            {/* Progress message */}
                            {installProgress[skill.skillId] && (
                              <div className="mb-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-2 py-1 text-[10px] text-indigo-200">
                                {installProgress[skill.skillId]}
                              </div>
                            )}

                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-gray-100">
                                  {skill.name}
                                </p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <span className="rounded-full border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-[10px] text-gray-400">
                                    {formatInstalls(skill.installs)}
                                  </span>
                                  <span className="truncate rounded-full border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-200">
                                    {skill.source}
                                  </span>
                                </div>
                              </div>

                              {/* Action buttons on the right */}
                              <div className="flex flex-shrink-0 flex-col gap-1">
                                {isOnlineSkillInstalled(skill) ? (
                                  <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">
                                    <Check className="h-3 w-3" />
                                    已安装
                                  </span>
                                ) : (
                                  <>
                                    <button
                                      onClick={() =>
                                        void handleInstallOnlineSkill(skill)
                                      }
                                      disabled={
                                        commandRunning ||
                                        installingOnlineSkillIds.has(
                                          skill.skillId,
                                        )
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-200 transition-colors hover:border-indigo-400/50 hover:text-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      {installingOnlineSkillIds.has(
                                        skill.skillId,
                                      ) ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Upload className="h-3 w-3" />
                                      )}
                                      {installingOnlineSkillIds.has(
                                        skill.skillId,
                                      )
                                        ? "安装中"
                                        : "安装"}
                                    </button>
                                    <button
                                      onClick={() =>
                                        void handleCopyInstallCommand(skill)
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 px-2 py-1 text-[10px] text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
                                      title="复制安装命令"
                                    >
                                      {copiedSkillIds.has(skill.skillId) ? (
                                        <>
                                          <Check className="h-3 w-3 text-emerald-400" />
                                          <span className="text-emerald-400">
                                            已复制
                                          </span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="h-3 w-3" />
                                          命令
                                        </>
                                      )}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {!loadingSearch &&
                      searched &&
                      searchResults.length === 0 && (
                        <p className="text-xs text-gray-500">
                          未找到匹配的技能
                        </p>
                      )}

                    {!loadingSearch && !searched && (
                      <p className="text-xs text-gray-500">
                        输入关键词搜索 skills.sh 上的所有技能
                      </p>
                    )}
                  </div>
                )}

                {installMode === "github" && (
                  <div className="space-y-3">
                    <input
                      value={githubSource}
                      onChange={(event) => setGithubSource(event.target.value)}
                      placeholder="owner/repo 或 https://github.com/owner/repo"
                      className={FIELD_MONO_INPUT_CLASS}
                    />
                    <button
                      onClick={() =>
                        void executeSkillsCommand(
                          {
                            action: "add",
                            source: githubSource.trim(),
                            skillNames: sourceNeedsWildcard(githubSource.trim())
                              ? ["*"]
                              : undefined,
                          },
                          "技能命令执行完成",
                          {
                            sourceType: "github",
                            sourceValue: githubSource.trim(),
                          },
                        )
                      }
                      disabled={commandRunning}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {commandRunning ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <GitBranch className="h-4 w-4" />
                      )}
                      从 GitHub 安装
                    </button>
                  </div>
                )}

                {installMode === "local" && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <input
                        value={localSource}
                        onChange={(event) => setLocalSource(event.target.value)}
                        placeholder="/Users/you/path/to/skills-or-skill"
                        className={`${FIELD_MONO_INPUT_CLASS} min-w-[260px] flex-1`}
                      />
                      <button
                        onClick={() => void handlePickLocalSource()}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
                      >
                        <FolderOpen className="h-4 w-4" />
                        选择目录
                      </button>
                    </div>
                    <button
                      onClick={() =>
                        void executeSkillsCommand(
                          {
                            action: "add",
                            source: toAbsolutePath(localSource, homePath),
                          },
                          "技能命令执行完成",
                          {
                            sourceType: "local",
                            sourceValue: toAbsolutePath(localSource, homePath),
                          },
                        )
                      }
                      disabled={commandRunning}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {commandRunning ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      导入安装
                    </button>
                  </div>
                )}

                {installMode === "update" && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                      <p className="text-sm text-amber-200">
                        更新所有已安装的技能到最新版本
                      </p>
                      <p className="mt-1 text-xs text-amber-300/70">
                        此操作将更新 ~/.agents/skills
                        目录下的所有技能，并刷新技能目录。
                      </p>
                    </div>
                    <button
                      onClick={() => void handleRunCommand("update")}
                      disabled={commandRunning}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 text-sm text-amber-200 transition-colors hover:border-amber-400/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {commandRunning ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-4 w-4" />
                      )}
                      更新全部技能
                    </button>
                  </div>
                )}

                {installMode === "remove" && (
                  <div className="space-y-3">
                    <input
                      value={removeNames}
                      onChange={(event) => setRemoveNames(event.target.value)}
                      placeholder="输入技能名，支持逗号或换行分隔"
                      className={FIELD_MONO_INPUT_CLASS}
                    />
                    <button
                      onClick={() => void handleRunCommand("remove")}
                      disabled={commandRunning}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-500/30 px-3 text-sm text-red-200 transition-colors hover:border-red-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {commandRunning ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      移除技能
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-gray-800 bg-black/10 px-4 py-3">
                <button
                  onClick={() => setCommandLogExpanded(!commandLogExpanded)}
                  className="flex w-full items-center justify-between gap-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-500">
                      最近命令结果
                    </p>
                    <HintTooltip content="展示原始 command / stdout / stderr，避免假成功。" />
                  </div>
                  {commandLogExpanded ? (
                    <ChevronUp className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  )}
                </button>
                {commandLogExpanded && commandResult && (
                  <div className="mt-3 space-y-2">
                    <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-xs text-gray-400">
                      <div>cwd: {commandResult.cwd || "—"}</div>
                      <div className="mt-1 break-all">
                        command: {commandResult.command.join(" ")}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
                      <p className="mb-2 text-xs text-gray-500">stdout</p>
                      <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap break-words text-xs text-gray-300">
                        {commandResult.stdout || "—"}
                      </pre>
                    </div>
                    <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
                      <p className="mb-2 text-xs text-gray-500">stderr</p>
                      <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap break-words text-xs text-gray-300">
                        {commandResult.stderr || "—"}
                      </pre>
                    </div>
                  </div>
                )}
                {!commandLogExpanded && commandResult && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 ${commandResult.success ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border border-red-500/30 bg-red-500/10 text-red-300"}`}
                    >
                      {commandResult.success ? "成功" : "失败"}
                    </span>
                    <span className="font-mono text-gray-500">
                      {commandResult.command.join(" ")}
                    </span>
                  </div>
                )}
                {!commandResult && (
                  <div className="mt-3 text-sm text-gray-500">
                    还没有执行记录。
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Remove skill confirmation dialog */}
      {pendingRemoveSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white">确认移除技能</h3>
            <p className="mt-3 text-sm text-gray-400">
              确定要移除技能{" "}
              <span className="font-medium text-gray-200">
                "{pendingRemoveSkill}"
              </span>{" "}
              吗？
              <br />
              <span className="text-xs text-gray-500">
                此操作将从 ~/.agents/skills 中删除该技能及其所有同步目标。
              </span>
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setPendingRemoveSkill(null)}
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
              >
                取消
              </button>
              <button
                onClick={() => void executeRemoveSkill(pendingRemoveSkill)}
                className="flex-1 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200 transition-colors hover:border-red-400/50 hover:text-white"
              >
                确认移除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
