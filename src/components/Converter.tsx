import * as React from "react";
import { Button, Label, Spinner, Surface } from "@/components/ui";
import { cn } from "@/lib/utils";
import { formatLeft, type ResKey } from "@/lib/format";
import { type Held } from "@/lib/inputFiles";
import { getState, subscribe, enqueueFiles, cancelItem, resetQueue } from "@/lib/batchRunner";
import { counts, type QueueState } from "@/lib/queue";
import { FeedbackPrompt } from "@/components/Feedback";
import { FfmpegCommand, type CommandNames } from "@/components/FfmpegCommand";
import { ResolutionPicker } from "@/components/ResolutionPicker";
import { ResultPanel } from "@/components/ResultPanel";
import { QueueList } from "@/components/QueueList";
import { track, fileName, type InputType } from "@/lib/analytics";

const partnerExt = (kind: "cdg" | "mp3") => (kind === "cdg" ? ".mp3" : ".cdg");

const STAGE_COPY = {
  read: "Reading files…",
  load: "Loading converter…",
  convert: "Converting…",
} as const;

/** Keep the screen awake and warn before unload while a batch is active. */
function useBatchGuards(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);

    // Screen Wake Lock is best-effort: auto-released on tab hide, re-acquired
    // on return. Browsers without it just get the beforeunload guard.
    let lock: { release: () => Promise<void> } | null = null;
    let disposed = false;
    const acquire = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
        if (disposed) void lock?.release();
      } catch {
        lock = null; // denied (low battery, hidden tab) — fine
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}

