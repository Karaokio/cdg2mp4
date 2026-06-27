import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tooltip — a small token-driven hover/focus tooltip. Shows instantly (unlike the
 * native `title`, which is delayed and never appears on touch devices) and is
 * keyboard accessible. Positions above the wrapped control.
 */
export function Tooltip({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <span
      className="relative inline-flex"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute bottom-full left-1/2 z-20 mb-sm w-max max-w-[240px] -translate-x-1/2",
            "rounded-md border border-border bg-surface px-md py-sm text-center text-sm leading-snug text-text-muted shadow-medium",
            className
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
