import { useEffect, useRef } from "react";
import { animate, spring } from "animejs";
import { AlertTriangle } from "lucide-react";
import {
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_SM_CLASS,
} from "@/lib/buttonStyles";

export function ImportConfirmDialog({
  fileName,
  onConfirm,
  onCancel,
}: {
  fileName: string;
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
        scale: [0.96, 1],
        duration: 200,
        ease: spring({ stiffness: 300, damping: 24 }),
      });
    }
  }, []);

  return (
    <div
      ref={overlayRef}
      style={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
    >
      <div
        ref={cardRef}
        style={{ opacity: 0 }}
        className="w-[400px] rounded-2xl border border-amber-500/25 bg-gray-900 p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white">确认导入配置？</h3>
            <p className="mt-1 text-sm leading-6 text-gray-400">
              将从 <span className="font-mono text-amber-300">{fileName}</span> 导入配置，
              <span className="text-amber-300">清空并覆盖</span>当前所有模块配置与代理设置，操作不可恢复。
            </p>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              建议先导出当前配置作为备份。导入后应用将自动刷新。
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_SM_CLASS}`}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-gray-950 transition-colors hover:bg-amber-400"
          >
            确认导入
          </button>
        </div>
      </div>
    </div>
  );
}