export function Converter() {
  const queue: QueueState = React.useSyncExternalStore(subscribe, getState);
  const [resolution, setResolution] = React.useState<ResKey>("1080p");
  const [dragging, setDragging] = React.useState(false);
  const [held, setHeld] = React.useState<Held<File> | null>(null);
  const [inputError, setInputError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const c = counts(queue);
  const inFlight = c.queued + c.converting;
  const single = queue.mode === "single";
  const item = single ? queue.items[0] : undefined; // the single-mode item, if any
  useBatchGuards(inFlight > 0);

  // Route dropped/selected files. The classifier handles any drop size; the
  // component only surfaces what didn't enqueue (hold / notice / error).
  const onFiles = React.useCallback(
    (files: File[]) => {
      setInputError("");
      setNotice("");
      const res = enqueueFiles(files, held, resolution);
      if (res.items.length > 0) {
        setHeld(null);
        const parts: string[] = [];
        if (res.leftovers.length > 0)
          parts.push(
            `${res.leftovers.length} file${res.leftovers.length > 1 ? "s" : ""} had no matching partner: ${res.leftovers
              .map((l) => l.file.name)
              .join(", ")}`
          );
        if (res.rejectedExtensions.length > 0) {
          const exts = res.rejectedExtensions.filter((x) => x !== "none").map((x) => `.${x}`);
          parts.push(`skipped ${exts.length ? exts.join(", ") : "some"} files that can't convert`);
        }
        if (parts.length) setNotice(parts.join(" · "));
        return;
      }
      if (res.leftovers.length === 1 && res.rejectedExtensions.length === 0) {
        const lone = res.leftovers[0];
        setHeld(lone);
        track("lone_file_held", { file_kind: lone.kind, file_name: fileName(lone.file.name) });
        return;
      }
      const exts = res.rejectedExtensions.filter((x) => x !== "none").map((x) => `.${x}`);
      setInputError(
        `Can't convert ${exts.length ? `${exts.join(" / ")} files` : "those files"}. ` +
          "Drop a karaoke .zip, or a matching .cdg and .mp3 together."
      );
      track("input_rejected", { extensions: res.rejectedExtensions.join(",") });
    },
    [held, resolution]
  );

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file
    if (files.length) onFiles(files);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) onFiles(files);
  };

  // ---- Single-mode view state, derived from the store ----
  const singleWorking =
    item != null && (item.state.phase === "queued" || item.state.phase === "converting");
  const singleDone = item?.state.phase === "done" && queue.preview != null;
  const singleFailed = item?.state.phase === "failed" ? item.state.message : "";
  const lastInput: InputType | undefined = item?.source.type;
  const errorText = inputError || (single ? singleFailed : "");

  // Filenames for the "run it locally" command (single mode only). Zips reveal
  // their real names only after conversion, via the output stem.
  const lastNames: CommandNames | undefined = React.useMemo(() => {
    if (!item) {
      if (held) return held.kind === "cdg" ? { cdg: held.file.name } : { mp3: held.file.name };
      return undefined;
    }
    if (item.source.type === "pair")
      return { cdg: item.source.cdg.name, mp3: item.source.mp3.name };
    if (item.state.phase === "done") {
      const stem = item.state.outputName.replace(/\.mp4$/, "");
      return { cdg: `${stem}.cdg`, mp3: `${stem}.mp3` };
    }
    return undefined;
  }, [item, held]);

  const progress = item?.state.phase === "converting" ? item.state.progress : 0;
  const eta = item?.state.phase === "converting" ? item.state.eta : 0;
  const phase = item?.state.phase === "converting" ? STAGE_COPY[item.state.stage] : "";
  const pct = Math.round(progress * 100);

  const showDropzone = single ? !singleDone : true;
  const showPicker = !singleWorking && inFlight === 0;
  const compactDropzone = !single; // batch mode: slim "add more" bar
  const batchDrained = !single && inFlight === 0 && c.total > 0;

  return (
    <Surface className="flex flex-col gap-lg">
      <input ref={inputRef} type="file" accept=".zip,.cdg,.mp3" multiple hidden onChange={onPick} />

      {showPicker && <ResolutionPicker value={resolution} onChange={setResolution} />}

      {/* Dropzone: full-size in single mode, slim add-bar in batch mode */}
      {showDropzone && (
        // A drop region (not a button). The "Choose files" Button inside is the
        // keyboard-accessible trigger; its click bubbles here to open the picker.
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !singleWorking && inputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-md rounded-lg border-2 border-dashed",
            "text-center transition-colors duration-[160ms] ease-standard",
            compactDropzone ? "px-lg py-md" : "px-xl py-3xl",
            singleWorking ? "cursor-default opacity-60" : "cursor-pointer",
            dragging ? "border-brand bg-brand-wash" : "border-border hover:border-brand"
          )}
        >
          {singleWorking ? (
            <>
              <Spinner />
              <p className="font-body font-semibold text-base" aria-live="polite">
                {phase || "Starting…"}
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
                  if (item) cancelItem(item.id);
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
          ) : compactDropzone ? (
            <p className="text-base text-text-muted">
              Drop more songs to add them to the queue, or click to choose.
            </p>
          ) : (
            <>
              <Label>Drop it here</Label>
              <p className="font-display text-xl font-bold">Drag a karaoke .zip to convert</p>
              <p className="max-w-[42ch] text-base text-text-muted">
                Or a matching <code className="font-mono">.cdg</code> and{" "}
                <code className="font-mono">.mp3</code> together — or a whole batch at once.
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

      {notice && (
        <p className="text-center text-sm text-text-muted" role="status">
          {notice}
        </p>
      )}

      {/* Expectation note (idle single only) */}
      {single && !item && !held && !errorText && (
        <p className="text-center text-sm text-text-muted">
          A typical song takes about a minute, a little longer at 1080p.
          <br />
          The first conversion is slower while the converter downloads.
        </p>
      )}

      {/* Batch queue */}
      {!single && <QueueList state={queue} />}

      {/* Result: full panel in single mode; muted latest-preview in batch */}
      {singleDone && queue.preview && (
        <>
          <ResultPanel
            url={queue.preview.url}
            name={queue.preview.name}
            resolution={resolution}
            autoPlay
            onConvertAnother={resetQueue}
          />
          <FeedbackPrompt result="success" resolution={resolution} input_type={lastInput} />
        </>
      )}
      {!single && queue.preview && (
        <ResultPanel
          url={queue.preview.url}
          name={queue.preview.name}
          resolution={resolution}
          autoPlay={false}
        />
      )}
      {batchDrained && (
        <FeedbackPrompt
          result={c.done > 0 ? "success" : "failure"}
          resolution={resolution}
          input_type={lastInput}
        />
      )}

      {/* Error (input errors any mode; conversion errors single mode only) */}
      {errorText && (
        <div className="flex flex-col gap-md">
          <div
            role="alert"
            className="rounded-md border border-brand bg-brand-wash px-lg py-md text-base text-brand-strong"
          >
            {errorText}
          </div>
          {single && singleFailed && (
            <FeedbackPrompt result="failure" resolution={resolution} input_type={lastInput} />
          )}
        </div>
      )}

      {/* Local-ffmpeg disclosure for advanced users (single mode, never mid-run). */}
      {single && !singleWorking && <FfmpegCommand resolution={resolution} names={lastNames} />}
    </Surface>
  );
}
