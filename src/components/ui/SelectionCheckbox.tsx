import { Check } from "lucide-react";

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
      className={getSelectionCheckboxClassName(checked)}
    >
      <Check className="h-3 w-3" strokeWidth={3} />
    </button>
  );
}

export function getSelectionCheckboxClassName(checked: boolean) {
  return `flex h-4 w-4 items-center justify-center rounded border transition-colors ${
    checked
      ? "border-indigo-500 bg-indigo-600 text-white"
      : "border-gray-600 bg-gray-800 text-transparent hover:border-indigo-500/60"
  }`;
}
