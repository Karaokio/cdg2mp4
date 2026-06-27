import * as React from "react";
import { Button, Label, Spinner, Surface } from "@/components/ui";
import { cn } from "@/lib/utils";
import { convertCdgToMp4 } from "@/lib/ffmpeg";
import { extractPairFromZip, pairFromFiles, type CdgPair } from "@/lib/zip";

type Status = "idle" | "working" | "done" | "error";

const read = async (f: File) => new Uint8Array(await f.arrayBuffer());

/** Turn dropped/selected files into a {cdg, mp3} pair (zip or loose files). */
async function filesToPair(files: File[]): Promise<CdgPair> {
  const zip = files.find((f) => f.name.toLowerCase().endsWith(".zip"));
  if (zip) return extractPairFromZip(await read(zip));

  const cdg = files.find((f) => f.name.toLowerCase().endsWith(".cdg"));
  const mp3 = files.find((f) => f.name.toLowerCase().endsWith(".mp3"));
  if (cdg && mp3) return pairFromFiles(await read(cdg), await read(mp3), cdg.name);

  throw new Error("Drop a karaoke .zip — or a matching .cdg and .mp3 together.");
}

export function Converter() {
  const [status, setStatus] = React.useState<Status>("idle");
  const [progress, setProgress] = React.useState(0);
  const [phase, setPhase] = React.useState("");
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState<{ url: string; name: string } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

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
      setStatus("working");
      try {
        setPhase("Reading files…");
        const pair = await filesToPair(files);

        setPhase("Loading converter…");
        const mp4 = await convertCdgToMp4(pair.cdg, pair.mp3, {
          onProgress: (r) => {
            setProgress(r);
            setPhase("Converting…");
          },
        });

        const blob = new Blob([mp4 as BlobPart], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        setResult({ url, name: `${pair.baseName}.mp4` });
        setProgress(1);
        setStatus("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    },
    [result]
  );

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file
    if (files.length) void run(files);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void run(files);
  };

  const working = status === "working";
  const pct = Math.round(progress * 100);

  return (
    <Surface className="flex flex-col gap-lg">
      <input
        ref={inputRef}
        type="file"
        accept=".zip,.cdg,.mp3"
        multiple
        hidden
        onChange={onPick}
      />

      {/* Dropzone */}
      {status !== "done" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !working && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !working) inputRef.current?.click();
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-md rounded-lg border-2 border-dashed",
            "px-xl py-3xl text-center transition-colors duration-[160ms] ease-standard",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]",
            working ? "cursor-default opacity-60" : "cursor-pointer",
            dragging ? "border-brand bg-brand-wash" : "border-border hover:border-brand"
          )}
        >
          {working ? (
            <>
              <Spinner />
              <p className="font-body font-semibold text-base">{phase}</p>
              {progress > 0 && (
                <div className="w-full max-w-[360px]">
                  <div className="h-2 w-full overflow-hidden rounded-pill bg-background-sunken">
                    <div
                      className="h-full rounded-pill bg-[image:var(--brand-gradient)] transition-[width] duration-200 ease-out"
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                  <p className="mt-sm font-mono text-sm text-text-muted">{pct}%</p>
                </div>
              )}
            </>
          ) : (
            <>
              <Label>Drop it here</Label>
              <p className="font-display text-xl font-bold">Drag a karaoke .zip to convert</p>
              <p className="max-w-[42ch] text-base text-text-muted">
                Or a matching <code className="font-mono">.cdg</code> and{" "}
                <code className="font-mono">.mp3</code> together. Everything runs in your
                browser — nothing is uploaded.
              </p>
              <Button variant="primary" type="button" className="mt-sm">
                Choose files
              </Button>
            </>
          )}
        </div>
      )}

      {/* Result */}
      {status === "done" && result && (
        <div className="flex flex-col gap-lg">
          <video
            src={result.url}
            controls
            autoPlay
            loop
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
                <a href={result.url} download={result.name}>
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
