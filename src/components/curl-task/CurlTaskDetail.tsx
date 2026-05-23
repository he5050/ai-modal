import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Save,
  Play,
  Trash2,
  Loader2,
  Terminal,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import type { CurlTask, ParsedCurl } from "@/types";
import {
  loadCurlTasks,
  saveCurlTask,
  deleteCurlTask,
  executeCurlTask,
  parseCurlCommand,
} from "@/api";
import { toast } from "@/lib/toast";
import ResultCards from "./ResultCards";
import FieldSelectorDialog from "./FieldSelectorDialog";

interface CurlTaskDetailProps {
  taskId: string | null;
  mode: "create" | "edit";
  onBack: () => void;
}

export default function CurlTaskDetail({ taskId, mode, onBack }: CurlTaskDetailProps) {
  const isNew = mode === "create";

  const [label, setLabel] = useState("");
  const [curl, setCurl] = useState("");
  const [parsed, setParsed] = useState<ParsedCurl | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [showFieldDialog, setShowFieldDialog] = useState(false);
  const [fieldDialogData, setFieldDialogData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!isNew && taskId) {
      loadTask();
    }
  }, [taskId]);

  async function loadTask() {
    try {
      const tasks = await loadCurlTasks();
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        setLabel(task.label);
        setCurl(task.curl);
        setParsed(task.parsedCurl);
        setSelectedFields(task.selectedFields);
        setLastResult(task.lastResult || null);
      } else {
        toast("任务不存在", "error");
        onBack();
      }
    } catch (err) {
      toast("加载失败: " + String(err), "error");
    }
  }

  async function handleParse() {
    if (!curl.trim()) return;
    try {
      const result = await parseCurlCommand(curl);
      setParsed(result);
      toast(`解析成功: ${result.method} ${result.url}`);
    } catch (err) {
      toast("解析失败: " + String(err), "error");
    }
  }

  async function handleSave() {
    if (!label.trim()) {
      toast("请输入任务名称", "error");
      return;
    }
    if (!parsed) {
      toast("请先解析 cURL", "error");
      return;
    }

    try {
      setSaving(true);
      const task: CurlTask = {
        id: isNew ? `curl-task-${Date.now()}` : taskId!,
        label: label.trim(),
        curl,
        parsedCurl: parsed,
        selectedFields,
        lastResult,
        lastRunAt: isNew ? undefined : undefined,
        createdAt: isNew ? Date.now() : Date.now(),
        updatedAt: Date.now(),
      };
      await saveCurlTask(task);
      toast("保存成功");
      onBack();
    } catch (err) {
      toast("保存失败: " + String(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRun() {
    if (!taskId || isNew) {
      toast("请先保存任务", "error");
      return;
    }
    try {
      setRunning(true);
      const result = await executeCurlTask(taskId);

      if (!result.ok || !result.data) {
        toast("执行失败: " + (result.error || `HTTP ${result.status}`), "error");
        return;
      }

      setLastResult(result.data as Record<string, unknown>);

      if (selectedFields.length === 0) {
        setFieldDialogData(result.data as Record<string, unknown>);
        setShowFieldDialog(true);
        return;
      }

      toast("执行成功: HTTP " + result.status);
    } catch (err) {
      toast("执行失败: " + String(err), "error");
    } finally {
      setRunning(false);
    }
  }

  async function handleFieldConfirm(fields: string[]) {
    setSelectedFields(fields);
    setShowFieldDialog(false);
    setFieldDialogData(null);

    // 自动保存字段选择
    if (!isNew && taskId && parsed) {
      try {
        const task: CurlTask = {
          id: taskId,
          label: label.trim(),
          curl,
          parsedCurl: parsed,
          selectedFields: fields,
          lastResult,
          lastRunAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await saveCurlTask(task);
        toast(`已保存字段选择: 选择了 ${fields.length} 个字段`);
      } catch (err) {
        toast("保存失败: " + String(err), "error");
      }
    }
  }

  async function handleDelete() {
    if (!taskId || isNew) return;
    if (!confirm("确定要删除此任务吗？")) return;
    try {
      await deleteCurlTask(taskId);
      toast("已删除");
      onBack();
    } catch (err) {
      toast("删除失败: " + String(err), "error");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-6 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border-subtle text-text-body transition-colors hover:bg-surface-hover"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <Terminal className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-text-heading">
            {isNew ? "添加任务" : "编辑任务"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            保存
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-4">
          {/* 基本信息 */}
          <div className="rounded-xl border border-border-subtle bg-surface-base p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
              基本信息
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-body">任务名称</label>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-sm text-text-heading outline-none transition-colors focus:border-indigo-500/80 focus-visible:ring-2 focus-visible:ring-indigo-500/35"
                  placeholder="如：查询余额"
                />
              </div>
            </div>
          </div>

          {/* cURL 配置 */}
          <div className="rounded-xl border border-border-subtle bg-surface-base p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
              cURL 配置
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-body">cURL 命令</label>
                <textarea
                  value={curl}
                  onChange={(e) => setCurl(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-border-subtle bg-surface-base px-3 py-2 font-mono text-[11px] text-text-heading outline-none transition-colors focus:border-indigo-500/80 focus-visible:ring-2 focus-visible:ring-indigo-500/35"
                  placeholder={`curl 'https://example.com/api' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{"key":"value"}'`}
                />
              </div>

              <button
                onClick={handleParse}
                disabled={!curl.trim()}
                className="w-full rounded-lg border border-border-subtle px-3 py-2 text-xs font-medium text-text-body transition-colors hover:bg-surface-hover disabled:opacity-50"
              >
                解析 cURL
              </button>

              {parsed && (
                <div className="rounded-lg border border-border-subtle bg-surface-muted p-3">
                  <div className="mb-1 text-[11px] font-medium text-text-muted">解析结果</div>
                  <div className="space-y-1 text-xs text-text-body">
                    <div className="flex gap-2">
                      <span className="text-text-muted">方法:</span>
                      <span className="font-mono font-medium text-indigo-300">{parsed.method}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-text-muted">URL:</span>
                      <a
                        href={parsed.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate font-mono text-indigo-400 hover:text-indigo-300 hover:underline"
                      >
                        {parsed.url}
                      </a>
                    </div>
                    {Object.keys(parsed.headers).length > 0 && (
                      <div className="flex gap-2">
                        <span className="shrink-0 text-text-muted">Headers:</span>
                        <span className="font-mono">{Object.keys(parsed.headers).length} 个</span>
                      </div>
                    )}
                    {parsed.body && (
                      <div className="flex gap-2">
                        <span className="shrink-0 text-text-muted">Body:</span>
                        <span className="truncate font-mono">{parsed.body.slice(0, 50)}...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 字段选择 */}
          {selectedFields.length > 0 && (
            <div className="rounded-xl border border-border-subtle bg-surface-base p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  已选字段
                </h3>
                <button
                  onClick={() => {
                    if (lastResult) {
                      setFieldDialogData(lastResult);
                      setShowFieldDialog(true);
                    } else {
                      toast("请先执行一次任务", "error");
                    }
                  }}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300"
                >
                  重新选择
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedFields.map((field) => (
                  <span
                    key={field}
                    className="rounded-md border border-border-subtle bg-surface-muted px-2 py-0.5 text-[11px] text-text-body"
                  >
                    {field}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 执行和结果 */}
          {!isNew && (
            <div className="rounded-xl border border-border-subtle bg-surface-base p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  执行
                </h3>
                <button
                  onClick={handleRun}
                  disabled={running}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
                >
                  {running ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  运行
                </button>
              </div>

              {lastResult && selectedFields.length > 0 && (
                <div className="mt-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-text-muted">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    执行结果
                  </div>
                  <ResultCards data={lastResult} fields={selectedFields} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showFieldDialog && fieldDialogData && (
        <FieldSelectorDialog
          data={fieldDialogData}
          initialSelected={selectedFields}
          onConfirm={handleFieldConfirm}
          onCancel={() => {
            setShowFieldDialog(false);
            setFieldDialogData(null);
          }}
        />
      )}
    </div>
  );
}
