import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { Copy, Save, WandSparkles } from "lucide-react";
import {
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_SM_CLASS,
} from "../../lib/buttonStyles";
import { toast } from "../../lib/toast";
import { editorExtensions } from "./editorSetup";

interface RuleEditorProps {
  contentDraft: string;
  onContentChange: (value: string) => void;
  fileExists: boolean;
  loadingContent: boolean;
  dirty: boolean;
  saving: boolean;
  isDirectory: boolean;
  isBuiltin: boolean;
  fileName: string;
  accentClass: string;
  onSave: () => void;
}

export function RuleEditor({
  contentDraft,
  onContentChange,
  fileExists,
  loadingContent,
  dirty,
  saving,
  isDirectory,
  isBuiltin,
  fileName,
  accentClass,
  onSave,
}: RuleEditorProps) {
  async function handleFormat() {
    if (!contentDraft) return;
    try {
      const [{ default: prettier }, markdownPluginModule] = await Promise.all([
        import("prettier/standalone"),
        import("prettier/plugins/markdown"),
      ]);
      const formatted = await prettier.format(contentDraft, {
        parser: "markdown",
        plugins: [markdownPluginModule.default ?? markdownPluginModule],
      });
      onContentChange(formatted);
      toast("已按标准 Markdown formatter 格式化", "success");
    } catch (error) {
      console.error("Failed to format markdown", error);
      toast("Markdown 格式化失败", "error");
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(contentDraft);
      toast("已复制当前规则内容", "success");
    } catch (error) {
      console.error("Failed to copy content", error);
      toast("复制失败", "error");
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs uppercase tracking-[0.2em] text-gray-500">
            内容
          </label>
          <span
            className={`rounded-full border px-2.5 py-1 text-xs ${accentClass}`}
          >
            {isBuiltin ? fileName : "自定义"}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-xs ${
              fileExists
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-amber-500/15 text-amber-200"
            }`}
          >
            {fileExists
              ? isDirectory
                ? "目录存在"
                : "文件存在"
              : isDirectory
                ? "目录不存在"
                : "文件不存在"}
          </span>
          {dirty && (
            <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs text-indigo-200">
              有未保存改动
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleFormat}
            disabled={!contentDraft || isDirectory}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_SM_CLASS}`}
            title="格式化 Markdown"
          >
            <WandSparkles className="h-4 w-4" />
            格式化
          </button>
          <button
            onClick={handleCopy}
            disabled={!contentDraft}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_SM_CLASS}`}
          >
            <Copy className="h-4 w-4" />
            复制
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_SM_CLASS}`}
          >
            <Save className="h-4 w-4" />
            保存
          </button>
        </div>
      </div>

      <CodeMirror
        value={contentDraft}
        onChange={onContentChange}
        extensions={editorExtensions}
        theme={oneDark}
        editable={!isDirectory}
        readOnly={isDirectory}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          dropCursor: false,
          allowMultipleSelections: false,
          indentOnInput: true,
          highlightActiveLineGutter: false,
        }}
        placeholder={
          isDirectory
            ? "当前规则项是目录类型，支持路径管理与打开目录，不支持直接编辑目录内容。"
            : loadingContent
              ? "正在读取文件内容..."
              : "当前路径下还没有文件内容，你可以直接输入并保存。"
        }
        className="rules-markdown-editor text-[#c2cad6]"
      />
    </div>
  );
}
