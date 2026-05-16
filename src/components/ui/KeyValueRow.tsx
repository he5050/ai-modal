import { cn } from "../../lib/cn";

export interface KeyValueRowProps {
  label: string;
  value: string | React.ReactNode;
  mono?: boolean;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
}

export function KeyValueRow({
  label,
  value,
  mono,
  className,
  labelClassName,
  valueClassName,
}: KeyValueRowProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-1.5", className)}>
      <span className={cn("text-sm text-text-muted", labelClassName)}>{label}</span>
      <span
        className={cn(
          "text-sm text-text-body",
          mono && "font-mono",
          valueClassName
        )}
      >
        {value}
      </span>
    </div>
  );
}
