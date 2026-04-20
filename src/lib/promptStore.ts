import type {
  PromptCategorySummary,
  PromptImportParseResult,
  PromptImportSummary,
  PromptRecord,
} from "../types";

export const PROMPTS_KEY = "ai-modal-prompts";
export const PROMPTS_DB_KEY = "prompts";

export function parsePromptCategories(value: string) {
  const seen = new Set<string>();
  const parts = value
    .split(/\s*\/\s*|\s*,\s*|\s*，\s*|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return parts.filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

export function serializePromptCategories(categories: string[]) {
  return parsePromptCategories(categories.join(" / ")).join(" / ");
}

export function createEmptyPrompt(
  now: number,
  category = "未分类",
): PromptRecord {
  return {
    id: `prompt-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: "",
    content: "",
    category,
    tags: [],
    note: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function buildPromptCategories(
  records: PromptRecord[],
): PromptCategorySummary[] {
  const groups = new Map<string, { count: number; updatedAt: number | null }>();

  for (const record of records) {
    const keys = parsePromptCategories(record.category);

    if (keys.length === 0) {
      const key = "未分类";
      const prev = groups.get(key);
      groups.set(key, {
        count: (prev?.count ?? 0) + 1,
        updatedAt:
          prev?.updatedAt == null
            ? record.updatedAt
            : Math.max(prev.updatedAt, record.updatedAt),
      });
      continue;
    }

    for (const key of keys) {
      const prev = groups.get(key);
      groups.set(key, {
        count: (prev?.count ?? 0) + 1,
        updatedAt:
          prev?.updatedAt == null
            ? record.updatedAt
            : Math.max(prev.updatedAt, record.updatedAt),
      });
    }
  }

  const items = Array.from(groups.entries())
    .map(([key, value]) => ({
      key,
      label: key,
      count: value.count,
      updatedAt: value.updatedAt,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));

  return [
    {
      key: "全部",
      label: "全部",
      count: records.length,
      updatedAt: records.reduce<number | null>(
        (latest, item) =>
          latest == null ? item.updatedAt : Math.max(latest, item.updatedAt),
        null,
      ),
    },
    ...items,
  ];
}

export function parsePromptImportJson(
  payload: string,
): PromptImportParseResult {
  const parsed = JSON.parse(payload);
  if (!Array.isArray(parsed)) {
    throw new Error("导入文件必须是提示词数组");
  }

  const valid: PromptRecord[] = [];
  let skipped = 0;

  for (const item of parsed) {
    if (
      typeof item?.id !== "string" ||
      typeof item?.title !== "string" ||
      typeof item?.content !== "string" ||
      typeof item?.category !== "string" ||
      !Array.isArray(item?.tags) ||
      typeof item?.note !== "string" ||
      typeof item?.createdAt !== "number" ||
      typeof item?.updatedAt !== "number" ||
      item.title.trim() === "" ||
      item.content.trim() === ""
    ) {
      skipped += 1;
      continue;
    }

    valid.push({
      id: item.id,
      title: item.title.trim(),
      content: item.content,
      category: serializePromptCategories(parsePromptCategories(item.category)) || "未分类",
      tags: item.tags.filter((tag: unknown): tag is string => typeof tag === "string"),
      note: item.note,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
  }

  return { valid, skipped };
}

export function mergeImportedPrompts(
  existing: PromptRecord[],
  imported: PromptRecord[],
): {
  nextRecords: PromptRecord[];
  summary: PromptImportSummary;
} {
  const byId = new Map(existing.map((item) => [item.id, item]));
  let added = 0;
  let overwritten = 0;

  for (const record of imported) {
    if (byId.has(record.id)) {
      overwritten += 1;
    } else {
      added += 1;
    }
    byId.set(record.id, record);
  }

  return {
    nextRecords: Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt),
    summary: {
      added,
      overwritten,
      skipped: 0,
    },
  };
}

export function summarizePromptImport(summary: PromptImportSummary) {
  return `新增 ${summary.added} 条，覆盖 ${summary.overwritten} 条，跳过 ${summary.skipped} 条`;
}

export function serializePromptRecords(records: PromptRecord[]) {
  return JSON.stringify(records, null, 2);
}
