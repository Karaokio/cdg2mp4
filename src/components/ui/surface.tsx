import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Surface — the one card/panel. Padding and radius read the density tokens, so
 * the consumer app and the operator console share it without forking.
 */
const surfaceVariants = cva(
  "bg-surface border border-border shadow-subtle " +
    "rounded-[var(--card-radius)] p-[var(--card-padding)]",
  {
    variants: {
      interactive: {
        true:
          "cursor-pointer transition-[transform,box-shadow] duration-[160ms] ease-standard " +
          "hover:-translate-y-0.5 hover:shadow-medium",
        false: "",
      },
    },
    defaultVariants: { interactive: false },
  }
);

export interface SurfaceProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof surfaceVariants> {}

export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, interactive, ...props }, ref) => (
    <div ref={ref} className={cn(surfaceVariants({ interactive }), className)} {...props} />
  )
);
Surface.displayName = "Surface";

export { surfaceVariants };
