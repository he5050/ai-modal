import type { ModelResult, Provider } from "@/types";
import { getFriendlyErrorMessage } from "@/lib/errorMessages";
import { maskString } from "@/lib/validation";
import type { ImportSummary } from "./types";

// ─── Formatting ──────────────────────────────────────────────────

export function formatTime(ts: number) {
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${min}`;
}

export function maskKey(key: string) {
  return maskString(key, 2);
}

export function maskPreviewText(value: string) {
  if (!value) return "—";
  if (value.length <= 4)
    return `${value.slice(0, 1)}******${value.slice(-1)}`;
  return maskString(value, 2);
}

// ─── CSV helpers ─────────────────────────────────────────────────

export function escapeCsvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }

  cells.push(current.trim());
  return cells;
}

// ─── Import parsing ──────────────────────────────────────────────

function normalizeImportedProvider(
  raw: Record<string, unknown>,
): Provider | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "";
  const apiKey = typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
  const createdAtValue = raw.createdAt;
  const createdAt =
    typeof createdAtValue === "number"
      ? createdAtValue
      : typeof createdAtValue === "string" && createdAtValue.trim()
        ? Number(createdAtValue)
        : Date.now();

  if (!id || !name || !baseUrl) return null;

  const provider: Provider = {
    id,
    name,
    baseUrl,
    apiKey,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
  };

  if (raw.lastResult && typeof raw.lastResult === "object") {
    provider.lastResult = raw.lastResult as Provider["lastResult"];
  }

  return provider;
}

export function parseJsonProviders(
  text: string,
  existingIds: Set<string>,
): ImportSummary {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error("JSON 顶层必须是数组");

  const seenIds = new Set<string>();
  const valid: Provider[] = [];
  let invalidCount = 0;
  let duplicateInFileCount = 0;
  let duplicateExistingCount = 0;

  for (const item of data) {
    if (typeof item !== "object" || item === null) {
      invalidCount++;
      continue;
    }
    const provider = normalizeImportedProvider(item as Record<string, unknown>);
    if (!provider) {
      invalidCount++;
      continue;
    }
    if (seenIds.has(provider.id)) {
      duplicateInFileCount++;
      continue;
    }
    seenIds.add(provider.id);
    if (existingIds.has(provider.id)) {
      duplicateExistingCount++;
      continue;
    }
    valid.push(provider);
  }

  return { valid, invalidCount, duplicateInFileCount, duplicateExistingCount };
}

export function parseCsvProviders(
  text: string,
  existingIds: Set<string>,
): ImportSummary {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) throw new Error("CSV 内容为空");

  const headers = splitCsvLine(lines[0]);
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const requiredHeaders = ["ID", "名称", "Base URL", "API Key", "创建时间"];
  const missingHeaders = requiredHeaders.filter(
    (header) => !headerIndex.has(header),
  );
  if (missingHeaders.length > 0) {
    throw new Error(`CSV 缺少字段：${missingHeaders.join("、")}`);
  }

  const seenIds = new Set<string>();
  const valid: Provider[] = [];
  let invalidCount = 0;
  let duplicateInFileCount = 0;
  let duplicateExistingCount = 0;

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const raw: Record<string, unknown> = {
      id: cells[headerIndex.get("ID") ?? -1] ?? "",
      name: cells[headerIndex.get("名称") ?? -1] ?? "",
      baseUrl: cells[headerIndex.get("Base URL") ?? -1] ?? "",
      apiKey: cells[headerIndex.get("API Key") ?? -1] ?? "",
      createdAt: cells[headerIndex.get("创建时间") ?? -1] ?? "",
    };

    const provider = normalizeImportedProvider(raw);
    if (!provider) {
      invalidCount++;
      continue;
    }
    if (seenIds.has(provider.id)) {
      duplicateInFileCount++;
      continue;
    }
    seenIds.add(provider.id);
    if (existingIds.has(provider.id)) {
      duplicateExistingCount++;
      continue;
    }
    valid.push(provider);
  }

  return { valid, invalidCount, duplicateInFileCount, duplicateExistingCount };
}

export function formatImportSummary(summary: ImportSummary) {
  return [
    `新增 ${summary.valid.length} 个`,
    summary.duplicateExistingCount > 0
      ? `已存在 ${summary.duplicateExistingCount} 个`
      : null,
    summary.duplicateInFileCount > 0
      ? `文件内重复 ${summary.duplicateInFileCount} 个`
      : null,
    summary.invalidCount > 0 ? `无效 ${summary.invalidCount} 个` : null,
  ]
    .filter(Boolean)
    .join("，");
}

// ─── Result helpers ──────────────────────────────────────────────

export function getResultDetails(result: ModelResult) {
  return result.response_text?.trim() || result.error || "—";
}

export function summarizeFailedResultDetails(
  results: Pick<ModelResult, "available" | "response_text" | "error">[],
) {
  const uniqueDetails = Array.from(
    new Set(
      results
        .filter((result) => !result.available)
        .map((result) => getResultDetails(result as ModelResult))
        .map((detail) => detail.trim())
        .filter((detail) => detail && detail !== "—"),
    ),
  );

  if (uniqueDetails.length === 0) return "";
  return uniqueDetails.join(" | ");
}

// ─── Detection helpers ───────────────────────────────────────────

export function buildTestSignature(baseUrl: string, apiKey: string) {
  return `${baseUrl.trim()}::${apiKey.trim()}`;
}

export function getUniqueModelOptions(results: ModelResult[]) {
  return Array.from(
    new Set(results.map((result) => result.model).filter(Boolean)),
  );
}

export function mergeSingleResult(existing: ModelResult[], next: ModelResult) {
  const merged = [...existing];
  const index = merged.findIndex((item) => item.model === next.model);
  if (index >= 0) {
    merged[index] = next;
  } else {
    merged.push(next);
  }
  return merged.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return (a.latency_ms ?? 99999) - (b.latency_ms ?? 99999);
  });
}

export function friendlyError(e: unknown): string {
  // 委托给统一的错误消息模块，同时补充 API 检测场景特有的提示
  const msg = String(e);
  if (msg.includes("CORS") || msg.includes("cors"))
    return "跨域请求被拒绝，该接口可能不支持浏览器直接调用";
  return getFriendlyErrorMessage(e);
}
