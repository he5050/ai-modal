import { X, Trash2 } from "lucide-react";
import { BUTTON_DANGER_OUTLINE_CLASS, BUTTON_SECONDARY_CLASS, BUTTON_SIZE_XS_CLASS } from "../../../lib/buttonStyles";

interface RemoveSkillDialogProps {
  pendingRemoveSkill: string;
  onCancel: () => void;
  onConfirm: (skillName: string) => void;
  commandRunning: boolean;
}

export function RemoveSkillDialog({
  pendingRemoveSkill,
  onCancel,
  onConfirm,
  commandRunning,
}: RemoveSkillDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-white">确认移除技能</h3>
        <p className="mt-3 text-sm text-gray-400">
          确定要移除技能{" "}
          <span className="font-medium text-gray-200">
            &quot;{pendingRemoveSkill}&quot;
          </span>{" "}
          吗？
          <br />
          <span className="text-xs text-gray-500">
            此操作将从 ~/.agents/skills 中删除该技能及其所有同步目标。
          </span>
        </p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className={`flex-1 ${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            <X className="h-4 w-4" />
            取消
          </button>
          <button
            onClick={() => onConfirm(pendingRemoveSkill)}
            disabled={commandRunning}
            className={`flex-1 ${BUTTON_DANGER_OUTLINE_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            <Trash2 className="h-4 w-4" />
            确认移除
          </button>
        </div>
      </div>
    </div>
  );
}
