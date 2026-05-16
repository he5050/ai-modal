import { cn } from "@/lib/cn";

const TEXTAREA_BASE =
  "w-full rounded-lg border border-gray-700 bg-gray-950/90 px-3 py-2 text-sm text-gray-100 outline-none transition-colors duration-150 placeholder:text-gray-600 focus:border-indigo-500/80 focus-visible:ring-2 focus-visible:ring-indigo-500/35 disabled:cursor-not-allowed disabled:opacity-60";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export function Textarea({ className, error, ...rest }: TextareaProps) {
  return (
    <div className="w-full">
      <textarea
        className={cn(
          TEXTAREA_BASE,
          error && "border-red-500/80 focus:border-red-500/80 focus-visible:ring-red-500/35",
          className
        )}
        {...rest}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
