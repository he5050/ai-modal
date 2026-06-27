import { useState, useRef } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { logger } from "@/lib/devlog";
import { toast } from "@/lib/toast";
import { exportAppFiles, importAppFiles } from "@/api";
import { getDatabase } from "@/lib/persistence";
import type { ExportConfigPayload, ImportConfigPayload } from "@/types";

const SECURE_STORAGE_KEY = "__secure_storage_key__";

const BUSINESS_KEYS = [
  "providers",
  "prompts",
  "config_paths",
  "rule_paths",
  "debug_enabled",
  "concurrency",
  "modelscope_api_key",
  "models_sort_key",
  "models_sort_dir",
  "recent_export_dir",
  "mcp_sync_targets",
  "model_configs",
  "model_config",
  "skill_targets",
  "skills_catalog",
  "skills_sources",
  "skill_enrichments",
  "installed_skill_snapshots",
  "localized_online_skill_details",
] as const;

const LOCAL_STORAGE_KEYS = [
  "ai-modal-debug",
  "ai-modal-concurrency",
  "ai-modal-sort-key",
  "ai-modal-sort-dir",
  "ai-modal-model-export-dir",
] as const;

type KvRow = { key: string; value: string };

export function useConfigMigration() {
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [pendingImport, setPendingImport] = useState<
    { fileName: string; payload: ImportConfigPayload } | null
  >(null);
  const importRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setBusy("export");
    try {
      const db = await getDatabase();
      if (!db) {
        throw new Error("无法连接数据库");
      }

      const rows = await db.select<KvRow[]>("SELECT key, value FROM kv_store");
      const kvStore: Record<string, string> = {};
      for (const row of rows) {
        if (row.key === SECURE_STORAGE_KEY) continue;
        kvStore[row.key] = row.value;
      }

      const localStorageData: Record<string, string> = {};
      for (const key of LOCAL_STORAGE_KEYS) {
        const value = localStorage.getItem(key);
        if (value != null) {
          localStorageData[key] = value;
        }
      }

      logger.info(`[导出配置] 读取到 ${Object.keys(kvStore).length} 个 kv_store key: ${Object.keys(kvStore).join(", ")}`);
      logger.info(`[导出配置] 读取到 ${Object.keys(localStorageData).length} 个 localStorage key: ${Object.keys(localStorageData).join(", ")}`);

      const filesExport = await exportAppFiles();

      const payload: ExportConfigPayload = {
        version: 1,
        app: "ai-modal",
        exportedAt: Date.now(),
        kvStore,
        localStorage: localStorageData,
        files: filesExport.files,
        curlTasks: filesExport.curlTasks,
        autostart: filesExport.autostart,
      };

      const today = new Date().toISOString().slice(0, 10);
      const filePath = await save({
        defaultPath: `ai-modal-config-${today}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath) return;

      await writeTextFile(filePath, JSON.stringify(payload, null, 2));
      toast("配置已导出，含明文 API Key 等敏感信息，请妥善保管", "warning");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[导出配置] 失败：${msg}`);
      toast(`导出配置失败：${msg}`, "error");
    } finally {
      setBusy(null);
    }
  }

  function handleImportClick() {
    importRef.current?.click();
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = String(ev.target?.result ?? "");
        const parsed = JSON.parse(text) as ImportConfigPayload;

        if (parsed.version !== 1) {
          throw new Error("配置文件版本不兼容");
        }
        if (!parsed.kvStore || typeof parsed.kvStore !== "object") {
          throw new Error("配置文件格式不正确：缺少 kvStore");
        }

        setPendingImport({ fileName: file.name, payload: parsed });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "文件解析失败";
        logger.error(`[导入配置] ${msg}`);
        toast(`导入配置失败：${msg}`, "error");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  async function handleConfirmImport() {
    if (!pendingImport) return;
    const { payload } = pendingImport;
    setPendingImport(null);
    setBusy("import");
    try {
      const db = await getDatabase();
      if (!db) {
        throw new Error("无法连接数据库");
      }

      // 1. 收集需要删除的所有 key：预定义业务 key + 导出文件中的 key
      const keysToDelete = new Set<string>(BUSINESS_KEYS);
      for (const key of Object.keys(payload.kvStore)) {
        keysToDelete.add(key);
      }

      // 2. 删除所有需要清理的 key
      for (const key of keysToDelete) {
        await db.execute("DELETE FROM kv_store WHERE key = $1", [key]);
      }

      // 3. 写入导出文件中的所有 kv 数据
      const now = Date.now();
      for (const [key, value] of Object.entries(payload.kvStore)) {
        await db.execute(
          `INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2, $3)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [key, value, now],
        );
      }

      // 4. 恢复 localStorage
      if (payload.localStorage && typeof payload.localStorage === "object") {
        for (const key of LOCAL_STORAGE_KEYS) {
          const value = payload.localStorage[key];
          if (value != null) {
            localStorage.setItem(key, value);
          } else {
            localStorage.removeItem(key);
          }
        }
      }

      // 5. 导入文件配置（Rust 端处理配置文件 + curl-tasks + autostart）
      await importAppFiles({
        files: payload.files ?? {},
        curlTasks: payload.curlTasks,
        autostart: payload.autostart,
      });

      toast("配置导入成功，应用将刷新", "success");
      setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[导入配置] 失败：${msg}`);
      toast(`导入配置失败：${msg}`, "error");
    } finally {
      setBusy(null);
    }
  }

  function handleCancelImport() {
    setPendingImport(null);
  }

  return {
    busy,
    pendingImport,
    importRef,
    handleExport,
    handleImportClick,
    handleImportFile,
    handleConfirmImport,
    handleCancelImport,
  };
}
