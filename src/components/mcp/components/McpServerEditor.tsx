import { X } from "lucide-react";
import {
  BUTTON_ACCENT_OUTLINE_CLASS,
  BUTTON_ICON_GHOST_SM_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../../../lib/buttonStyles";
import { FIELD_INPUT_CLASS, FIELD_MONO_INPUT_CLASS } from "../../../lib/formStyles";

interface McpServerEditorProps {
  open: boolean;
  editingName: string | null;
  draftName: string;
  draftJson: string;
  onDraftNameChange: (v: string) => void;
  onDraftJsonChange: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export function McpServerEditor({
  open,
  editingName,
  draftName,
  draftJson,
  onDraftNameChange,
  onDraftJsonChange,
  onSave,
  onClose,
}: McpServerEditorProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-2xl rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            {editingName ? "编辑 MCP 服务" : "新增 MCP 服务"}
          </h3>
          <button onClick={onClose} className={BUTTON_ICON_GHOST_SM_CLASS}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <p className="mb-1 text-xs text-gray-400">服务名</p>
            <input
              value={draftName}
              onChange={(event) => onDraftNameChange(event.target.value)}
              className={FIELD_INPUT_CLASS}
              placeholder="例如：playwright"
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-gray-400">服务配置 JSON</p>
            <textarea
              value={draftJson}
              onChange={(event) => onDraftJsonChange(event.target.value)}
              className={`${FIELD_MONO_INPUT_CLASS} min-h-[260px] resize-y py-2`}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={onClose} className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
              取消
            </button>
            <button onClick={onSave} className={`${BUTTON_ACCENT_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}>
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
