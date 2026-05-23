import { useEffect, useState } from "react";
import {
  Plus,
  Play,
  Eye,
  Pencil,
  Trash2,
  Terminal,
  Clock,
  CheckCircle2,
  Loader2,
  ExternalLink,
} from "lucide-react";
import type { CurlTask } from "@/types";
import { loadCurlTasks, deleteCurlTask, executeCurlTask, saveCurlTask } from "@/api";
import { toast } from "@/lib/toast";
import ResultCards from "./ResultCards";
import FieldSelectorDialog from "./FieldSelectorDialog";

interface CurlTaskPageProps {
  onOpenDetail: (taskId: string | null, mode: "create" | "edit") => void;
}

export default function CurlTaskPage({ onOpenDetail }: CurlTaskPageProps) {
  const [tasks, setTasks] = useState<CurlTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [showResultId, setShowResultId] = useState<string | null>(null);
  const [fieldDialogTask, setFieldDialogTask] = useState<CurlTask | null>(null);
  const [fieldDialogData, setFieldDialogData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      setLoading(true);
      const data = await loadCurlTasks();
      setTasks(data);
    } catch (err) {
      toast("加载失败: " + String(err), "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleRun(task: CurlTask) {
    try {
      setRunningId(task.id);
      const result = await executeCurlTask(task.id);

      if (!result.ok || !result.data) {
        toast("执行失败: " + (result.error || `HTTP ${result.status}`), "error");
        return;
      }

      // 如果没有选择字段，弹出选择框
      if (task.selectedFields.length === 0) {
        setFieldDialogTask(task);
        setFieldDialogData(result.data as Record<string, unknown>);
        return;
      }

      // 更新任务结果
      const updatedTask: CurlTask = {
        ...task,
        lastResult: result.data as Record<string, unknown>,
        lastRunAt: Date.now(),
      };
      await saveCurlTask(updatedTask);
      setShowResultId(task.id);
      await loadTasks();

      toast("执行成功: HTTP " + result.status);
    } catch (err) {
      toast("执行失败: " + String(err), "error");
    } finally {
      setRunningId(null);
    }
  }

  async function handleFieldConfirm(fields: string[]) {
    if (!fieldDialogTask || !fieldDialogData) return;

    try {
      const updatedTask: CurlTask = {
        ...fieldDialogTask,
        selectedFields: fields,
        lastResult: fieldDialogData,
        lastRunAt: Date.now(),
      };
      await saveCurlTask(updatedTask);
      setShowResultId(fieldDialogTask.id);
      await loadTasks();

      toast(`已保存字段选择: 选择了 ${fields.length} 个字段`);
    } catch (err) {
      toast("保存失败: " + String(err), "error");
    } finally {
      setFieldDialogTask(null);
      setFieldDialogData(null);
      setRunningId(null);
    }
  }

  async function handleDelete(task: CurlTask) {
    if (!confirm(`确定要删除「${task.label}」吗？`)) return;
    try {
      await deleteCurlTask(task.id);
      await loadTasks();
      toast("已删除");
    } catch (err) {
      toast("删除失败: " + String(err), "error");
    }
  }

  function formatTime(ts?: number | null): string {
    if (!ts) return "未运行";
    const diff = Date.now() - ts;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return new Date(ts).toLocaleDateString("zh-CN");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-6 py-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-text-heading">cURL 任务</h2>
          <span className="rounded-lg border border-border-subtle bg-surface-muted px-2 py-0.5 text-[11px] text-text-muted">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onOpenDetail(null, "create")}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600"
        >
          <Plus className="h-3.5 w-3.5" />
          添加任务
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-text-muted">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <Terminal className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">暂无 cURL 任务</p>
            <p className="mt-1 text-xs">点击右上角添加第一个任务</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-xl border border-border-subtle bg-surface-base transition-colors hover:border-border-default"
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-medium text-text-heading">
                        {task.label}
                      </h3>
                      {task.selectedFields.length > 0 && (
                        <span className="shrink-0 rounded border border-border-subtle bg-surface-muted px-1.5 py-0 text-[10px] text-text-muted">
                          {task.selectedFields.length} 字段
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-text-muted">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(task.lastRunAt)}
                      </span>
                      <a
                        href={task.parsedCurl.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate font-mono text-indigo-400 hover:text-indigo-300 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {task.parsedCurl.url}
                      </a>
                    </div>
                  </div>

                  <div className="ml-3 flex shrink-0 items-center gap-1">
                    <a
                      href={task.parsedCurl.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border-subtle text-text-body transition-colors hover:bg-surface-hover hover:text-indigo-400"
                      title="访问 URL"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>

                    <button
                      onClick={() => handleRun(task)}
                      disabled={runningId === task.id}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border-subtle text-text-body transition-colors hover:bg-surface-hover hover:text-indigo-400 disabled:opacity-50"
                      title="运行"
                    >
                      {runningId === task.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {task.lastResult && (
                      <button
                        onClick={() =>
                          setShowResultId(showResultId === task.id ? null : task.id)
                        }
                        className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
                          showResultId === task.id
                            ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-400"
                            : "border-border-subtle text-text-body hover:bg-surface-hover"
                        }`}
                        title="查看结果"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => onOpenDetail(task.id, "edit")}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border-subtle text-text-body transition-colors hover:bg-surface-hover hover:text-text-heading"
                      title="编辑"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>

                    <button
                      onClick={() => handleDelete(task)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border-subtle text-text-body transition-colors hover:bg-red-500/10 hover:text-red-400"
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {showResultId === task.id && task.lastResult && (
                  <div className="border-t border-border-subtle px-4 py-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-text-muted">
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      执行结果
                    </div>
                    <ResultCards data={task.lastResult} fields={task.selectedFields} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {fieldDialogTask && fieldDialogData && (
        <FieldSelectorDialog
          data={fieldDialogData}
          initialSelected={fieldDialogTask.selectedFields}
          onConfirm={handleFieldConfirm}
          onCancel={() => {
            setFieldDialogTask(null);
            setFieldDialogData(null);
            setRunningId(null);
          }}
        />
      )}
    </div>
  );
}
