import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Label — the marquee eyebrow motif. Saira Semi Condensed, uppercase, tracked.
 * Matches `.h-eyebrow` in the catalog: brand-label tone by default, muted opt-in.
 */
const labelVariants = cva(
  "inline-block font-marquee uppercase tracking-label text-caption font-bold",
  {
    variants: {
      tone: {
        brand: "text-brand-label",
        muted: "text-text-muted",
      },
    },
    defaultVariants: { tone: "brand" },
  }
);

export interface LabelProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof labelVariants> {}

export const Label = React.forwardRef<HTMLSpanElement, LabelProps>(
  ({ className, tone, ...props }, ref) => (
    <span ref={ref} className={cn(labelVariants({ tone }), className)} {...props} />
  )
);
Label.displayName = "Label";

export { labelVariants };
