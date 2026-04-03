import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Tooltip } from "./Tooltip";

type Placement = "top" | "bottom" | "left" | "right";

interface HintTooltipProps {
  content: ReactNode;
  placement?: Placement;
  className?: string;
}

export function HintTooltip({
  content,
  placement = "top",
  className = "",
}: HintTooltipProps) {
  return (
    <Tooltip
      content={
        <div className="max-w-[280px] break-words text-left leading-5">
          {content}
        </div>
      }
      placement={placement}
      delay={120}
    >
      <span
        tabIndex={0}
        aria-label="查看提示说明"
        className={`inline-flex h-4 w-4 shrink-0 cursor-default items-center justify-center rounded-full text-gray-500 transition-colors hover:text-gray-300 focus:outline-none focus-visible:text-gray-100 ${className}`}
      >
        <CircleAlert className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
    </Tooltip>
  );
}
