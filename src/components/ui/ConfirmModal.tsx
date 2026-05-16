import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  FilePenLine,
  Link2,
  Save,
  Trash2,
  X,
  ExternalLink,
} from "lucide-react";
import { animate, spring } from "animejs";
import {
  BUTTON_DANGER_CLASS,
  BUTTON_DANGER_OUTLINE_CLASS,
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_SM_CLASS,
  BUTTON_SIZE_XS_CLASS,
} from "../../lib/buttonStyles";

export type ConfirmVariant = "default" | "compact" | "warning";

export interface ConfirmModalProps {
  open?: boolean;
  title: string;
  description?: string;
  name?: string;
  chips?: string[];
  emphasisText?: string;
  primaryLabel: string;
  secondaryLabel?: string;
  tertiaryLabel?: string;
  variant?: ConfirmVariant;
  danger?: boolean;
  busy?: boolean;
  showWarningIcon?: boolean;
  animated?: boolean;
  onPrimary: () => void;
  onSecondary?: () => void;
  onTertiary?: () => void;
}

function renderActionLabel(label: string, showIcon = true) {
  if (!showIcon) return label;
  const Icon =
    label.includes("删除") || label.includes("移除")
      ? Trash2
      : label.includes("取消")
        ? X
        : label.includes("保存")
          ? Save
          : label.includes("编辑")
            ? FilePenLine
            : label.includes("同步")
              ? Link2
              : label.includes("切换")
                ? ExternalLink
                : null;

  return (
    <>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {label}
    </>
  );
}

export function ConfirmModal({
  open = true,
  title,
  description,
  name,
  chips,
  emphasisText,
  primaryLabel,
  secondaryLabel,
  tertiaryLabel,
  variant = "default",
  danger = false,
  busy = false,
  showWarningIcon = false,
  animated = false,
  onPrimary,
  onSecondary,
  onTertiary,
}: ConfirmModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !animated) return;
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
  }, [open, animated]);

  if (!open) return null;

  const isCompact = variant === "compact";
  const isWarning = variant === "warning";
  const primaryBtnClass = danger || isWarning
    ? isCompact ? BUTTON_DANGER_OUTLINE_CLASS : BUTTON_DANGER_CLASS
    : BUTTON_PRIMARY_CLASS;
  const sizeClass = isCompact ? BUTTON_SIZE_XS_CLASS : BUTTON_SIZE_SM_CLASS;

  const overlayBase = "fixed inset-0 z-[95] flex items-center justify-center bg-black/60";
  const cardBase = isWarning
    ? "w-full max-w-lg rounded-3xl border border-gray-800/90 bg-gray-950/95 p-6 shadow-[0_32px_80px_rgba(0,0,0,0.45)]"
    : isCompact
      ? "bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 shadow-xl"
      : "w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl";

  const descText = description ?? (name
    ? (
      <>
        确定要删除{" "}
        <span className="text-gray-200 font-medium">{name}</span> 吗？此操作不可撤销。
      </>
    )
    : null);

  return (
    <div
      ref={overlayRef}
      style={animated ? { opacity: 0 } : undefined}
      className={isWarning ? `${overlayBase} backdrop-blur-sm px-4` : overlayBase}
    >
      <div
        ref={cardRef}
        style={animated ? { opacity: 0 } : undefined}
        className={cardBase}
      >
        {isWarning && showWarningIcon && (
          <div className="flex items-start gap-4">
            <div className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10 text-amber-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold tracking-tight text-white">{title}</h3>
              {descText && <p className="mt-2 text-sm leading-6 text-gray-400">{descText}</p>}
            </div>
          </div>
        )}

        {(!isWarning || !showWarningIcon) && (
          <>
            <h3 className={`text-base font-semibold ${isWarning ? "tracking-tight " : ""}text-white`}>
              {title}
            </h3>
            {descText && <p className="mt-3 text-sm leading-6 text-gray-400">{descText}</p>}
          </>
        )}

        {chips && chips.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <span key={chip} className="rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-300">
                {chip}
              </span>
            ))}
          </div>
        )}

        {emphasisText && (
          <div className="mt-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/8 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-indigo-200/80">建议操作</p>
            <p className="mt-1 text-sm leading-6 text-indigo-100">{emphasisText}</p>
          </div>
        )}

        {isCompact ? (
          <div className="flex justify-end gap-2">
            {secondaryLabel && onSecondary && (
              <button onClick={onSecondary} className={`${BUTTON_SECONDARY_CLASS} ${sizeClass}`}>
                <X className="h-3.5 w-3.5" />
                {secondaryLabel}
              </button>
            )}
            <button onClick={onPrimary} className={`${primaryBtnClass} ${sizeClass}`}>
              <Trash2 className="h-3.5 w-3.5" />
              {primaryLabel}
            </button>
          </div>
        ) : isWarning ? (
          <div className="mt-5 flex items-center justify-end gap-2">
            <button onClick={onPrimary} className={`${primaryBtnClass} ${sizeClass}`}>
              {primaryLabel}
            </button>
            {tertiaryLabel && onTertiary && (
              <button onClick={onTertiary} className={`${primaryBtnClass} ${sizeClass}`}>
                {tertiaryLabel}
              </button>
            )}
            {secondaryLabel && onSecondary && (
              <button onClick={onSecondary} className={`${BUTTON_SECONDARY_CLASS} ${sizeClass}`}>
                {secondaryLabel}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-6 space-y-2">
            <button onClick={onPrimary} disabled={busy} className={`flex w-full ${primaryBtnClass} ${sizeClass}`}>
              {renderActionLabel(primaryLabel)}
            </button>
            {secondaryLabel && onSecondary && (
              <button onClick={onSecondary} disabled={busy} className={`flex w-full ${BUTTON_SECONDARY_CLASS} ${sizeClass}`}>
                {renderActionLabel(secondaryLabel)}
              </button>
            )}
          </div>
        )}

        {tertiaryLabel && onTertiary && !isCompact && !isWarning && (
          <div className="mt-4 flex justify-end">
            <button onClick={onTertiary} className={`${BUTTON_SECONDARY_CLASS} ${sizeClass}`}>
              {renderActionLabel(tertiaryLabel)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function DeleteDialog({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmModal
      title="确认删除"
      name={name}
      variant="compact"
      danger
      animated
      primaryLabel="删除"
      secondaryLabel="取消"
      onPrimary={onConfirm}
      onSecondary={onCancel}
    />
  );
}
