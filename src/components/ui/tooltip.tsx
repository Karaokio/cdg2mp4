import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tooltip — a small token-driven hover/focus tooltip. Shows instantly (unlike the
 * native `title`, which is delayed and never appears on touch devices) and is
 * keyboard accessible: it opens on focus, closes on Escape, associates itself
 * with the trigger via aria-describedby, and does not open on touch taps.
 * Positions above the wrapped control.
 */
export function Tooltip({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactElement;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const child = React.Children.only(children) as React.ReactElement<{
    "aria-describedby"?: string;
  }>;

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={(e) => {
        // Don't open on touch taps (would fire alongside the click and linger).
        if (e.pointerType !== "touch") setOpen(true);
      }}
      onPointerLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      {React.cloneElement(child, { "aria-describedby": open ? id : undefined })}
      {open && (
        <span
          id={id}
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
