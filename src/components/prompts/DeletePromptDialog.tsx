import { Trash2, X } from "lucide-react";
import {
  BUTTON_DANGER_OUTLINE_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../../lib/buttonStyles";
import type { PromptRecord } from "../../types";

interface DeletePromptDialogProps {
  prompt: PromptRecord;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeletePromptDialog({
  prompt,
  onCancel,
  onConfirm,
}: DeletePromptDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-white">确认删除提示词</h3>
        <p className="mt-2 text-sm leading-6 text-gray-400">
          将删除 <span className="font-medium text-gray-200">{prompt.title}</span>
          ，该操作不可撤销。
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            <X className="h-3.5 w-3.5" />
            取消
          </button>
          <button
            onClick={onConfirm}
            className={`${BUTTON_DANGER_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}
