import { useState } from "react";
import { open as pickPath } from "@tauri-apps/plugin-dialog";
import {
  CheckCircle2,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Send,
  X,
} from "lucide-react";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "@/lib/buttonStyles";
import { FIELD_INPUT_CLASS, FIELD_MONO_INPUT_CLASS } from "@/lib/formStyles";
import { HintTooltip } from "../../HintTooltip";
import { BUILTIN_TARGETS } from "@/constants";
import type { SkillRecord, SkillTargetConfig, SkillTargetStatus } from "@/types";

interface SyncTargetsSectionProps {
  targets: SkillTargetConfig[];
  targetStatuses: Record<string, SkillTargetStatus>;
  checkingTargets: boolean;
  syncing: boolean;
  homePath: string;
  skills: SkillRecord[];
  onSetTargetEnabled: (id: string, enabled: boolean) => void;
  onSetTargets: (fn: (prev: SkillTargetConfig[]) => SkillTargetConfig[]) => void;
  onAddCustomTarget: (label: string, path: string) => Promise<SkillTargetConfig | null>;
  onRefreshTargetStatuses: () => void;
  onSyncEnabledTargets: () => void;
  onSyncSingleTarget: (target: SkillTargetConfig) => Promise<boolean>;
  onDeleteCustomTarget: (id: string) => void;
}

export function SyncTargetsSection({
  targets,
  targetStatuses,
  checkingTargets,
  syncing,
  homePath,
  skills,
  onSetTargetEnabled,
  onSetTargets,
  onAddCustomTarget,
  onRefreshTargetStatuses,
  onSyncEnabledTargets,
  onSyncSingleTarget,
  onDeleteCustomTarget,
}: SyncTargetsSectionProps) {
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customPath, setCustomPath] = useState("");

  const enabledTargets = targets.filter((item) => item.enabled);
  const skillNames = skills.map((s) => s.name);
  const totalSkills = skillNames.length;

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/80 px-5 py-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-medium text-gray-100">同步目标</h3>
          <HintTooltip content="本地技能统一留在 ~/.agents/skills，选中的目标目录通过软连接分发。每个目标可以单独勾选需要同步的技能。" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void onRefreshTargetStatuses()}
            disabled={checkingTargets}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            {checkingTargets ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            检查
          </button>
          <button
            onClick={() => void onSyncEnabledTargets()}
            disabled={syncing || enabledTargets.length === 0}
            className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            一键同步全部
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {targets.map((target) => {
          const status = targetStatuses[target.id];
          const accent =
            BUILTIN_TARGETS.find((t) => t.id === target.id)?.accentClass ??
            "border-gray-700 bg-gray-950 text-gray-300";
          const syncNames = target.syncSkillNames;
          const selectedCount = syncNames ? syncNames.length : totalSkills;
          return (
            <div key={target.id} className="rounded-xl border border-gray-800 bg-black/10 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${accent}`}>
                  {target.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500">
                    <span className={status?.exists ? "text-emerald-400" : "text-red-400"}>
                      {status?.exists ? "存在" : "缺失"}
                    </span>
                    {status && <span className="ml-1">{status.managedCount ?? 0} 链接</span>}
                    {(status?.brokenCount ?? 0) > 0 && (
                      <span className="ml-1 text-amber-400">{status.brokenCount} 损坏</span>
                    )}
                  </span>
                  <button
                    onClick={() => onSetTargetEnabled(target.id, !target.enabled)}
                    className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full border border-transparent transition-colors ${target.enabled ? "bg-indigo-600" : "bg-gray-700"}`}
                    role="switch"
                    aria-checked={target.enabled}
                  >
                    <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition duration-200 ${target.enabled ? "translate-x-3" : "translate-x-0"}`} />
                  </button>
                </div>
              </div>

              <div className="mt-2 text-[10px] text-gray-500">
                {syncNames
                  ? `${selectedCount}/${totalSkills} 个技能`
                  : `全部 ${totalSkills} 个技能`}
              </div>

              {totalSkills > 0 && (
                <div className="mt-2 max-h-[200px] space-y-1 overflow-y-auto rounded-lg border border-gray-800 bg-gray-950/40 px-2 py-2">
                  <label className="flex items-center gap-2 rounded px-1 py-1 text-xs text-gray-400 hover:bg-gray-800/50">
                    <input
                      type="checkbox"
                      checked={syncNames === null}
                      onChange={() => {
                        onSetTargets((prev) =>
                          prev.map((t) =>
                            t.id === target.id
                              ? { ...t, syncSkillNames: t.syncSkillNames === null ? [] : null }
                              : t,
                          ),
                        );
                      }}
                      className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-indigo-500 focus:ring-indigo-500/30"
                    />
                    <span className="text-gray-300">全部同步</span>
                  </label>
                  {skillNames.map((name) => (
                    <label
                      key={`${target.id}-${name}`}
                      className="flex items-center gap-2 rounded px-1 py-1 text-xs text-gray-400 hover:bg-gray-800/50"
                    >
                      <input
                        type="checkbox"
                        checked={syncNames ? syncNames.includes(name) : true}
                        onChange={() => {
                          onSetTargets((prev) =>
                            prev.map((t) => {
                              if (t.id !== target.id) return t;
                              const current = t.syncSkillNames;
                              if (current === null) {
                                return {
                                  ...t,
                                  syncSkillNames: skillNames.filter((n) => n !== name),
                                };
                              }
                              const next = current.includes(name)
                                ? current.filter((n) => n !== name)
                                : [...current, name];
                              return {
                                ...t,
                                syncSkillNames: next.length === totalSkills ? null : next,
                              };
                            }),
                          );
                        }}
                        className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-indigo-500 focus:ring-indigo-500/30"
                      />
                      <span className="truncate">{name}</span>
                    </label>
                  ))}
                </div>
              )}

              <div className="mt-2 flex items-center justify-end gap-1.5 border-t border-gray-800 pt-2">
                <button
                  onClick={() => void onSyncSingleTarget(target)}
                  disabled={!target.enabled || syncing}
                  className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                >
                  {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  同步
                </button>
                {!target.isBuiltin && (
                  <button
                    onClick={() => onDeleteCustomTarget(target.id)}
                    className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
                  >
                    <X className="h-3.5 w-3.5" />
                    删除
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-gray-800/80 bg-gray-950/30 px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-200">自定义目标</p>
          {!showCustomForm ? (
            <button
              onClick={() => setShowCustomForm(true)}
              className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
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
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              <X className="h-3.5 w-3.5" />
              取消
            </button>
          )}
        </div>
        {showCustomForm && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={customLabel}
              onChange={(event) => setCustomLabel(event.target.value)}
              className={`${FIELD_INPUT_CLASS} w-40`}
              placeholder="目标名称"
            />
            <input
              value={customPath}
              onChange={(event) => setCustomPath(event.target.value)}
              className={`${FIELD_MONO_INPUT_CLASS} min-w-[260px] flex-1`}
              placeholder="~/custom-tool/skills"
            />
            <button
              onClick={async () => {
                const selected = await pickPath({
                  directory: true,
                  defaultPath: homePath || undefined,
                });
                if (typeof selected === "string") setCustomPath(selected);
              }}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              选择
            </button>
            <button
              onClick={async () => {
                const result = await onAddCustomTarget(customLabel, customPath);
                if (result) {
                  setCustomLabel("");
                  setCustomPath("");
                  setShowCustomForm(false);
                }
              }}
              className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              <Save className="h-3.5 w-3.5" />
              保存
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
