import { useMemo } from "react";

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

export default function ResultCards({
  data,
  fields,
}: {
  data: Record<string, unknown> | null;
  fields: string[];
}) {
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

  if (cards.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-subtle p-6 text-center text-sm text-text-muted">
        暂无展示数据
      </div>
    );
  }

  return (
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
  );
}
