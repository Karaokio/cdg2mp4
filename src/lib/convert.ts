/**
 * Pipeline selection.
 *
 * Two converters produce the same MP4 from the same inputs:
 *
 *   webcodecs  cdgraphics + WebCodecs + mediabunny (src/lib/webcodecs.ts)
 *   ffmpeg     ffmpeg.wasm (src/lib/ffmpeg.ts)
 *
 * The native path is preferred: it encodes in the browser's own H.264 encoder,
 * usually hardware-accelerated, and downloads nothing. The wasm path stays as
 * the fallback for browsers without `VideoEncoder` (Firefox <130, Safari <16.4)
 * or without an H.264 encoder config the device accepts. A device that has
 * neither ends up in ffmpeg's SIMD preflight, which explains the dead end.
 *
 * `?pipeline=ffmpeg` (or `=webcodecs`) forces one, for side-by-side comparison
 * and as a hedge if the native output turns out wrong somewhere we can't
 * reproduce.
 */

import { convertCdgToMp4, cancelConversion, type LogFn, type ProgressFn } from "./ffmpeg";
import { canUseWebCodecs, cancelNativeConversion, convertCdgToMp4Native } from "./webcodecs";
import { hasWasmSimd } from "./wasmFeatures";
import { log } from "./log";

export type Pipeline = "webcodecs" | "ffmpeg";

/** The pipeline forced by `?pipeline=`, or null when the choice is automatic. */
export function pipelineOverride(): Pipeline | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("pipeline");
  return value === "webcodecs" || value === "ffmpeg" ? value : null;
}

// selectPipeline is called by anything that needs to know the routing, not just
// a conversion: the dropzone copy, the offline pill, the run itself. They would
// each log the same decision, so say it once per decision instead.
let announced: string | null = null;
const announce = (message: string) => {
  if (announced === message) return;
  announced = message;
  log(message);
};

/** Test seam: allow the next decision to be announced again. */
export function resetPipelineAnnouncement(): void {
  announced = null;
}

/** Which pipeline a conversion at this output size will use. Never throws. */
export async function selectPipeline(size: string): Promise<Pipeline> {
  const forced = pipelineOverride();
  if (forced) {
    announce(`pipeline: ${forced} (forced by ?pipeline=)`);
    return forced;
  }
  if (await canUseWebCodecs(size)) {
    announce("pipeline: webcodecs — native H.264 encoder, nothing to download");
    return "webcodecs";
  }
  // Say which of the two reasons it is, since they lead somewhere different:
  // one is a slow conversion, the other is no conversion at all.
  announce(
    hasWasmSimd()
      ? "pipeline: ffmpeg.wasm — no usable H.264 encoder here, falling back"
      : "pipeline: ffmpeg.wasm — no H.264 encoder and no wasm SIMD, this device cannot convert"
  );
  return "ffmpeg";
}

/** Stop whichever conversion is in flight. */
export function cancelActiveConversion(): void {
  cancelNativeConversion();
  cancelConversion();
}

/**
 * Convert a CDG + MP3 pair, routing to the best available pipeline.
 * `onPipeline` fires once the choice is made, before any work, so the UI and
 * analytics can record which path a run took even if it then fails.
 */
export async function convertPair(
  cdg: Uint8Array,
  mp3: Uint8Array,
  opts: {
    size?: string;
    /** Skip selection and use this one (the caller already resolved it). */
    pipeline?: Pipeline;
    onPipeline?: (pipeline: Pipeline) => void;
    onProgress?: ProgressFn;
    onLog?: LogFn;
    /** Native pipeline only: which audio codec its fallback chain chose. */
    onAudioCodec?: (codec: "aac" | "mp3") => void;
  } = {}
): Promise<Uint8Array> {
  const size = opts.size ?? "1440x1080";
  const pipeline = opts.pipeline ?? (await selectPipeline(size));
  opts.onPipeline?.(pipeline);
  return pipeline === "webcodecs"
    ? convertCdgToMp4Native(cdg, mp3, {
        size,
        onProgress: opts.onProgress,
        onAudioCodec: opts.onAudioCodec,
      })
    : convertCdgToMp4(cdg, mp3, { size, onProgress: opts.onProgress, onLog: opts.onLog });
}
