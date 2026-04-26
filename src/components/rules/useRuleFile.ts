import { useEffect, useMemo, useRef, useState } from "react";
import { dirname, homeDir } from "@tauri-apps/api/path";
import { mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { open as pickPath } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "../../lib/toast";
import type { RulePath } from "../../types";
import { BUILTIN_TOOLS } from "./constants";
import {
  normalizeText,
  isAbsolutePath,
  toDisplayPath,
  toAbsolutePath,
  buildDefaultPath,
  detectExists,
} from "./utils";

export interface Tool {
  id: string;
  label: string;
  fileName: string;
  relativePath?: string;
  accentClass: string;
  path: string;
  isBuiltin: boolean;
  kind: "file" | "directory";
}

interface UseRuleFileOptions {
  storedPaths: RulePath[];
  onPathChange: (id: string, path: string) => void;
}

export function useRuleFile({ storedPaths, onPathChange }: UseRuleFileOptions) {
  const [selectedId, setSelectedId] = useState<string>("claude-code");
  const [pathDraft, setPathDraft] = useState("");
  const [contentDraft, setContentDraft] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [fileExists, setFileExists] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, setRefreshing] = useState(false);
  const [homePath, setHomePath] = useState("");

  const dirtyRef = useRef(false);

  const tools = useMemo(() => {
    const builtin = BUILTIN_TOOLS.map((tool) => {
      const stored = storedPaths.find((item) => item.id === tool.id);
      return {
        ...tool,
        path: isAbsolutePath(stored?.path)
          ? stored!.path
          : homePath
            ? buildDefaultPath(homePath, tool.relativePath)
            : "",
        isBuiltin: true,
        kind: stored?.kind ?? tool.kind ?? ("file" as const),
      };
    });
    const custom = storedPaths
      .filter((item) => !item.isBuiltin)
      .map((item) => ({
        id: item.id,
        label: item.label,
        fileName: item.kind === "directory" ? "directory" : "custom",
        accentClass: "border-gray-500/30 bg-gray-500/10 text-gray-200",
        path: item.path,
        isBuiltin: false,
        kind: (item.kind ?? "file") as "file" | "directory",
      }));
    return [...builtin, ...custom];
  }, [homePath, storedPaths]);

  const selectedTool =
    tools.find((tool) => tool.id === selectedId) ?? tools[0] ?? null;

  const dirty =
    contentDraft !== savedContent ||
    normalizeText(pathDraft) !==
      normalizeText(
        selectedTool && homePath
          ? toDisplayPath(selectedTool.path, homePath)
          : (selectedTool?.path ?? ""),
      );

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Load home path
  useEffect(() => {
    let active = true;
    async function loadHomePath() {
      try {
        const resolved = await homeDir();
        if (active) setHomePath(resolved.replace(/\/$/, ""));
      } catch (error) {
        console.error("Failed to resolve home directory", error);
        toast("无法解析用户主目录", "error");
      }
    }
    void loadHomePath();
    return () => {
      active = false;
    };
  }, []);

  // Auto-select first tool if current is gone
  useEffect(() => {
    if (!selectedTool && tools.length > 0) {
      setSelectedId(tools[0].id);
    }
  }, [selectedTool, tools]);

  async function refreshCurrent(tool = selectedTool, targetPath?: string) {
    if (!tool || !homePath) return;
    const path = normalizeText(
      toAbsolutePath(targetPath ?? tool.path, homePath),
    );
    if (!path) {
      setFileExists(false);
      setSavedContent("");
      setContentDraft("");
      return;
    }

    setRefreshing(true);
    setLoadingContent(true);
    try {
      const present = await detectExists(path);
      setFileExists(present);
      if (!present) {
        setSavedContent("");
        setContentDraft("");
        return;
      }

      if (tool.kind === "directory") {
        setSavedContent("");
        setContentDraft("");
        return;
      }

      const content = await readTextFile(path);
      setSavedContent(content);
      setContentDraft(content);
    } catch (error) {
      console.error("Failed to read rule file", error);
      toast("读取规则文件失败", "error");
    } finally {
      setLoadingContent(false);
      setRefreshing(false);
    }
  }

  // Load content when tool changes
  useEffect(() => {
    if (!selectedTool || !homePath) return;
    setPathDraft(toDisplayPath(selectedTool.path, homePath));
    void refreshCurrent(selectedTool, selectedTool.path);
  }, [homePath, selectedTool?.id, selectedTool?.path]);

  async function handleSaveContent() {
    if (!selectedTool || !homePath) return;
    const nextPath = normalizeText(toAbsolutePath(pathDraft, homePath));
    if (!nextPath) {
      toast("请先填写规则文件路径", "warning");
      return;
    }
    if (selectedTool.kind === "directory") {
      toast("目录类型规则项不支持直接编辑内容", "warning");
      return;
    }

    setSaving(true);
    try {
      const folder = await dirname(nextPath);
      await mkdir(folder, { recursive: true });
      await writeTextFile(nextPath, contentDraft);
      onPathChange(selectedTool.id, nextPath);
      setSavedContent(contentDraft);
      setFileExists(true);
      toast("规则文件已保存", "success");
    } catch (error) {
      console.error("Failed to save rule file", error);
      toast("保存失败，请检查路径与权限范围", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePath() {
    if (!selectedTool || !homePath) return;
    const nextPath = normalizeText(toAbsolutePath(pathDraft, homePath));
    if (!nextPath) {
      toast("路径不能为空", "warning");
      return;
    }
    onPathChange(selectedTool.id, nextPath);
    toast("路径已更新", "success");
  }

  async function handlePickCurrentPath() {
    if (!selectedTool || !homePath) return;
    try {
      const picked = await pickPath({
        directory: selectedTool.kind === "directory",
        multiple: false,
        filters:
          selectedTool.kind === "directory"
            ? undefined
            : [{ name: "Markdown", extensions: ["md"] }],
      });
      if (typeof picked === "string") {
        setPathDraft(toDisplayPath(picked, homePath));
      }
    } catch (error) {
      console.error("Failed to pick current path", error);
      toast("选择路径失败", "error");
    }
  }

  async function handleOpenFile() {
    if (!selectedTool || !homePath) return;
    try {
      await openPath(toAbsolutePath(pathDraft, homePath));
    } catch (error) {
      console.error("Failed to open rule file", error);
      toast("打开文件失败", "error");
    }
  }

  async function handleOpenDirectory() {
    if (!selectedTool || !homePath) return;
    try {
      const folder = await dirname(toAbsolutePath(pathDraft, homePath));
      await openPath(folder);
    } catch (error) {
      console.error("Failed to open rule directory", error);
      toast("打开目录失败", "error");
    }
  }

  return {
    homePath,
    tools,
    selectedTool,
    selectedId,
    setSelectedId,
    pathDraft,
    setPathDraft,
    contentDraft,
    setContentDraft,
    savedContent,
    fileExists,
    loadingContent,
    saving,
    dirty,
    dirtyRef,
    refreshCurrent,
    handleSaveContent,
    handleSavePath,
    handlePickCurrentPath,
    handleOpenFile,
    handleOpenDirectory,
  };
}
