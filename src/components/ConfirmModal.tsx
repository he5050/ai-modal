import {
  FilePenLine,
  Link2,
  Save,
  Trash2,
  X,
  ExternalLink,
} from "lucide-react";
import {
  BUTTON_DANGER_CLASS,
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_SIZE_SM_CLASS,
} from "../lib/buttonStyles";

export interface ConfirmModalProps {
  title: string;
  description: string;
  chips?: string[];
  primaryLabel: string;
  secondaryLabel?: string;
  tertiaryLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onPrimary: () => void;
  onSecondary?: () => void;
  onTertiary?: () => void;
}

function renderConfirmActionLabel(label: string) {
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
  title,
  description,
  chips,
  primaryLabel,
  secondaryLabel,
  tertiaryLabel,
  danger = false,
  busy = false,
  onPrimary,
  onSecondary,
  onTertiary,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-gray-400">{description}</p>
        {chips && chips.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-300"
              >
                {chip}
              </span>
            ))}
          </div>
        )}
        <div className="mt-6 space-y-2">
          <button
            onClick={onPrimary}
            disabled={busy}
            className={`flex w-full ${danger ? BUTTON_DANGER_CLASS : BUTTON_PRIMARY_CLASS} ${BUTTON_SIZE_SM_CLASS}`}
          >
            {renderConfirmActionLabel(primaryLabel)}
          </button>
          {secondaryLabel && onSecondary && (
            <button
              onClick={onSecondary}
              disabled={busy}
              className={`flex w-full ${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_SM_CLASS}`}
            >
              {renderConfirmActionLabel(secondaryLabel)}
            </button>
          )}
        </div>
        {tertiaryLabel && onTertiary && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={onTertiary}
              className={`${BUTTON_SECONDARY_CLASS} ${BUTTON_SIZE_SM_CLASS}`}
            >
              {renderConfirmActionLabel(tertiaryLabel)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
