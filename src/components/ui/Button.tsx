import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";
import {
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  BUTTON_GHOST_CLASS,
  BUTTON_DANGER_CLASS,
  BUTTON_SIZE_SM_CLASS,
  BUTTON_SIZE_MD_CLASS,
} from "../../lib/buttonStyles";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
  icon?: React.ReactNode;
}

const VARIANT_MAP: Record<string, string> = {
  primary: BUTTON_PRIMARY_CLASS,
  secondary: BUTTON_SECONDARY_CLASS,
  danger: BUTTON_DANGER_CLASS,
  ghost: BUTTON_GHOST_CLASS,
};

const SIZE_MAP: Record<string, string> = {
  sm: BUTTON_SIZE_SM_CLASS,
  md: BUTTON_SIZE_MD_CLASS,
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(VARIANT_MAP[variant], SIZE_MAP[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}
