import { Label } from "@/components/ui";
import { cn } from "@/lib/utils";
import { RESOLUTIONS, type ResKey } from "@/lib/format";

export function ResolutionPicker({
  value,
  onChange,
}: {
  value: ResKey;
  onChange: (r: ResKey) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-md">
      <Label tone="muted">Quality</Label>
      <div className="inline-flex rounded-pill border border-border bg-surface p-[3px] shadow-subtle">
        {(Object.keys(RESOLUTIONS) as ResKey[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={value === k}
            onClick={() => onChange(k)}
            className={cn(
              "rounded-pill px-md py-[6px] font-marquee text-caption font-bold uppercase tracking-label",
              "transition-colors duration-[80ms] ease-standard",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]",
              value === k ? "bg-brand-wash text-brand" : "text-text-muted hover:text-text"
            )}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
