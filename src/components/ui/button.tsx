import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button — the canonical CTA. Primary is the approved gradient fill.
 * Visual design lives entirely in these token-driven classes; Radix Slot only
 * adds polymorphism (`asChild`). No default shadcn appearance.
 */
const buttonVariants = cva(
  // base
  "inline-flex items-center justify-center gap-sm whitespace-nowrap font-body font-bold " +
    "rounded-md border border-transparent transition-[transform,box-shadow,background,filter] duration-[80ms] ease-standard " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)] " +
    "disabled:opacity-45 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary:
          "bg-[image:var(--brand-gradient)] text-text-onbrand shadow-brand " +
          "hover:-translate-y-px hover:brightness-105 active:translate-y-0",
        secondary:
          "bg-surface text-text border-border shadow-subtle hover:border-brand hover:text-brand",
        ghost:
          "bg-transparent text-text border-dashed border-border hover:border-brand hover:text-brand",
        link: "bg-transparent text-brand underline shadow-none border-none p-0 min-h-0",
      },
      size: {
        sm: "min-h-[34px] text-sm px-[13px] rounded-sm",
        md: "min-h-[var(--control-height)] text-base px-[18px]",
        lg: "min-h-[52px] text-lg px-6",
      },
      block: { true: "w-full", false: "" },
    },
    compoundVariants: [{ variant: "link", size: ["sm", "md", "lg"], class: "min-h-0 px-0" }],
    defaultVariants: { variant: "primary", size: "md", block: false },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size, block }), className)} {...props} />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
