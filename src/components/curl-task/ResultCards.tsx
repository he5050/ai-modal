import { useMemo, useState } from "react";
import { FileSpreadsheet, FileJson, Check, Copy } from "lucide-react";

function getValueByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "--";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return `[${value.length} 项]`;
  if (typeof value === "object") return JSON.stringify(value).slice(0, 100);
  return String(value);
}

function getFieldLabel(path: string): string {
  const parts = path.split(".");
  return parts[parts.length - 1];
}

// 将数据转换为 CSV 格式
function convertToCSV(data: Record<string, unknown>[], fields: string[]): string {
  if (data.length === 0 || fields.length === 0) return "";

  const headers = fields.map(getFieldLabel);
  const rows = data.map((item) =>
    fields
      .map((field) => {
        const value = getValueByPath(item, field);
        const str = formatValue(value);
        // 如果包含逗号或换行，用引号包裹
        if (str.includes(",") || str.includes("\n") || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

// 将数据转换为 JSON 格式（只包含选中的字段）
function convertToJSON(data: Record<string, unknown>[], fields: string[]): string {
  if (data.length === 0) return "[]";

  const filtered = data.map((item) => {
    const obj: Record<string, unknown> = {};
    fields.forEach((field) => {
      const label = getFieldLabel(field);
      obj[label] = getValueByPath(item, field);
    });
    return obj;
  });

  return JSON.stringify(filtered, null, 2);
}

interface ExportButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  copied: boolean;
}

function ExportButton({ icon, label, onClick, copied }: ExportButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md bg-surface-hover px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-active hover:text-text-heading"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        icon
      )}
      {copied ? "已复制" : label}
    </button>
  );
}

export default function ResultCards({
  data,
  fields,
}: {
  data: Record<string, unknown> | null;
  fields: string[];
}) {
  const [copiedCSV, setCopiedCSV] = useState(false);
  const [copiedJSON, setCopiedJSON] = useState(false);

  const cards = useMemo(() => {
    if (!data) return [];
    return fields
      .map((field) => ({
        field,
        label: getFieldLabel(field),
        value: formatValue(getValueByPath(data, field)),
      }))
      .filter((c) => c.value !== "--");
  }, [data, fields]);

  // 将数据转换为数组格式（支持单条或多条）
  const dataArray = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return [data];
  }, [data]);

  const handleCopyCSV = async () => {
    const csv = convertToCSV(dataArray, fields);
    try {
      await navigator.clipboard.writeText(csv);
      setCopiedCSV(true);
      setTimeout(() => setCopiedCSV(false), 2000);
    } catch {
      // 复制失败
    }
  };

  const handleCopyJSON = async () => {
    const json = convertToJSON(dataArray, fields);
    try {
      await navigator.clipboard.writeText(json);
      setCopiedJSON(true);
      setTimeout(() => setCopiedJSON(false), 2000);
    } catch {
      // 复制失败
    }
  };

  if (cards.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-subtle p-6 text-center text-sm text-text-muted">
        暂无展示数据
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 导出按钮 */}
      <div className="flex items-center justify-end gap-2">
        <ExportButton
          icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
          label="复制 CSV"
          onClick={handleCopyCSV}
          copied={copiedCSV}
        />
        <ExportButton
          icon={<FileJson className="h-3.5 w-3.5" />}
          label="复制 JSON"
          onClick={handleCopyJSON}
          copied={copiedJSON}
        />
      </div>

      {/* 卡片展示 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.field}
            className="rounded-lg border border-border-subtle bg-surface-base p-3 transition-colors hover:border-indigo-500/30 hover:bg-surface-hover"
          >
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
              {card.label}
            </div>
            <div className="truncate text-sm font-semibold text-text-heading">
              {card.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
