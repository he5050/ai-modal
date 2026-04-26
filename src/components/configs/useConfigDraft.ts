import { useCallback, useEffect, useMemo, useState } from "react";
import { dirname, homeDir } from "@tauri-apps/api/path";
import { mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "../../lib/toast";
import { detectExists } from "./utils";
import type { ConfigGroupFileView, ConfigPath } from "../../types";
import type { FileDraftState } from "./constants";

export function useConfigDraft() {
  const [draftsByFileId, setDraftsByFileId] = useState<
    Record<string, FileDraftState>
  >({});
  const [saving, setSaving] = useState(false);
  const [homePath, setHomePath] = useState("");

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

  function getFileDirty(fileId: string) {
    const draft = draftsByFileId[fileId];
    if (!draft) return false;
    return draft.contentDraft !== draft.savedContent;
  }

  const dirty = useMemo(() => {
    return Object.keys(draftsByFileId).some((fileId) =>
      getFileDirty(fileId),
    );
  }, [draftsByFileId]);

  const updateDraftState = useCallback(
    (fileId: string, patch: Partial<FileDraftState>) => {
      setDraftsByFileId((prev) => {
        const existing = prev[fileId];
        return {
          ...prev,
          [fileId]: {
            contentDraft: existing?.contentDraft ?? "",
            savedContent: existing?.savedContent ?? "",
            fileExists: existing?.fileExists ?? false,
            loading: existing?.loading ?? false,
            loadedPath: existing?.loadedPath ?? "",
            ...patch,
          },
        };
      });
    },
    [],
  );

  const refreshCurrent = useCallback(
    async (file: ConfigGroupFileView) => {
      updateDraftState(file.id, {
        loading: true,
        loadedPath: file.absolutePath,
      });
      try {
        const present = await detectExists(file.absolutePath);
        if (!present) {
          updateDraftState(file.id, {
            contentDraft: "",
            savedContent: "",
            fileExists: false,
            loading: false,
            loadedPath: file.absolutePath,
          });
          return;
        }

        const content = await readTextFile(file.absolutePath);
        updateDraftState(file.id, {
          contentDraft: content,
          savedContent: content,
          fileExists: true,
          loading: false,
          loadedPath: file.absolutePath,
        });
      } catch (error) {
        console.error("Failed to read config file", error);
        toast("读取配置文件失败", "error");
        updateDraftState(file.id, {
          loading: false,
          loadedPath: file.absolutePath,
        });
      }
    },
    [updateDraftState],
  );

  const ensureFileDraftState = useCallback(
    async (file: ConfigGroupFileView | null) => {
      if (!file) return null;

      const existingDraft = draftsByFileId[file.id];
      if (existingDraft?.loadedPath === file.absolutePath) {
        return existingDraft;
      }

      const present = await detectExists(file.absolutePath);
      const content = present ? await readTextFile(file.absolutePath) : "";
      const nextState: FileDraftState = {
        contentDraft: content,
        savedContent: content,
        fileExists: present,
        loading: false,
        loadedPath: file.absolutePath,
      };
      updateDraftState(file.id, nextState);
      return nextState;
    },
    [draftsByFileId, updateDraftState],
  );

  async function saveFileContent(
    file: ConfigGroupFileView,
    content: string,
    onUpsertPath: (path: ConfigPath) => void,
  ) {
    setSaving(true);
    try {
      const folder = await dirname(file.absolutePath);
      await mkdir(folder, { recursive: true });
      await writeTextFile(file.absolutePath, content);
      onUpsertPath({
        id: file.id,
        label: file.label,
        path: file.absolutePath,
        isBuiltin: file.isBuiltin,
        kind: "file",
        format: file.format,
      });
      updateDraftState(file.id, {
        savedContent: content,
        fileExists: true,
      });
      toast("配置文件已保存", "success");
      return true;
    } catch (error) {
      console.error("Failed to save config file", error);
      toast("保存失败，请检查路径与权限范围", "error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function openFile(file: ConfigGroupFileView) {
    try {
      await openPath(file.absolutePath);
    } catch (error) {
      console.error("Failed to open config file", error);
      toast("打开文件失败", "error");
    }
  }

  async function openDirectory(file: ConfigGroupFileView) {
    try {
      const folder = await dirname(file.absolutePath);
      await openPath(folder);
    } catch (error) {
      console.error("Failed to open config directory", error);
      toast("打开目录失败", "error");
    }
  }

  function discardChanges(fileId: string) {
    const activeDraft = draftsByFileId[fileId];
    if (!activeDraft) return;
    updateDraftState(fileId, {
      contentDraft: activeDraft.savedContent,
    });
    toast("已丢弃当前未保存更改", "info");
  }

  return {
    draftsByFileId,
    saving,
    homePath,
    dirty,
    getFileDirty,
    updateDraftState,
    refreshCurrent,
    ensureFileDraftState,
    saveFileContent,
    openFile,
    openDirectory,
    discardChanges,
  };
}
