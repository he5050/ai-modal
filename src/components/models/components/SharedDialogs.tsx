import { useEffect, useRef } from "react";
import { X, Trash2 } from "lucide-react";
import { animate, spring } from "animejs";
import {
  BUTTON_SECONDARY_CLASS,
  BUTTON_DANGER_OUTLINE_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../../../lib/buttonStyles";
import { Check } from "lucide-react";

export function DeleteDialog({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (overlayRef.current) {
      animate(overlayRef.current, {
        opacity: [0, 1],
        duration: 180,
        ease: "outQuad",
      });
    }
    if (cardRef.current) {
      animate(cardRef.current, {
        opacity: [0, 1],
        translateY: [12, 0],
        scale: [0.97, 1],
        ease: spring({ stiffness: 380, damping: 22 }),
        duration: 400,
      });
    }
  }, []);

  return (
    <div
      ref={overlayRef}
      style={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div
        ref={cardRef}
        style={{ opacity: 0 }}
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 shadow-xl"
      >
        <h3 className="text-sm font-semibold text-white mb-2">确认删除</h3>
        <p className="text-sm text-gray-400 mb-5">
          确定要删除{" "}
          <span className="text-gray-200 font-medium">{name}</span> 吗？此操作不可撤销。
        </p>
        <div className="flex justify-end gap-2">
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
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

export function SelectionCheckbox({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
        checked
          ? "border-indigo-500 bg-indigo-600 text-white"
          : "border-gray-600 bg-gray-800 text-transparent hover:border-indigo-500/60"
      }`}
    >
      <Check className="h-3 w-3" strokeWidth={3} />
    </button>
  );
}

export function StatusBadge({ available }: { available: boolean }) {
  return available ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      可用
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
      不可用
    </span>
  );
}
