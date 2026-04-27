import { useState } from "react";
import { open as pickPath } from "@tauri-apps/plugin-dialog";
import { FolderOpen, GitBranch, Loader2, RefreshCcw, Trash2, Upload } from "lucide-react";
import { FIELD_MONO_INPUT_CLASS } from "../../../lib/formStyles";
import { toast } from "../../../lib/toast";
import { parseNameList, sourceNeedsWildcard, toAbsolutePath } from "../constants";
import type { InstallMode } from "../types";
import type { SkillRecord, SkillSourceType, SkillsCommandAction } from "../../../types";

interface InstallModesProps {
  installMode: InstallMode;
  setInstallMode: (mode: InstallMode) => void;
  commandRunning: boolean;
  homePath: string;
  localSkills: SkillRecord[];
  onExecuteSkillsCommand: (
    request: import("../../../types").SkillsCommandRequest,
    successMessage?: string,
    sourceMeta?: {
      sourceType: SkillSourceType;
      sourceValue?: string | null;
    },
  ) => Promise<void>;
}

export function InstallModes({
  installMode,
  setInstallMode,
  commandRunning,
  homePath,
  localSkills,
  onExecuteSkillsCommand,
}: InstallModesProps) {
  const [githubSource, setGithubSource] = useState("");
  const [localSource, setLocalSource] = useState("");
  const [removeNames, setRemoveNames] = useState("");

  async function handlePickLocalSource() {
    const selected = await pickPath({
      directory: true,
      defaultPath: homePath || undefined,
    });
    if (typeof selected === "string") {
      setLocalSource(selected);
    }
  }

  async function handleRunCommand(action: SkillsCommandAction) {
    if (action === "add") {
      const source =
        installMode === "github"
          ? githubSource.trim()
          : toAbsolutePath(localSource, homePath);
      if (!source) {
        toast("请先填写安装来源", "warning");
        return;
      }
      await onExecuteSkillsCommand(
        {
          action,
          source,
          skillNames:
            installMode === "github" && sourceNeedsWildcard(githubSource.trim())
              ? ["*"]
              : undefined,
        },
        "技能命令执行完成",
        {
          sourceType: installMode === "github" ? "github" : "local",
          sourceValue:
            installMode === "github"
              ? githubSource.trim()
              : toAbsolutePath(localSource, homePath),
        },
      );
    } else if (action === "remove") {
      const skillNames = parseNameList(removeNames);
      if (skillNames.length === 0) {
        toast("请填写要移除的技能名", "warning");
        return;
      }
      await onExecuteSkillsCommand(
        { action, skillNames },
        `已移除技能：${removeNames.trim()}`,
      );
    } else {
      await onExecuteSkillsCommand({ action });
    }
  }

  return (
    <>
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

      {installMode === "github" && (
        <div className="mt-4 space-y-3">
          <input
            value={githubSource}
            onChange={(event) => setGithubSource(event.target.value)}
            placeholder="owner/repo 或 https://github.com/owner/repo"
            className={FIELD_MONO_INPUT_CLASS}
          />
          <button
            onClick={() =>
              void onExecuteSkillsCommand(
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
        <div className="mt-4 space-y-3">
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
              void onExecuteSkillsCommand(
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
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="text-sm text-amber-200">
              更新所有全局已安装技能到最新版本
            </p>
            <p className="mt-1 text-xs text-amber-300/70">
              此操作会基于 ~/.agents/skills 当前扫描结果，显式把
              {` ${localSkills.length} `}
              个本地技能逐个传给 skills update，并刷新技能目录。
            </p>
          </div>
          <button
            onClick={() => {
              if (localSkills.length === 0) {
                toast("当前没有可更新的本地技能", "warning");
                return;
              }
              void onExecuteSkillsCommand(
                {
                  action: "update",
                  skillNames: localSkills.map((skill) => skill.dir),
                },
                "技能命令执行完成",
              );
            }}
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
        <div className="mt-4 space-y-3">
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
    </>
  );
}
