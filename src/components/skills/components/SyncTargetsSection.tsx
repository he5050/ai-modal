import { useState } from "react";
import { open as pickPath } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  ChevronDown,
  ChevronUp,
  FilePenLine,
  FolderOpen,
  Link2,
  Loader2,
  Plus,
  RefreshCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_DANGER_OUTLINE_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../../../lib/buttonStyles";
import { FIELD_INPUT_CLASS, FIELD_MONO_INPUT_CLASS, FIELD_SELECT_CLASS } from "../../../lib/formStyles";
import { HintTooltip } from "../../HintTooltip";
import { BUILTIN_TARGETS } from "../constants";
import type { SkillTargetConfig, SkillTargetStatus } from "../../../types";

interface SyncTargetsSectionProps {
  targets: SkillTargetConfig[];
  targetStatuses: Record<string, SkillTargetStatus>;
  checkingTargets: boolean;
  syncing: boolean;
  homePath: string;
  selectedTargetId: string;
  pathDraft: string;
  onSetTargetEnabled: (id: string, enabled: boolean) => void;
  onDeleteCustomTarget: (id: string) => void;
  onSaveTargetPath: () => boolean;
  onAddCustomTarget: (label: string, path: string) => Promise<SkillTargetConfig | null>;
  onSelectTargetId: (id: string) => void;
  onSetPathDraft: (path: string) => void;
  onRefreshTargetStatuses: () => void;
  onSyncEnabledTargets: () => void;
}

export function SyncTargetsSection({
  targets,
  targetStatuses,
  checkingTargets,
  syncing,
  homePath,
  selectedTargetId,
  pathDraft,
  onSetTargetEnabled,
  onDeleteCustomTarget,
  onSaveTargetPath,
  onAddCustomTarget,
  onSelectTargetId,
  onSetPathDraft,
  onRefreshTargetStatuses,
  onSyncEnabledTargets,
}: SyncTargetsSectionProps) {
  const [syncTargetsExpanded, setSyncTargetsExpanded] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customPath, setCustomPath] = useState("");

  const enabledTargets = targets.filter((item) => item.enabled);
  const selectedTarget =
    targets.find((item) => item.id === selectedTargetId) ?? null;

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/80 px-5 py-5">
      <button
        type="button"
        onClick={() => setSyncTargetsExpanded((current) => !current)}
        aria-label="同步目标"
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-medium text-gray-100">同步目标</h3>
            <HintTooltip content="本地技能统一留在 ~/.agents/skills，选中的目标目录通过软连接分发；冲突目录会先备份再替换。" />
          </div>
        </div>
        {syncTargetsExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        )}
      </button>

      {syncTargetsExpanded && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={() => void onRefreshTargetStatuses()}
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
            onClick={() => void onSyncEnabledTargets()}
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
      )}

      {syncTargetsExpanded && targets.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {targets.map((target) => {
            const status = targetStatuses[target.id];
            const accent =
              BUILTIN_TARGETS.find((t) => t.id === target.id)?.accentClass ??
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
                      onSetTargetEnabled(target.id, !target.enabled)
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
                      status?.exists ? "text-emerald-400" : "text-red-400"
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

      {syncTargetsExpanded && selectedTarget && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedTargetId}
              onChange={(event) => {
                onSelectTargetId(event.target.value);
                const t = targets.find(
                  (item) => item.id === event.target.value,
                );
                if (t) onSetPathDraft(t.path);
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
              onChange={(event) => onSetPathDraft(event.target.value)}
              placeholder="~/tool/skills"
              className={`${FIELD_MONO_INPUT_CLASS} flex-1`}
            />
            <button
              onClick={async () => {
                const selected = await pickPath({
                  directory: true,
                  defaultPath: selectedTarget?.path || homePath || undefined,
                });
                if (typeof selected === "string") onSetPathDraft(selected);
              }}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              <FolderOpen className="h-4 w-4" />
              选择目录
            </button>
            <button
              onClick={onSaveTargetPath}
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
                onClick={() => onDeleteCustomTarget(selectedTarget.id)}
                className={`${BUTTON_DANGER_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              >
                <Trash2 className="h-4 w-4" />
                删除
              </button>
            )}
          </div>
        </div>
      )}

      {syncTargetsExpanded && (
        <div className="mt-3 rounded-xl border border-gray-800/80 bg-gray-950/30 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-200">自定义目标</p>
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
                <X className="h-3.5 w-3.5" />
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
                  if (typeof selected === "string") setCustomPath(selected);
                }}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
              >
                <FolderOpen className="h-4 w-4" />
                选择目录
              </button>
              <button
                onClick={async () => {
                  const result = await onAddCustomTarget(customLabel, customPath);
                  if (result) {
                    onSelectTargetId(result.id);
                    onSetPathDraft(result.path);
                    setCustomLabel("");
                    setCustomPath("");
                    setShowCustomForm(false);
                  }
                }}
                className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
              >
                <FilePenLine className="h-4 w-4" />
                保存
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

