import { cn } from "../../lib/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "interactive";
  hoverable?: boolean;
}

export function Card({ variant = "default", hoverable, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-surface-card p-4",
        variant === "interactive" && "cursor-pointer",
        hoverable && "transition-shadow duration-150 hover:shadow-lg hover:shadow-indigo-500/10",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
