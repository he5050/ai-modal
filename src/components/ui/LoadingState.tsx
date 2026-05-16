import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

export interface LoadingStateProps {
  message?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP: Record<string, string> = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

export function LoadingState({ message, size = "md", className }: LoadingStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-8 text-center", className)}>
      <Loader2 className={cn("animate-spin text-indigo-500", SIZE_MAP[size])} />
      {message && <p className="mt-3 text-sm text-text-muted">{message}</p>}
    </div>
  );
}
