/* =============================================================================
   Karaokio — design tokens (TypeScript mirror)
   -----------------------------------------------------------------------------
   For values that need to be read in JS/TS rather than CSS: motion timings for
   JS-driven animation, scale lookups, and the Theme / Density unions used by
   the provider and CVA variants. CSS remains the source of truth for rendering;
   this mirror exists so logic can stay token-driven instead of magic numbers.
   ============================================================================= */

export const fontFamily = {
  display: "var(--font-display)",
  marquee: "var(--font-marquee)",
  body: "var(--font-body)",
  mono: "var(--font-mono)",
} as const;

/** Font-size step → utility class (use these, not arbitrary text-[13px]). */
export const textScale = [
  "caption",
  "sm",
  "base",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "display",
] as const;
export type TextStep = (typeof textScale)[number];

/** Spacing scale in px (CSS exposes the same as named gap / padding / margin utilities). */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const;
export type SpaceStep = keyof typeof space;

/** Radius scale in px. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  pill: 999,
} as const;
export type RadiusStep = keyof typeof radius;

/** Motion — durations in ms and named easings (mirror primitives.css). */
export const duration = {
  fast: 80,
  base: 160,
  slow: 280,
  breathe: 2000,
} as const;
export type DurationStep = keyof typeof duration;

export const easing = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  out: "cubic-bezier(0, 0, 0.2, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;
export type EasingStep = keyof typeof easing;

/** Elevation utility names (theme-aware via CSS). */
export const elevation = ["subtle", "medium", "strong", "brand"] as const;
export type Elevation = (typeof elevation)[number];

/** Set on <html>. Light is canonical; dark is opt-in. */
export type Theme = "light" | "dark";
/** Set on <html>. Comfortable for the consumer app; compact for the console. */
export type Density = "comfortable" | "compact";

/** Read a CSS custom property at runtime (e.g. for canvas / inline styles). */
export function cssVar(name: string): string {
  return `var(--${name})`;
}

export const tokens = {
  fontFamily,
  textScale,
  space,
  radius,
  duration,
  easing,
  elevation,
} as const;

export default tokens;
