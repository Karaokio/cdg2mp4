import { Button, Label } from "@/components/ui";
import { track } from "@/lib/analytics";

/**
 * A finished conversion's video + download controls. Single mode uses the full
 * form (autoplay + "Convert another"); batch mode reuses it as the muted
 * preview of the most recently finished item.
 */
export function ResultPanel({
  url,
  name,
  resolution,
  autoPlay,
  onConvertAnother,
}: {
  url: string;
  name: string;
  resolution: string;
  autoPlay: boolean;
  onConvertAnother?: () => void;
}) {
  return (
    <div className="flex flex-col gap-lg">
      <video
        src={url}
        controls
        autoPlay={autoPlay}
        loop={autoPlay}
        aria-label={`Converted karaoke video: ${name}`}
        className="w-full rounded-lg shadow-medium"
      />
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <Label tone="muted">{autoPlay ? "Ready" : "Latest"}</Label>
          <p className="font-body font-semibold">{name}</p>
        </div>
        <div className="flex gap-sm">
          {onConvertAnother && (
            <Button variant="secondary" type="button" onClick={onConvertAnother}>
              Convert another
            </Button>
          )}
          <Button asChild variant="primary">
            <a href={url} download={name} onClick={() => track("download_clicked", { resolution })}>
              Download MP4
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
