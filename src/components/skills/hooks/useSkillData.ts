import { useCallback, useEffect, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";
import { open as pickPath } from "@tauri-apps/plugin-dialog";
import {
  inspectSkillTargets,
  scanLocalSkills,
  syncSkillTargets,
} from "../../../api";
import { loadPersistedJson, savePersistedJson } from "../../../lib/persistence";
import { toast } from "../../../lib/toast";
import { buildInstalledSkillSnapshots } from "../../../lib/skillEnrichment";
import {
  SKILL_TARGETS_KEY,
  SKILL_TARGETS_DB_KEY,
  SKILLS_CATALOG_KEY,
  SKILLS_CATALOG_DB_KEY,
  SKILL_SOURCES_KEY,
  SKILL_SOURCES_DB_KEY,
  SKILL_ENRICHMENTS_KEY,
  SKILL_ENRICHMENTS_DB_KEY,
  INSTALLED_SKILL_SNAPSHOTS_KEY,
  INSTALLED_SKILL_SNAPSHOTS_DB_KEY,
  LOCALIZED_ONLINE_SKILL_DETAILS_KEY,
  LOCALIZED_ONLINE_SKILL_DETAILS_DB_KEY,
  buildBuiltinTargets,
  createEmptyCatalog,
  createEmptySkillSources,
  createEmptyLocalizedOnlineSkillDetails,
  mergeCatalogWithSources,
  parseStoredTargets,
  toAbsolutePath,
} from "../constants";
import type {
  InstalledSkillSnapshot,
  LocalizedOnlineSkillDetail,
  SkillEnrichmentRecord,
  SkillSourceMeta,
  SkillTargetConfig,
  SkillTargetStatus,
  SkillsCatalogSnapshot,
} from "../../../types";

export function useSkillData() {
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
  const [skillEnrichments, setSkillEnrichments] = useState<
    Record<string, SkillEnrichmentRecord>
  >({});
  const [installedSkillSnapshots, setInstalledSkillSnapshots] = useState<
    Record<string, InstalledSkillSnapshot>
  >({});
  const [localizedOnlineSkillDetails, setLocalizedOnlineSkillDetails] =
    useState<Record<string, LocalizedOnlineSkillDetail>>({});
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [checkingTargets, setCheckingTargets] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // ─── Bootstrap ──────────────────────────────────────────────────
  useEffect(() => {
    let active = true;

    async function bootstrapTargets() {
      try {
        const [
          home,
          raw,
          storedSources,
          storedCatalog,
          storedEnrichments,
          storedInstalledSkillSnapshots,
          storedLocalizedOnlineSkillDetails,
        ] = await Promise.all([
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
          loadPersistedJson<Record<string, SkillEnrichmentRecord>>(
            SKILL_ENRICHMENTS_DB_KEY,
            SKILL_ENRICHMENTS_KEY,
            {},
          ),
          loadPersistedJson<Record<string, InstalledSkillSnapshot>>(
            INSTALLED_SKILL_SNAPSHOTS_DB_KEY,
            INSTALLED_SKILL_SNAPSHOTS_KEY,
            {},
          ),
          loadPersistedJson<Record<string, LocalizedOnlineSkillDetail>>(
            LOCALIZED_ONLINE_SKILL_DETAILS_DB_KEY,
            LOCALIZED_ONLINE_SKILL_DETAILS_KEY,
            createEmptyLocalizedOnlineSkillDetails(),
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
        setSkillEnrichments(storedEnrichments);
        const bootCatalog =
          storedCatalog && storedCatalog.sourceDir
            ? mergeCatalogWithSources(storedCatalog, storedSources)
            : createEmptyCatalog(
                home ? `${home}/.agents/skills` : "~/.agents/skills",
              );
        setCatalog(bootCatalog);
        setInstalledSkillSnapshots({
          ...storedInstalledSkillSnapshots,
          ...buildInstalledSkillSnapshots(
            bootCatalog.skills,
            storedEnrichments,
          ),
        });
        setLocalizedOnlineSkillDetails(storedLocalizedOnlineSkillDetails);
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

  // ─── Persistence ───────────────────────────────────────────────
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

  useEffect(() => {
    if (!targetsReady) return;
    void savePersistedJson(
      SKILL_ENRICHMENTS_DB_KEY,
      skillEnrichments,
      SKILL_ENRICHMENTS_KEY,
    ).catch((error) => {
      console.error("Failed to persist skill enrichments", error);
    });
  }, [skillEnrichments, targetsReady]);

  useEffect(() => {
    if (!targetsReady) return;
    void savePersistedJson(
      INSTALLED_SKILL_SNAPSHOTS_DB_KEY,
      installedSkillSnapshots,
      INSTALLED_SKILL_SNAPSHOTS_KEY,
    ).catch((error) => {
      console.error("Failed to persist installed skill snapshots", error);
    });
  }, [installedSkillSnapshots, targetsReady]);

  useEffect(() => {
    if (!targetsReady) return;
    void savePersistedJson(
      LOCALIZED_ONLINE_SKILL_DETAILS_DB_KEY,
      localizedOnlineSkillDetails,
      LOCALIZED_ONLINE_SKILL_DETAILS_KEY,
    ).catch((error) => {
      console.error("Failed to persist localized online skill details", error);
    });
  }, [localizedOnlineSkillDetails, targetsReady]);

  // ─── Catalog & targets ─────────────────────────────────────────
  const refreshCatalog = useCallback(
    async (nextSources?: Record<string, SkillSourceMeta>) => {
      setLoadingCatalog(true);
      try {
        const next = await scanLocalSkills();
        const mergedSources = nextSources ?? skillSources;
        const mergedCatalog = mergeCatalogWithSources(next, mergedSources);
        setCatalog(mergedCatalog);
        setInstalledSkillSnapshots(
          buildInstalledSkillSnapshots(mergedCatalog.skills, skillEnrichments),
        );
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
    },
    [skillEnrichments, skillSources],
  );

  const refreshTargetStatuses = useCallback(
    async (nextTargets = targets) => {
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
    },
    [targets],
  );

  useEffect(() => {
    void refreshCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!targetsReady) return;
    void refreshTargetStatuses();
  }, [targets, targetsReady, refreshTargetStatuses]);

  // ─── Sync targets ──────────────────────────────────────────────
  async function handleSyncEnabledTargets(): Promise<import("../../../types").SkillsCommandResult | null> {
    const enabledTargets = targets.filter((item) => item.enabled);
    if (enabledTargets.length === 0) {
      toast("请先启用至少一个同步目标", "warning");
      return null;
    }

    setSyncing(true);
    try {
      const result = await syncSkillTargets(enabledTargets);
      const failed = result.filter((item) => item.errors.length > 0);
      toast(
        failed.length === 0 ? "技能分发完成" : "技能分发部分失败",
        failed.length === 0 ? "success" : "warning",
      );
      await refreshTargetStatuses();
      return {
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
      };
    } catch (error) {
      console.error("Failed to sync skill targets", error);
      toast("技能分发失败", "error");
      return null;
    } finally {
      setSyncing(false);
    }
  }

  // ─── Target CRUD ───────────────────────────────────────────────
  function setTargetEnabled(id: string, enabled: boolean) {
    setTargets((prev) =>
      prev.map((item) => (item.id === id ? { ...item, enabled } : item)),
    );
  }

  function handleDeleteCustomTarget(id: string) {
    setTargets((prev) => prev.filter((item) => item.id !== id));
  }

  async function handlePickTargetPath(selectedTarget: SkillTargetConfig | null) {
    const selected = await pickPath({
      directory: true,
      defaultPath: selectedTarget?.path || homePath || undefined,
    });
    if (typeof selected === "string") {
      return selected;
    }
    return null;
  }

  function handleSaveTargetPath(
    selectedTarget: SkillTargetConfig | null,
    pathDraft: string,
  ) {
    if (!selectedTarget) return false;

    const path = toAbsolutePath(pathDraft, homePath);
    if (!path) {
      toast("路径不能为空", "warning");
      return false;
    }

    setTargets((prev) =>
      prev.map((item) =>
        item.id === selectedTarget.id ? { ...item, path } : item,
      ),
    );
    toast("路径已更新", "success");
    return true;
  }

  async function handlePickLocalSource() {
    const selected = await pickPath({
      directory: true,
      defaultPath: homePath || undefined,
    });
    if (typeof selected === "string") {
      return selected;
    }
    return null;
  }

  async function handleAddCustomTarget(label: string, path: string) {
    const trimmedLabel = label.trim();
    const absolutePath = toAbsolutePath(path, homePath);
    if (!trimmedLabel || !absolutePath) {
      toast("请填写自定义目标名称和目录", "warning");
      return null;
    }

    if (targets.some((item) => item.path === absolutePath)) {
      toast("目标路径已存在，请不要重复添加", "warning");
      return null;
    }

    const nextTarget: SkillTargetConfig = {
      id: `custom-skill-target-${Date.now()}`,
      label: trimmedLabel,
      path: absolutePath,
      isBuiltin: false,
      enabled: true,
    };

    setTargets((prev) => [...prev, nextTarget]);
    return nextTarget;
  }

  return {
    homePath,
    targetsReady,
    targets,
    setTargets,
    skillSources,
    setSkillSources,
    targetStatuses,
    catalog,
    skillEnrichments,
    setSkillEnrichments,
    installedSkillSnapshots,
    setInstalledSkillSnapshots,
    localizedOnlineSkillDetails,
    setLocalizedOnlineSkillDetails,
    loadingCatalog,
    checkingTargets,
    syncing,
    refreshCatalog,
    refreshTargetStatuses,
    handleSyncEnabledTargets,
    setTargetEnabled,
    handleDeleteCustomTarget,
    handlePickTargetPath,
    handleSaveTargetPath,
    handlePickLocalSource,
    handleAddCustomTarget,
  };
}
