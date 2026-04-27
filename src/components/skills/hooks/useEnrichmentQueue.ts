import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  getSkillEnrichmentJobStatus,
  startSkillEnrichmentJob,
  stopSkillEnrichmentJob,
} from "../../../api";
import { logger } from "../../../lib/devlog";
import { toast } from "../../../lib/toast";
import { buildInstalledSkillSnapshot } from "../../../lib/skillEnrichment";
import type { LlmProfile } from "./useLlmProfile";
import type {
  SkillAnnotationMode,
  SkillEnrichmentJobRequest,
  SkillEnrichmentJobSnapshot,
  SkillRecord,
  SkillsCatalogSnapshot,
} from "../../../types";

export function useEnrichmentQueue(options: {
  selectedLlmProfile: LlmProfile | null;
  filteredSkills: SkillRecord[];
  skillEnrichments: Record<string, import("../../../types").SkillEnrichmentRecord>;
  catalog: SkillsCatalogSnapshot | null;
  enrichmentDelayMs?: number;
  onRecordsUpdate?: (
    enrichments: Record<string, import("../../../types").SkillEnrichmentRecord>,
    snapshots: Record<string, import("../../../types").InstalledSkillSnapshot>,
  ) => void;
}) {
  const {
    selectedLlmProfile,
    filteredSkills,
    skillEnrichments,
    catalog,
    enrichmentDelayMs = 5000,
    onRecordsUpdate,
  } = options;

  // ─── Stable refs for callbacks passed to the event listener ────
  // These prevent applyEnrichmentSnapshot from recreating on every render,
  // which would otherwise tear down and re-subscribe the Tauri event listener
  // and potentially drop progress events during enrichment.
  const onRecordsUpdateRef = useRef(onRecordsUpdate);
  onRecordsUpdateRef.current = onRecordsUpdate;
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  const [enrichmentQueueRunning, setEnrichmentQueueRunning] = useState(false);
  const [enrichmentQueuePhase, setEnrichmentQueuePhase] = useState<
    "idle" | "waiting" | "running" | "stopped" | "done" | "error"
  >("idle");
  const [enrichmentQueueTotal, setEnrichmentQueueTotal] = useState(0);
  const [enrichmentQueueCompleted, setEnrichmentQueueCompleted] = useState(0);
  const [currentEnrichmentSkillDir, setCurrentEnrichmentSkillDir] = useState<
    string | null
  >(null);
  const [activeEnrichmentSkillDirs, setActiveEnrichmentSkillDirs] = useState<
    string[]
  >([]);
  const [nextEnrichmentRunAt, setNextEnrichmentRunAt] = useState<number | null>(
    null,
  );
  const [enrichmentQueueMessage, setEnrichmentQueueMessage] = useState("");
  const [enrichmentQueueError, setEnrichmentQueueError] = useState<
    string | null
  >(null);
  const [enrichmentQueueRecords, setEnrichmentQueueRecords] = useState<
    Record<string, import("../../../types").SkillEnrichmentRecord>
  >({});
  const [queueNow, setQueueNow] = useState(Date.now());
  const lastEnrichmentLogKeyRef = useRef<string | null>(null);

  const incrementalAnnotationSkills = useMemo(
    () =>
      filteredSkills.filter((skill) => {
        const enrichment = skillEnrichments[skill.dir];
        if (!enrichment) return true;
        if (enrichment.status !== "success") return true;
        if (!enrichment.localizedDescription.trim()) return true;
        if (enrichment.tags.length < 2) return true;
        if ((enrichment.sourceUpdatedAt ?? null) !== (skill.updatedAt ?? null)) {
          return true;
        }
        if ((enrichment.sourceDescription ?? "") !== (skill.description ?? "")) {
          return true;
        }
        return false;
      }),
    [filteredSkills, skillEnrichments],
  );

  const applyEnrichmentSnapshot = useCallback(
    (snapshot: SkillEnrichmentJobSnapshot | null) => {
      if (!snapshot) {
        setEnrichmentQueueRunning(false);
        setEnrichmentQueuePhase("idle");
        setEnrichmentQueueTotal(0);
        setEnrichmentQueueCompleted(0);
        setCurrentEnrichmentSkillDir(null);
        setActiveEnrichmentSkillDirs([]);
        setNextEnrichmentRunAt(null);
        setEnrichmentQueueMessage("");
        setEnrichmentQueueError(null);
        setEnrichmentQueueRecords({});
        return;
      }

      const activeSkillDirs = Object.values(snapshot.records)
        .filter((record) => record.status === "running")
        .map((record) => record.skillDir)
        .sort((a, b) => a.localeCompare(b));

      const logKey = [
        snapshot.runId,
        snapshot.status,
        snapshot.completed,
        snapshot.total,
        snapshot.currentSkillDir ?? "",
        activeSkillDirs.join(","),
        snapshot.message,
        snapshot.errorMessage ?? "",
      ].join("|");
      if (lastEnrichmentLogKeyRef.current !== logKey) {
        const suffix = [
          `${snapshot.completed}/${snapshot.total}`,
          activeSkillDirs.length > 0
            ? `处理中=${activeSkillDirs.join("、")}`
            : snapshot.currentSkillDir
              ? `当前=${snapshot.currentSkillDir}`
              : "",
          snapshot.errorMessage ? `错误=${snapshot.errorMessage}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        const text = `[技能注解] ${snapshot.message}${suffix ? ` | ${suffix}` : ""}`;
        if (snapshot.status === "error") {
          logger.error(text);
        } else if (snapshot.status === "done" && snapshot.errorMessage) {
          logger.warn(text);
        } else if (snapshot.status === "done") {
          logger.success(text);
        } else if (snapshot.status === "stopped") {
          logger.warn(text);
        } else {
          logger.info(text);
        }
        lastEnrichmentLogKeyRef.current = logKey;
      }

      setEnrichmentQueueRunning(
        snapshot.status === "running" || snapshot.status === "waiting",
      );
      setEnrichmentQueuePhase(snapshot.status);
      setEnrichmentQueueTotal(snapshot.total);
      setEnrichmentQueueCompleted(snapshot.completed);
      setCurrentEnrichmentSkillDir(snapshot.currentSkillDir ?? null);
      setActiveEnrichmentSkillDirs(activeSkillDirs);
      setNextEnrichmentRunAt(snapshot.nextRunAt ?? null);
      setEnrichmentQueueMessage(snapshot.message);
      setEnrichmentQueueError(snapshot.errorMessage ?? null);
      setEnrichmentQueueRecords(snapshot.records);
      if (Object.keys(snapshot.records).length > 0) {
        const currentCatalog = catalogRef.current;
        const currentOnRecordsUpdate = onRecordsUpdateRef.current;
        const snapshots: Record<string, import("../../../types").InstalledSkillSnapshot> = {};
        for (const [skillDir, enrRecord] of Object.entries(snapshot.records)) {
          const skill = (currentCatalog?.skills ?? []).find(
            (item) => item.dir === skillDir,
          );
          if (skill) {
            snapshots[skillDir] = buildInstalledSkillSnapshot(skill, enrRecord);
          }
        }
        currentOnRecordsUpdate?.(snapshot.records, snapshots);
      }
    },
    [], // Stable — uses refs for onRecordsUpdate and catalog
  );

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;

    void getSkillEnrichmentJobStatus()
      .then((snapshot) => {
        if (active) applyEnrichmentSnapshot(snapshot);
      })
      .catch((error) => {
        console.error("Failed to restore skill enrichment job status", error);
      });

    void listen<SkillEnrichmentJobSnapshot>(
      "skill-enrichment-progress",
      (event) => {
        if (!active) return;
        applyEnrichmentSnapshot(event.payload);
      },
    ).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, [applyEnrichmentSnapshot]);

  useEffect(() => {
    if (!nextEnrichmentRunAt) return;
    const timer = window.setInterval(() => {
      setQueueNow(Date.now());
    }, 250);
    return () => window.clearInterval(timer);
  }, [nextEnrichmentRunAt]);

  async function stopEnrichmentQueue() {
    try {
      const snapshot = await stopSkillEnrichmentJob();
      if (snapshot) {
        applyEnrichmentSnapshot(snapshot);
      }
    } catch (error) {
      console.error("Failed to stop skill enrichment job", error);
      toast("停止技能注解失败", "error");
    }
  }

  async function handleRunEnrichmentQueue(
    mode: SkillAnnotationMode = "full",
  ) {
    const targetSkills =
      mode === "incremental" ? incrementalAnnotationSkills : filteredSkills;
    if (!selectedLlmProfile) {
      toast(
        "未解析到 AIModal 内可用的 LLM 参数，请先在配置管理中写入并保存",
        "warning",
      );
      return;
    }
    if (targetSkills.length === 0) {
      toast(
        mode === "incremental"
          ? "当前筛选结果里没有需要增量注解的技能"
          : "当前筛选结果里没有可注解的技能",
        "warning",
      );
      return;
    }

    const request: SkillEnrichmentJobRequest = {
      baseUrl: selectedLlmProfile.baseUrl,
      apiKey: selectedLlmProfile.apiKey,
      model: selectedLlmProfile.model,
      requestKind: selectedLlmProfile.requestKind as import("../../../types").LlmRequestKind,
      providerLabel: selectedLlmProfile.label,
      mode,
      delayMs: enrichmentDelayMs,
      skills: targetSkills.map((skill) => ({
        skillDir: skill.dir,
        skillPath: skill.path,
        description: skill.description,
        categories: skill.categories,
        updatedAt: skill.updatedAt ?? null,
      })),
    };

    try {
      const snapshot = await startSkillEnrichmentJob(request);
      applyEnrichmentSnapshot(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("已有技能注解任务正在运行")) {
        const snapshot = await getSkillEnrichmentJobStatus();
        if (snapshot) {
          applyEnrichmentSnapshot(snapshot);
        }
        toast(message, "warning");
        return;
      }
      console.error("Failed to start skill enrichment job", error);
      toast(`启动技能注解失败：${message}`, "error");
    }
  }

  const nextEnrichmentSeconds = nextEnrichmentRunAt
    ? Math.max(0, Math.ceil((nextEnrichmentRunAt - queueNow) / 1000))
    : null;

  const enrichmentActiveSummary =
    activeEnrichmentSkillDirs.length > 0
      ? ` · 当前 ${activeEnrichmentSkillDirs.length} 个：${activeEnrichmentSkillDirs.join("、")}`
      : currentEnrichmentSkillDir
        ? ` · 当前 ${currentEnrichmentSkillDir}`
        : "";

  const enrichmentProgressPercent =
    enrichmentQueueTotal > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round((enrichmentQueueCompleted / enrichmentQueueTotal) * 100),
          ),
        )
      : 0;

  const failedEnrichmentRecords = Object.values(enrichmentQueueRecords)
    .filter((record) => record.status === "error")
    .sort((left, right) => left.skillDir.localeCompare(right.skillDir));

  const shouldShowEnrichmentQueue =
    enrichmentQueuePhase !== "idle" &&
    !(
      enrichmentQueuePhase === "done" &&
      !enrichmentQueueError &&
      failedEnrichmentRecords.length === 0
    );

  return {
    enrichmentQueueRunning,
    enrichmentQueuePhase,
    enrichmentQueueTotal,
    enrichmentQueueCompleted,
    currentEnrichmentSkillDir,
    activeEnrichmentSkillDirs,
    nextEnrichmentRunAt,
    enrichmentQueueMessage,
    enrichmentQueueError,
    enrichmentQueueRecords,
    enrichmentProgressPercent,
    nextEnrichmentSeconds,
    enrichmentActiveSummary,
    shouldShowEnrichmentQueue,
    failedEnrichmentRecords,
    incrementalAnnotationSkills,
    applyEnrichmentSnapshot,
    stopEnrichmentQueue,
    handleRunEnrichmentQueue,
  };
}
