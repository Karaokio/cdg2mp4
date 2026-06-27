import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Spinner — token-driven loading ring. Matches `.ko-spinner` in the catalog:
 * 22px, brand top-border, 0.7s linear spin.
 */
export function Spinner({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block h-[22px] w-[22px] rounded-full border-[2.5px] border-border border-t-brand " +
          "[animation:spin_0.7s_linear_infinite]",
        className
      )}
      {...props}
    />
  );
}

/** Skeleton — shimmering placeholder. Matches `.ko-skel`. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-sm bg-[length:400%_100%] [animation:shimmer_1.4s_ease_infinite] " +
          "bg-[linear-gradient(90deg,var(--background-sunken)_25%,var(--border)_37%,var(--background-sunken)_63%)]",
        className
      )}
      {...props}
    />
  );
}
