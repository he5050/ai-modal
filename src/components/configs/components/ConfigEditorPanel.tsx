import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { Copy, RotateCcw, Save, WandSparkles } from "lucide-react";
import {
  BUTTON_DANGER_OUTLINE_CLASS,
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_SM_CLASS,
} from "../../../lib/buttonStyles";
import { configEditorTheme, getConfigLanguageExtensions } from "../editorSetup";

interface ConfigEditorPanelProps {
  value: string;
  onChange: (value: string) => void;
  format: string;
  loading: boolean;
  fileName: string;
  fileExists: boolean;
  hasDirty: boolean;
  accentClass: string;
  onDiscard: () => void;
  onFormat: () => void;
  onCopy: () => void;
  onSave: () => void;
}

export function ConfigEditorPanel({
  value,
  onChange,
  format,
  loading,
  fileName,
  fileExists,
  hasDirty,
  accentClass,
  onDiscard,
  onFormat,
  onCopy,
  onSave,
}: ConfigEditorPanelProps) {
  const editorExtensions = [...getConfigLanguageExtensions(format), configEditorTheme];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs uppercase tracking-[0.2em] text-gray-500">内容</label>
          <span className={`rounded-full border px-2.5 py-1 text-xs ${accentClass}`}>{fileName}</span>
          <span className="rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-300">{format.toUpperCase()}</span>
          <span
            className={`rounded-full px-2.5 py-1 text-xs ${
              fileExists ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200"
            }`}
          >
            {fileExists ? "文件存在" : "文件不存在"}
          </span>
          {hasDirty && <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs text-indigo-200">有未保存改动</span>}
          {loading && <span className="rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-400">正在刷新</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onDiscard} disabled={!hasDirty} className={`${BUTTON_DANGER_OUTLINE_CLASS} ${BUTTON_SIZE_SM_CLASS}`}>
            <RotateCcw className="h-4 w-4" />
            丢弃更改
          </button>
          <button onClick={onFormat} disabled={!value} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_SM_CLASS}`} title="格式化配置">
            <WandSparkles className="h-4 w-4" />
            格式化
          </button>
          <button onClick={onCopy} disabled={!value} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_SM_CLASS}`}>
            <Copy className="h-4 w-4" />
            复制
          </button>
          <button onClick={onSave} className={`${BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_SM_CLASS}`}>
            <Save className="h-4 w-4" />
            保存
          </button>
        </div>
      </div>

      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={editorExtensions}
        theme={oneDark}
        editable
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          dropCursor: false,
          allowMultipleSelections: false,
          highlightActiveLineGutter: false,
        }}
        placeholder={loading ? "正在读取配置文件..." : "当前路径下还没有配置内容，你可以直接输入并保存。"}
        className="text-[#c2cad6]"
      />
    </div>
  );
}
