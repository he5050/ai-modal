import { cn } from "@/lib/cn";

export interface StatusBadgeProps {
  status: "success" | "warning" | "error" | "info" | "unknown";
  label: string;
  className?: string;
}

const STATUS_STYLE_MAP: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
  info: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  unknown: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLE_MAP[status] ?? STATUS_STYLE_MAP.unknown,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
