import { useMemo, useState } from "react";
import { X } from "lucide-react";

function getAllPaths(obj: unknown, prefix = ""): string[] {
  const paths: string[] = [];
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const record = obj as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const value = record[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        paths.push(path);
        paths.push(...getAllPaths(value, path));
      } else {
        paths.push(path);
      }
    }
  }
  return paths;
}

export default function FieldSelectorDialog({
  data,
  initialSelected,
  onConfirm,
  onCancel,
}: {
  data: Record<string, unknown>;
  initialSelected: string[];
  onConfirm: (fields: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const allPaths = useMemo(() => getAllPaths(data), [data]);

  const toggleField = (field: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-border-subtle bg-surface-base shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <h3 className="text-sm font-semibold text-text-heading">选择要展示的字段</h3>
          <button onClick={onCancel} className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text-heading">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3 rounded-lg border border-border-subtle bg-surface-muted p-3">
            <div className="mb-1 text-[11px] font-medium text-text-muted">响应预览</div>
            <pre className="max-h-[120px] overflow-auto text-[11px] text-text-body">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>

          <div className="space-y-1">
            {allPaths.map((path) => {
              const isSelected = selected.has(path);
              const value = getValueByPath(data, path);
              const isLeaf = !(value && typeof value === "object" && !Array.isArray(value));

              return (
                <label
                  key={path}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
                    isSelected ? "bg-indigo-500/10" : "hover:bg-surface-hover"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleField(path)}
                    className="h-3.5 w-3.5 rounded border-border-subtle bg-surface-base text-indigo-500 focus:ring-indigo-500/30"
                  />
                  <span className={`text-xs ${isSelected ? "font-medium text-indigo-300" : "text-text-body"}`}>
                    {path}
                  </span>
                  {isLeaf && (
                    <span className="ml-auto truncate text-[10px] text-text-muted">
                      {formatPreview(value)}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-body transition-colors hover:bg-surface-hover"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(Array.from(selected))}
            className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600"
          >
            确认选择 ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}

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

function formatPreview(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value.length > 20 ? value.slice(0, 20) + "..." : value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.length}]`;
  return JSON.stringify(value).slice(0, 30);
}
