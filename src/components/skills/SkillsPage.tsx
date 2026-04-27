import { useEffect, useMemo, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { Loader2, RefreshCcw, FolderOpen, WandSparkles, X } from "lucide-react";
import { ACTION_GROUP_BUTTON_ACTIVE_CLASS, ACTION_GROUP_BUTTON_BASE_CLASS, ACTION_GROUP_BUTTON_INACTIVE_CLASS, ACTION_GROUP_WRAPPER_CLASS } from "../../lib/actionGroupStyles";
import { BUTTON_ACCENT_OUTLINE_CLASS, BUTTON_DANGER_OUTLINE_CLASS, BUTTON_SECONDARY_CLASS, BUTTON_SIZE_XS_CLASS } from "../../lib/buttonStyles";
import { FIELD_INPUT_CLASS } from "../../lib/formStyles";
import { HintTooltip } from "../HintTooltip";
import { buildInstalledSkillSnapshot } from "../../lib/skillEnrichment";
import type { SkillRecord } from "../../types";
import type { InstallMode, SkillsTab } from "./types";
import { useLlmProfile } from "./hooks/useLlmProfile";
import { useSkillData } from "./hooks/useSkillData";
import { useEnrichmentQueue } from "./hooks/useEnrichmentQueue";
import { useSkillCommand } from "./hooks/useSkillCommand";
import { useOnlineSearch } from "./hooks/useOnlineSearch";
import { SkillCard } from "./components/SkillCard";
import { EnrichmentProgress } from "./components/EnrichmentProgress";
import { SyncTargetsSection } from "./components/SyncTargetsSection";
import { CommandLog } from "./components/CommandLog";
import { InstallModes } from "./components/InstallModes";
import { OnlineSearchPanel } from "./components/OnlineSearchPanel";
import { EnrichmentModal } from "./components/EnrichmentModal";
import { RemoveSkillDialog } from "./components/RemoveSkillDialog";

export function SkillsPage({
  onDirtyChange,
  providers: _providers = [],
  enrichmentDelayMs = 5000,
}: {
  onDirtyChange: (dirty: boolean) => void;
  providers?: import("../../types").Provider[];
  enrichmentDelayMs?: number;
}) {
  const [selectedTab, setSelectedTab] = useState<SkillsTab>("list");
  const [installMode, setInstallMode] = useState<InstallMode>("search");
  const [query, setQuery] = useState("");
  const [annotationModalOpen, setAnnotationModalOpen] = useState(false);

  // ─── Target selection state (SyncTargetsSection needs these) ────
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [pathDraft, setPathDraft] = useState("");

  // ─── Hooks ─────────────────────────────────────────────────────
  const skillData = useSkillData();
  const llm = useLlmProfile();

  const localSkills = skillData.catalog?.skills ?? [];
  const filteredSkills = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return localSkills.filter((skill) => {
      const skillSnapshot =
        skillData.installedSkillSnapshots[skill.dir] ??
        buildInstalledSkillSnapshot(skill, skillData.skillEnrichments[skill.dir] ?? null);
      const matchesQuery =
        !normalizedQuery || skillSnapshot.searchText.includes(normalizedQuery);
      return matchesQuery;
    });
  }, [skillData.installedSkillSnapshots, localSkills, query, skillData.skillEnrichments]);

  const enrichment = useEnrichmentQueue({
    selectedLlmProfile: llm.selectedLlmProfile,
    filteredSkills,
    skillEnrichments: skillData.skillEnrichments,
    catalog: skillData.catalog,
    enrichmentDelayMs,
    onRecordsUpdate: (enrichments, snapshots) => {
      skillData.setSkillEnrichments((current) => ({
        ...current,
        ...enrichments,
      }));
      skillData.setInstalledSkillSnapshots((current) => ({
        ...current,
        ...snapshots,
      }));
    },
  });

  const command = useSkillCommand({
    catalog: skillData.catalog,
    skillSources: skillData.skillSources,
    setSkillSources: skillData.setSkillSources,
    refreshCatalog: skillData.refreshCatalog,
    refreshTargetStatuses: skillData.refreshTargetStatuses,
  });

  const online = useOnlineSearch({
    selectedLlmProfile: llm.selectedLlmProfile,
    catalog: skillData.catalog,
    skillSources: skillData.skillSources,
    targets: skillData.targets,
    localizedOnlineSkillDetails: skillData.localizedOnlineSkillDetails,
    setLocalizedOnlineSkillDetails: skillData.setLocalizedOnlineSkillDetails,
    setSkillSources: skillData.setSkillSources,
    refreshCatalog: skillData.refreshCatalog,
    refreshTargetStatuses: skillData.refreshTargetStatuses,
    setCommandResult: command.setCommandResult,
  });

  // ─── Target selection sync ─────────────────────────────────────
  useEffect(() => {
    if (skillData.targets.length === 0) {
      setSelectedTargetId("");
      setPathDraft("");
      return;
    }
    setSelectedTargetId((prev) =>
      skillData.targets.some((item) => item.id === prev) ? prev : skillData.targets[0].id,
    );
  }, [skillData.targets]);

  useEffect(() => {
    const selected = skillData.targets.find((item) => item.id === selectedTargetId);
    setPathDraft(selected?.path ?? "");
  }, [selectedTargetId, skillData.targets]);

  // ─── Dirty tracking ────────────────────────────────────────────
  useEffect(() => {
    onDirtyChange(false);
    return () => onDirtyChange(false);
  }, [onDirtyChange]);

  // ─── Remove skill handler ──────────────────────────────────────
  async function executeRemoveSkill(skillName: string) {
    online.setPendingRemoveSkill(null);
    await command.executeSkillsCommand(
      { action: "remove", skillNames: [skillName] },
      `已移除技能：${skillName}`,
    );
  }

  // ─── Command progress display (in manage tab) ─────────────────
  const commandProgressPercent = command.commandProgressPercent;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="shrink-0 px-6 pb-6">
        <div className="flex items-center justify-end gap-3">
          <div className={ACTION_GROUP_WRAPPER_CLASS}>
            {([
              ["list", "技能列表"],
              ["manage", "同步与安装"],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setSelectedTab(tab)}
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
            <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-medium text-gray-100">
                    本地技能
                  </h3>
                  <HintTooltip content="技能源目录固定为 ~/.agents/skills，优先展示本地扫描结果与 .skill-index.json 元信息。" />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {skillData.catalog?.sourceDir || "~/.agents/skills"}
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-3 2xl:items-end">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="shrink-0 rounded-full border border-gray-700 bg-gray-950 px-2.5 py-1 text-xs text-gray-300">
                    {skillData.catalog?.totalSkills ?? 0} 个技能
                  </span>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <button
                      onClick={() => void skillData.refreshCatalog()}
                      disabled={skillData.loadingCatalog}
                      className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                    >
                      {skillData.loadingCatalog ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-4 w-4" />
                      )}
                      刷新
                    </button>
                    <button
                      onClick={() =>
                        void openPath(
                          skillData.catalog?.sourceDir || `${skillData.homePath}/.agents/skills`,
                        )
                      }
                      className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                    >
                      <FolderOpen className="h-4 w-4" />
                      打开目录
                    </button>
                    <button
                      onClick={() => void llm.refreshLlmProfiles()}
                      disabled={llm.loadingLlmProfiles}
                      className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                    >
                      {llm.loadingLlmProfiles ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-4 w-4" />
                      )}
                      刷新 LLM
                    </button>
                    <button
                      onClick={() => setAnnotationModalOpen(true)}
                      disabled={!llm.selectedLlmProfile}
                      className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                    >
                      {enrichment.enrichmentQueueRunning ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <WandSparkles className="h-4 w-4" />
                      )}
                      技能注解
                    </button>
                    <button
                      onClick={enrichment.stopEnrichmentQueue}
                      disabled={!enrichment.enrichmentQueueRunning}
                      className={`${BUTTON_DANGER_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                    >
                      <X className="h-4 w-4" />
                      停止
                    </button>
                  </div>
                </div>
                {enrichment.shouldShowEnrichmentQueue && (
                  <EnrichmentProgress
                    enrichmentQueueMessage={enrichment.enrichmentQueueMessage}
                    enrichmentQueuePhase={enrichment.enrichmentQueuePhase}
                    enrichmentQueueCompleted={enrichment.enrichmentQueueCompleted}
                    enrichmentQueueTotal={enrichment.enrichmentQueueTotal}
                    enrichmentActiveSummary={enrichment.enrichmentActiveSummary}
                    nextEnrichmentSeconds={enrichment.nextEnrichmentSeconds}
                    enrichmentQueueError={enrichment.enrichmentQueueError}
                    failedEnrichmentRecords={enrichment.failedEnrichmentRecords}
                    enrichmentProgressPercent={enrichment.enrichmentProgressPercent}
                    compact
                  />
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索技能名、目录名或注解快照"
                className={`${FIELD_INPUT_CLASS} min-w-[220px] flex-1`}
              />
            </div>

            <div className="mt-4 grid max-h-[540px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-4">
              {filteredSkills.map((skill: SkillRecord) => (
                <SkillCard
                  key={skill.dir}
                  skill={skill}
                  skillEnrichments={skillData.skillEnrichments}
                  commandRunning={command.commandRunning}
                  onRemove={online.confirmRemoveSkill}
                />
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
            <SyncTargetsSection
              targets={skillData.targets}
              targetStatuses={skillData.targetStatuses}
              checkingTargets={skillData.checkingTargets}
              syncing={skillData.syncing}
              homePath={skillData.homePath}
              selectedTargetId={selectedTargetId}
              pathDraft={pathDraft}
              onSetTargetEnabled={skillData.setTargetEnabled}
              onDeleteCustomTarget={skillData.handleDeleteCustomTarget}
              onSaveTargetPath={() => skillData.handleSaveTargetPath(skillData.targets.find((t) => t.id === selectedTargetId) ?? null, pathDraft)}
              onAddCustomTarget={skillData.handleAddCustomTarget}
              onSelectTargetId={setSelectedTargetId}
              onSetPathDraft={setPathDraft}
              onRefreshTargetStatuses={() => void skillData.refreshTargetStatuses()}
              onSyncEnabledTargets={() => void skillData.handleSyncEnabledTargets()}
            />

            <section className="rounded-2xl border border-gray-800 bg-gray-900/80 px-5 py-5">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-medium text-gray-100">在线安装</h3>
                <HintTooltip content="浏览仓库查看技能列表、搜索 skills.sh 技能库，或通过 GitHub / 本地目录安装。安装后自动同步到已启用的目标工具。" />
              </div>

              {command.commandProgress && (
                <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 text-sm text-indigo-100">
                  <div className="flex items-start gap-2">
                    {command.commandRunning ? (
                      <Loader2 className="mt-0.5 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCcw className="mt-0.5 h-4 w-4" />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{command.commandProgress}</span>
                        {command.commandProgressStage && (
                          <span className="rounded-full border border-indigo-400/20 bg-indigo-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-indigo-200/80">
                            {command.commandProgressStage}
                          </span>
                        )}
                      </div>
                      {command.commandProgressMeta.current != null &&
                        command.commandProgressMeta.total != null && (
                          <div className="mt-1 text-xs text-indigo-200/70">
                            当前进度：{command.commandProgressMeta.current} /{" "}
                            {command.commandProgressMeta.total}
                            {command.commandProgressMeta.skillName
                              ? ` · ${command.commandProgressMeta.skillName}`
                              : ""}
                          </div>
                        )}
                      {commandProgressPercent != null && (
                        <div className="mt-2 w-[320px] max-w-full">
                          <div className="h-1.5 overflow-hidden rounded-full bg-gray-800/80">
                            <div
                              className="h-full rounded-full bg-indigo-400 transition-[width] duration-200 ease-out"
                              style={{ width: `${commandProgressPercent}%` }}
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={commandProgressPercent}
                              aria-label="技能更新进度"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-3">
                {installMode === "search" && (
                  <OnlineSearchPanel
                    searchQuery={online.searchQuery}
                    loadingSearch={online.loadingSearch}
                    searchDuration={online.searchDuration}
                    searched={online.searched}
                    searchResults={online.searchResults}
                    localizedOnlineSkillDetails={skillData.localizedOnlineSkillDetails}
                    loadingLocalizedOnlineDetailIds={online.loadingLocalizedOnlineDetailIds}
                    localizedOnlineDetailErrors={online.localizedOnlineDetailErrors}
                    installingOnlineSkillIds={online.installingOnlineSkillIds}
                    copiedSkillIds={online.copiedSkillIds}
                    commandRunning={command.commandRunning}
                    onSearch={online.handleSearch}
                    onInstallOnlineSkill={online.handleInstallOnlineSkill}
                    onCopyInstallCommand={online.handleCopyInstallCommand}
                    onEnsureLocalizedOnlineSkillDetail={online.ensureLocalizedOnlineSkillDetail}
                  />
                )}

                {installMode !== "search" && (
                  <InstallModes
                    installMode={installMode}
                    setInstallMode={setInstallMode}
                    commandRunning={command.commandRunning}
                    homePath={skillData.homePath}
                    localSkills={localSkills}
                    onExecuteSkillsCommand={command.executeSkillsCommand}
                  />
                )}
              </div>

              <CommandLog
                commandResult={command.commandResult}
                commandWarnings={command.commandWarnings}
              />
            </section>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {online.pendingRemoveSkill && (
        <RemoveSkillDialog
          pendingRemoveSkill={online.pendingRemoveSkill}
          onCancel={() => online.setPendingRemoveSkill(null)}
          onConfirm={executeRemoveSkill}
          commandRunning={command.commandRunning}
        />
      )}

      {annotationModalOpen && (
        <EnrichmentModal
          onClose={() => setAnnotationModalOpen(false)}
          selectedLlmProfile={llm.selectedLlmProfile}
          availableLlmProfiles={llm.availableLlmProfiles}
          onSelectLlmProfile={llm.setSelectedLlmProfileId}
          filteredSkillsCount={filteredSkills.length}
          incrementalAnnotationSkillsCount={enrichment.incrementalAnnotationSkills.length}
          enrichmentQueueRunning={enrichment.enrichmentQueueRunning}
          enrichmentQueueMessage={enrichment.enrichmentQueueMessage}
          enrichmentQueuePhase={enrichment.enrichmentQueuePhase}
          enrichmentQueueCompleted={enrichment.enrichmentQueueCompleted}
          enrichmentQueueTotal={enrichment.enrichmentQueueTotal}
          enrichmentActiveSummary={enrichment.enrichmentActiveSummary}
          nextEnrichmentSeconds={enrichment.nextEnrichmentSeconds}
          enrichmentQueueError={enrichment.enrichmentQueueError}
          failedEnrichmentRecords={enrichment.failedEnrichmentRecords}
          enrichmentProgressPercent={enrichment.enrichmentProgressPercent}
          shouldShowEnrichmentQueue={enrichment.shouldShowEnrichmentQueue}
          onRunEnrichmentQueue={(mode) => {
            void enrichment.handleRunEnrichmentQueue(mode);
            setAnnotationModalOpen(true);
          }}
          onStopEnrichmentQueue={enrichment.stopEnrichmentQueue}
        />
      )}
    </div>
  );
}
