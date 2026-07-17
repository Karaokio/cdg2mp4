import * as React from "react";
import { Button, Label, Spinner, Surface } from "@/components/ui";
import { cn } from "@/lib/utils";
import { convertCdgToMp4, cancelConversion } from "@/lib/ffmpeg";
import { RESOLUTIONS, resolutionToSize, formatLeft, type ResKey } from "@/lib/format";
import { extractPairFromZip, pairFromFiles, ZipPairError } from "@/lib/zip";
import { selectInput, type Held } from "@/lib/inputFiles";
import { setConverting } from "@/lib/converting";
import { FeedbackPrompt } from "@/components/Feedback";
import {
  trackConversionStarted,
  trackConversionSucceeded,
  trackConversionFailed,
  trackConversionCancelled,
  track,
  mbBucket,
  classifyError,
  errorDetail,
  fileName,
  type InputType,
} from "@/lib/analytics";

type Status = "idle" | "working" | "done" | "error";

const read = async (f: File) => new Uint8Array(await f.arrayBuffer());

/** A complete conversion input: a zip, or a cdg+mp3 pair (possibly completed
 * from a file held back from an earlier lone drop, see selectInput). */
type RunInput = { type: "zip"; zip: File } | { type: "pair"; cdg: File; mp3: File };

const partnerExt = (kind: "cdg" | "mp3") => (kind === "cdg" ? ".mp3" : ".cdg");

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
  const [held, setHeld] = React.useState<Held<File> | null>(null);
  const [lastInput, setLastInput] = React.useState<InputType | undefined>();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const startedAt = React.useRef<number | null>(null);
  const cancelled = React.useRef(false); // user hit Cancel during this run
  const progressNow = React.useRef(0); // latest progress, for the cancel event

  // Revoke the object URL when it's replaced or the component unmounts.
  React.useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  const run = React.useCallback(
    async (input: RunInput) => {
      if (result) URL.revokeObjectURL(result.url);
      setResult(null);
      setError("");
      setProgress(0);
      setEta(0);
      startedAt.current = null;
      cancelled.current = false;
      progressNow.current = 0;
      setStatus("working");
      setHeld(null); // consumed by this conversion, or superseded by a zip

      const inputType: InputType = input.type;
      // The input filenames, captured up front (contents never leave the device).
      const inputNames =
        input.type === "zip"
          ? { zip_name: fileName(input.zip.name) }
          : { cdg_name: fileName(input.cdg.name), mp3_name: fileName(input.mp3.name) };
      const t0 = Date.now();
      let stage = "read";
      let outputName: string | undefined; // the resulting <song>.mp4 (known after parsing)
      setLastInput(inputType);
      setConverting(true); // hold off any service-worker auto-update reload until done
      trackConversionStarted({ input_type: inputType, resolution, ...inputNames });
      try {
        setPhase("Reading files…");
        const pair =
          input.type === "zip"
            ? extractPairFromZip(await read(input.zip))
            : pairFromFiles(await read(input.cdg), await read(input.mp3), input.cdg.name);
        outputName = fileName(`${pair.baseName}.mp4`);

        stage = "load";
        setPhase("Loading converter…");
        const mp4 = await convertCdgToMp4(pair.cdg, pair.mp3, {
          size: resolutionToSize(resolution),
          onProgress: (r) => {
            stage = "convert";
            progressNow.current = r;
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
          ...inputNames,
          output_name: outputName,
        });
      } catch (e) {
        if (cancelled.current) {
          // User-requested stop, not a failure: back to the empty dropzone.
          setStatus("idle");
          setPhase("");
          trackConversionCancelled({
            input_type: inputType,
            resolution,
            stage,
            progress_pct: Math.round(progressNow.current * 100),
            duration_ms: Date.now() - t0,
            ...inputNames,
          });
          return;
        }
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        setStatus("error");
        trackConversionFailed({
          input_type: inputType,
          resolution,
          stage,
          reason: classifyError(message),
          ...errorDetail(e),
          zip_extensions: e instanceof ZipPairError ? e.extensions?.join(",") : undefined,
          ...inputNames,
          output_name: outputName,
        });
      } finally {
        setConverting(false); // idle again; a pending update may now auto-apply
      }
    },
    [result, resolution]
  );

  // Route dropped/selected files: start a conversion when the input is
  // complete, hold a lone .cdg/.mp3 and ask for its partner, reject the rest.
  const onFiles = React.useCallback(
    (files: File[]) => {
      const sel = selectInput(files, held);
      if (sel.type === "hold") {
        setHeld({ kind: sel.kind, file: sel.file });
        setError("");
        setStatus("idle");
        track("lone_file_held", { file_kind: sel.kind, file_name: fileName(sel.file.name) });
        return;
      }
      if (sel.type === "reject") {
        const exts = sel.extensions.filter((x) => x !== "none").map((x) => `.${x}`);
        setError(
          `Can't convert ${exts.length ? `${exts.join(" / ")} files` : "those files"}. ` +
            "Drop a karaoke .zip, or a matching .cdg and .mp3 together."
        );
        setStatus("error");
        track("input_rejected", { extensions: sel.extensions.join(",") });
        return;
      }
      void run(sel);
    },
    [held, run]
  );

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file
    if (files.length && status !== "working") onFiles(files);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (status === "working") return; // don't start a second conversion mid-run
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) onFiles(files);
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
              <Button
                variant="secondary"
                type="button"
                className="mt-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  cancelled.current = true;
                  cancelConversion();
                }}
              >
                Cancel
              </Button>
            </>
          ) : held ? (
            <>
              <Label>Almost there</Label>
              <p className="font-display text-xl font-bold">
                Now add the matching <code className="font-mono">{partnerExt(held.kind)}</code> file
              </p>
              <p className="max-w-[42ch] text-base text-text-muted break-all">
                Got <code className="font-mono">{held.file.name}</code>.
                <br />
                Drop its partner here to start converting.
              </p>
              <div className="mt-sm flex gap-sm">
                <Button variant="primary" type="button">
                  Choose file
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={(e) => {
                    // Don't bubble to the dropzone (which opens the file picker).
                    e.stopPropagation();
                    setHeld(null);
                    track("lone_file_cleared", { file_kind: held.kind });
                  }}
                >
                  Start over
                </Button>
              </div>
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
          <FeedbackPrompt result="success" resolution={resolution} input_type={lastInput} />
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="flex flex-col gap-md">
          <div
            role="alert"
            className="rounded-md border border-brand bg-brand-wash px-lg py-md text-base text-brand-strong"
          >
            {error}
          </div>
          <FeedbackPrompt result="failure" resolution={resolution} input_type={lastInput} />
        </div>
      )}
    </Surface>
  );
}
