import { useState, useRef } from "react";
import { dirname } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import type { Provider } from "../../../types";
import { logger } from "../../../lib/devlog";
import { toast } from "../../../lib/toast";
import { savePersistedJson } from "../../../lib/persistence";
import { RECENT_EXPORT_DIR_KEY, EXPORT_DIR_DB_KEY } from "../constants";
import {
  escapeCsvCell,
  parseJsonProviders,
  parseCsvProviders,
  formatImportSummary,
} from "../utils";

export function useModelImportExport(
  providers: Provider[],
  onImport: (providers: Provider[]) => void,
) {
  const [importing, setImporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  function handleImportClick() {
    importRef.current?.click();
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = String(ev.target?.result ?? "");
        const existingIds = new Set(providers.map((provider) => provider.id));
        const lowerName = file.name.toLowerCase();
        const summary = lowerName.endsWith(".csv")
          ? parseCsvProviders(text, existingIds)
          : parseJsonProviders(text, existingIds);

        if (summary.valid.length === 0) {
          throw new Error(`未找到可导入记录：${formatImportSummary(summary)}`);
        }

        onImport(summary.valid);
        logger.success(
          `[导入] ${file.name} -> ${formatImportSummary(summary)}`,
        );
        toast(`导入完成：${formatImportSummary(summary)}`, "success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "文件格式不正确";
        logger.error(`[导入] 失败：${msg}`);
        toast(`导入失败：${msg}`, "error");
      } finally {
        setImporting(false);
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function buildCsvContent() {
    const headers = [
      "ID",
      "名称",
      "Base URL",
      "API Key",
      "创建时间",
      "可用数",
      "总数",
    ];
    const rows = providers.map((provider) => {
      const available =
        provider.lastResult?.results.filter((result) => result.available)
          .length ?? 0;
      const total = provider.lastResult?.results.length ?? 0;
      return [provider.id, provider.name, provider.baseUrl, provider.apiKey, provider.createdAt, available, total]
        .map(escapeCsvCell)
        .join(",");
    });
    return headers.join(",") + "\n" + rows.join("\n");
  }

  async function saveExportFile(
    content: string,
    filename: string,
    filterName: string,
    extensions: string[],
  ) {
    const defaultPath =
      localStorage.getItem(RECENT_EXPORT_DIR_KEY) ?? undefined;
    const filePath = await save({
      defaultPath: defaultPath ? `${defaultPath}/${filename}` : filename,
      filters: [{ name: filterName, extensions }],
    });

    if (!filePath) return null;

    await writeTextFile(filePath, content);
    const exportDir = await dirname(filePath);
    localStorage.setItem(RECENT_EXPORT_DIR_KEY, exportDir);
    void savePersistedJson(EXPORT_DIR_DB_KEY, exportDir, RECENT_EXPORT_DIR_KEY);
    return { filePath, exportDir };
  }

  async function handleExportCSV() {
    const csv = buildCsvContent();
    const today = new Date().toISOString().slice(0, 10);
    try {
      const saved = await saveExportFile(csv, `ai-modal-${today}.csv`, "CSV", [
        "csv",
      ]);
      if (!saved) return;
      toast("CSV 已保存，含明文 Key", "warning");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[导出 CSV] 失败：${msg}`);
      toast(`导出 CSV 失败：${msg}`, "error");
    } finally {
      setExportOpen(false);
    }
  }

  async function handleExportJSON() {
    const data = providers.map((p) => ({
      ...p,
      lastResult: p.lastResult ?? null,
    }));
    const today = new Date().toISOString().slice(0, 10);
    try {
      const saved = await saveExportFile(
        JSON.stringify(data, null, 2),
        `ai-modal-${today}.json`,
        "JSON",
        ["json"],
      );
      if (!saved) return;
      toast("JSON 已保存，含明文 Key", "warning");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[导出 JSON] 失败：${msg}`);
      toast(`导出 JSON 失败：${msg}`, "error");
    } finally {
      setExportOpen(false);
    }
  }

  async function handleOpenRecentExportDir() {
    const exportDir = localStorage.getItem(RECENT_EXPORT_DIR_KEY);
    if (!exportDir) {
      toast("暂无最近导出目录", "info");
      setExportOpen(false);
      return;
    }
    try {
      await openPath(exportDir);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[导出目录] 打开失败：${msg}`);
      toast(`打开目录失败：${msg}`, "error");
    } finally {
      setExportOpen(false);
    }
  }

  function handleCopyCSV() {
    const rows = providers.map((p) => {
      const available =
        p.lastResult?.results.filter((r) => r.available).length ?? 0;
      const total = p.lastResult?.results.length ?? 0;
      return `"${p.name}","${p.baseUrl}","${p.apiKey}",${available},${total}`;
    });
    const csv = "名称,Base URL,API Key,可用数,总数\n" + rows.join("\n");
    navigator.clipboard.writeText(csv);
    toast("已复制 CSV 到剪贴板", "success");
    setExportOpen(false);
  }

  function handleCopyJSON() {
    const data = providers.map((p) => ({
      ...p,
      lastResult: p.lastResult ?? null,
    }));
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast("已复制 JSON 到剪贴板", "success");
    setExportOpen(false);
  }

  return {
    importing,
    exportOpen,
    setExportOpen,
    importRef,
    handleImportClick,
    handleImportFile,
    handleExportCSV,
    handleExportJSON,
    handleOpenRecentExportDir,
    handleCopyCSV,
    handleCopyJSON,
  };
}
