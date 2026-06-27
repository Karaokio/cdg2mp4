import * as React from "react";
import { Button, Label, Spinner, Surface } from "@/components/ui";
import { cn } from "@/lib/utils";
import { convertCdgToMp4 } from "@/lib/ffmpeg";
import { RESOLUTIONS, resolutionToSize, formatLeft, type ResKey } from "@/lib/format";
import { extractPairFromZip, pairFromFiles, type CdgPair } from "@/lib/zip";
import {
  trackConversionStarted,
  trackConversionSucceeded,
  trackConversionFailed,
  track,
  mbBucket,
  classifyError,
  songName,
  type InputType,
} from "@/lib/analytics";

type Status = "idle" | "working" | "done" | "error";

const read = async (f: File) => new Uint8Array(await f.arrayBuffer());

/** Turn dropped/selected files into a {cdg, mp3} pair (zip or loose files). */
async function filesToPair(files: File[]): Promise<CdgPair> {
  const zip = files.find((f) => f.name.toLowerCase().endsWith(".zip"));
  if (zip) return extractPairFromZip(await read(zip));

  const cdg = files.find((f) => f.name.toLowerCase().endsWith(".cdg"));
  const mp3 = files.find((f) => f.name.toLowerCase().endsWith(".mp3"));
  if (cdg && mp3) return pairFromFiles(await read(cdg), await read(mp3), cdg.name);

  throw new Error("Drop a karaoke .zip, or a matching .cdg and .mp3 together.");
}

function ResolutionPicker({ value, onChange }: { value: ResKey; onChange: (r: ResKey) => void }) {
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

export function Converter() {
  const [status, setStatus] = React.useState<Status>("idle");
  const [resolution, setResolution] = React.useState<ResKey>("1080p");
  const [progress, setProgress] = React.useState(0);
  const [phase, setPhase] = React.useState("");
  const [eta, setEta] = React.useState(0);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState<{ url: string; name: string } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const startedAt = React.useRef<number | null>(null);

  // Revoke the object URL when it's replaced or the component unmounts.
  React.useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  const run = React.useCallback(
    async (files: File[]) => {
      if (result) URL.revokeObjectURL(result.url);
      setResult(null);
      setError("");
      setProgress(0);
      setEta(0);
      startedAt.current = null;
      setStatus("working");

      const inputType: InputType = files.some((f) => f.name.toLowerCase().endsWith(".zip"))
        ? "zip"
        : "loose";
      const t0 = Date.now();
      let stage = "read";
      let source: string | undefined;
      trackConversionStarted({ input_type: inputType, resolution });
      try {
        setPhase("Reading files…");
        const pair = await filesToPair(files);
        source = songName(pair.baseName);

        stage = "load";
        setPhase("Loading converter…");
        const mp4 = await convertCdgToMp4(pair.cdg, pair.mp3, {
          size: resolutionToSize(resolution),
          onProgress: (r) => {
            stage = "convert";
            setProgress(r);
            setPhase("Converting…");
            // Estimate remaining time from the measured encode rate.
            if (startedAt.current == null) startedAt.current = Date.now();
            const elapsed = (Date.now() - startedAt.current) / 1000;
            if (r > 0.03 && elapsed > 1.5) setEta((elapsed * (1 - r)) / r);
          },
        });

        const blob = new Blob([mp4 as BlobPart], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        setResult({ url, name: `${pair.baseName}.mp4` });
        setProgress(1);
        setStatus("done");
        trackConversionSucceeded({
          input_type: inputType,
          resolution,
          duration_ms: Date.now() - t0,
          output_mb_bucket: mbBucket(blob.size),
          source_name: source,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        setStatus("error");
        trackConversionFailed({
          input_type: inputType,
          resolution,
          stage,
          reason: classifyError(message),
          source_name: source,
        });
      }
    },
    [result, resolution]
  );

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file
    if (files.length && status !== "working") void run(files);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (status === "working") return; // don't start a second conversion mid-run
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void run(files);
  };

  const working = status === "working";
  const pct = Math.round(progress * 100);
  const showPicker = status === "idle" || status === "error";

  return (
    <Surface className="flex flex-col gap-lg">
      <input ref={inputRef} type="file" accept=".zip,.cdg,.mp3" multiple hidden onChange={onPick} />

      {showPicker && <ResolutionPicker value={resolution} onChange={setResolution} />}

      {/* Dropzone */}
      {status !== "done" && (
        // A drop region (not a button). The "Choose files" Button inside is the
        // keyboard-accessible trigger; its click bubbles here to open the picker.
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !working && inputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-md rounded-lg border-2 border-dashed",
            "px-xl py-3xl text-center transition-colors duration-[160ms] ease-standard",
            working ? "cursor-default opacity-60" : "cursor-pointer",
            dragging ? "border-brand bg-brand-wash" : "border-border hover:border-brand"
          )}
        >
          {working ? (
            <>
              <Spinner />
              <p className="font-body font-semibold text-base" aria-live="polite">
                {phase}
              </p>
              {progress > 0 ? (
                <div className="w-full max-w-[360px]">
                  <div
                    role="progressbar"
                    aria-label="Conversion progress"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-2 w-full overflow-hidden rounded-pill bg-background-sunken"
                  >
                    <div
                      className="h-full rounded-pill bg-[image:var(--brand-gradient)] transition-[width] duration-200 ease-out"
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                  <p className="mt-sm font-mono text-sm text-text-muted">
                    {pct}%{eta > 0 ? ` · ${formatLeft(eta)}` : ""}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-text-muted">Hang tight, this can take a moment.</p>
              )}
            </>
          ) : (
            <>
              <Label>Drop it here</Label>
              <p className="font-display text-xl font-bold">Drag a karaoke .zip to convert</p>
              <p className="max-w-[42ch] text-base text-text-muted">
                Or a matching <code className="font-mono">.cdg</code> and{" "}
                <code className="font-mono">.mp3</code> together.
                <br />
                It all runs right here in your browser.
              </p>
              <Button variant="primary" type="button" className="mt-sm">
                Choose files
              </Button>
            </>
          )}
        </div>
      )}

      {/* Expectation note (idle only) */}
      {status === "idle" && (
        <p className="text-center text-sm text-text-muted">
          A typical song takes about a minute, a little longer at 1080p.
          <br />
          The first conversion is slower while the converter downloads.
        </p>
      )}

      {/* Result */}
      {status === "done" && result && (
        <div className="flex flex-col gap-lg">
          <video
            src={result.url}
            controls
            autoPlay
            loop
            aria-label={`Converted karaoke video: ${result.name}`}
            className="w-full rounded-lg shadow-medium"
          />
          <div className="flex flex-wrap items-center justify-between gap-md">
            <div>
              <Label tone="muted">Ready</Label>
              <p className="font-body font-semibold">{result.name}</p>
            </div>
            <div className="flex gap-sm">
              <Button variant="secondary" type="button" onClick={() => setStatus("idle")}>
                Convert another
              </Button>
              <Button asChild variant="primary">
                <a
                  href={result.url}
                  download={result.name}
                  onClick={() => track("download_clicked", { resolution })}
                >
                  Download MP4
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div
          role="alert"
          className="rounded-md border border-brand bg-brand-wash px-lg py-md text-base text-brand-strong"
        >
          {error}
        </div>
      )}
    </Surface>
  );
}
