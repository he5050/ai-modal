import { cn } from "../../lib/cn";
import { FIELD_INPUT_CLASS, FIELD_MONO_INPUT_CLASS } from "../../lib/formStyles";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  mono?: boolean;
}

export function Input({ className, error, mono, ...rest }: InputProps) {
  return (
    <div className="w-full">
      <input
        className={cn(
          mono ? FIELD_MONO_INPUT_CLASS : FIELD_INPUT_CLASS,
          error && "border-red-500/80 focus:border-red-500/80 focus-visible:ring-red-500/35",
          className
        )}
        {...rest}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
