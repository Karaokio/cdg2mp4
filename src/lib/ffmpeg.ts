import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { CORE_JS_URL, CORE_WASM_URL } from "./coreUrls";

// The single-thread core is copied into public/ffmpeg/<version>/ (see
// scripts/copy-ffmpeg-core.mjs) so it is served same-origin and works offline.
// Single-thread avoids the core-mt nested-worker deadlock and needs no COOP/COEP
// headers — see the gating spike.

export type ProgressFn = (ratio: number) => void;
export type LogFn = (line: string) => void;

let loadPromise: Promise<FFmpeg> | null = null;
// ffmpeg.wasm runs one command at a time on the shared instance; this guards
// against a second conversion starting while one is in flight.
let busy = false;

/** Lazily create and load a single shared FFmpeg instance. */
export function loadFFmpeg(): Promise<FFmpeg> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const instance = new FFmpeg();
    await instance.load({
      coreURL: await toBlobURL(CORE_JS_URL, "text/javascript"),
      wasmURL: await toBlobURL(CORE_WASM_URL, "application/wasm"),
    });
    return instance;
  })().catch((err) => {
    // Never cache a rejected load (e.g. offline on first run); allow a retry.
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}

/**
 * Transcode a CDG (graphics) + MP3 (audio) pair into an MP4.
 * Spike-verified command; `-pix_fmt yuv420p` is required for Safari/QuickTime
 * playback and `-preset veryfast` keeps client-side encoding usable.
 */
export async function convertCdgToMp4(
  cdg: Uint8Array,
  mp3: Uint8Array,
  opts: { size?: string; onProgress?: ProgressFn; onLog?: LogFn } = {}
): Promise<Uint8Array> {
  if (busy) {
    throw new Error("A conversion is already in progress. Please wait for it to finish.");
  }
  busy = true;

  const size = opts.size ?? "1440x1080";

  let instance: FFmpeg;
  try {
    instance = await loadFFmpeg();
  } catch {
    busy = false;
    throw new Error("Could not load the converter. Check your connection and try again.");
  }

  const onProgress = ({ progress }: { progress: number }) => {
    // ffmpeg occasionally reports >1 near the end; clamp for the UI.
    opts.onProgress?.(Math.min(Math.max(progress, 0), 1));
  };
  const onLog = opts.onLog ? ({ message }: { message: string }) => opts.onLog?.(message) : null;
  instance.on("progress", onProgress);
  if (onLog) instance.on("log", onLog);

  try {
    await instance.writeFile("in.cdg", cdg);
    await instance.writeFile("in.mp3", mp3);

    const code = await instance.exec([
      "-i",
      "in.cdg",
      "-i",
      "in.mp3",
      "-r",
      "30",
      // Upscale the low-res CDG with nearest-neighbor to keep the pixel-art look
      // crisp rather than blurry at higher resolutions.
      "-vf",
      `scale=${size.replace("x", ":")}:flags=neighbor`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      "out.mp4",
    ]);
    if (code !== 0) throw new Error(`The converter failed (ffmpeg exit code ${code}).`);

    const data = await instance.readFile("out.mp4");
    if (typeof data === "string" || data.length === 0) {
      throw new Error("The converter produced an empty file.");
    }
    return data;
  } finally {
    instance.off("progress", onProgress);
    if (onLog) instance.off("log", onLog);
    // Always clear the virtual FS, even on failure, so nothing leaks into the
    // next run. allSettled because files may not exist if writeFile failed early.
    await Promise.allSettled([
      instance.deleteFile("in.cdg"),
      instance.deleteFile("in.mp3"),
      instance.deleteFile("out.mp4"),
    ]);
    busy = false;
  }
}
