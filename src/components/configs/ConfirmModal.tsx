import { AlertTriangle } from "lucide-react";
import {
  BUTTON_DANGER_OUTLINE_CLASS,
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../../lib/buttonStyles";

interface ConfirmModalProps {
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel?: string;
  tertiaryLabel?: string;
  emphasisText?: string;
  primaryTone?: "danger" | "default";
  onPrimary: () => void;
  onSecondary?: () => void;
  onTertiary?: () => void;
}

export function ConfigConfirmModal({
  title,
  description,
  primaryLabel,
  secondaryLabel,
  tertiaryLabel,
  emphasisText,
  primaryTone = "default",
  onPrimary,
  onSecondary,
  onTertiary,
}: ConfirmModalProps) {
  const primaryButtonClass =
    primaryTone === "danger"
      ? BUTTON_DANGER_OUTLINE_CLASS
      : BUTTON_PRIMARY_CLASS;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-gray-800/90 bg-gray-950/95 p-6 shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10 text-amber-300">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold tracking-tight text-white">
              {title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-gray-400">{description}</p>
          </div>
        </div>

        {emphasisText && (
          <div className="mt-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/8 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-indigo-200/80">
              建议操作
            </p>
            <p className="mt-1 text-sm leading-6 text-indigo-100">
              {emphasisText}
            </p>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onPrimary}
            className={`flex min-w-[132px] items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
          >
            {primaryLabel}
          </button>
          {tertiaryLabel && onTertiary && (
            <button
              onClick={onTertiary}
              className={`flex min-w-[132px] items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium ${primaryButtonClass}`}
            >
              {tertiaryLabel}
            </button>
          )}
          {secondaryLabel && onSecondary && (
            <button
              onClick={onSecondary}
              className={`flex min-w-[132px] items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium ${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_XS_CLASS}`}
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
