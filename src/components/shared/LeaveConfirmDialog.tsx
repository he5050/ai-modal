import { useEffect, useRef } from "react";
import { animate, spring } from "animejs";
import { AlertTriangle } from "lucide-react";

export function LeaveConfirmDialog({
  onConfirm,
  onCancel,
}: {
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
        className="w-[360px] rounded-2xl border border-amber-500/25 bg-gray-900 p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">离开当前编辑？</h3>
            <p className="mt-1 text-sm leading-6 text-gray-400">
              当前有未保存的改动，离开后会丢失。确认继续切换页面吗？
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
          >
            继续编辑
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-gray-950 transition-colors hover:bg-amber-400"
          >
            放弃并离开
          </button>
        </div>
      </div>
    </div>
  );
}

export function PageFallback() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center px-6 pb-6">
      <div className="rounded-2xl border border-gray-800 bg-gray-900/80 px-6 py-8 text-center">
        <p className="text-sm font-medium text-gray-200">正在加载页面…</p>
        <p className="mt-2 text-xs text-gray-500">
          编辑器相关模块将按需加载，以减少首屏包体积。
        </p>
      </div>
    </div>
  );
}
