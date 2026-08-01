/**
 * Native (WebCodecs) pipeline, main-thread side: capability detection and the
 * worker's lifecycle. The pipeline itself lives in webcodecs/encode.ts and runs
 * in webcodecs/worker.ts.
 *
 * The conversion runs in a worker for two reasons. Encoding a 3-minute song is
 * thousands of canvas draws and encoder calls; on the main thread that competes
 * with React and the compositor, so the progress bar stutters and Cancel is
 * slow to respond. And a worker makes cancellation exact: `terminate()` kills
 * the encode mid-frame and drops every buffer with it, which is the same shape
 * as the ffmpeg path's cancel and needs no cooperative check anywhere in the
 * encode loop.
 */

import { canEncodeVideo } from "mediabunny";
import {
  parseSize,
  quantizerIsSafeToAsk,
  resetQuantizerProbe,
  videoQuality,
} from "./webcodecs/encode";
import type { WorkerRequest, WorkerResponse } from "./webcodecs/worker";
import type { ProgressFn } from "./ffmpeg";
import { log, logError, mb, secs } from "./log";

let supportCache = new Map<string, boolean>();

/**
 * Whether this browser can run the native pipeline at the given output size.
 *
 * Checks the encoder rather than the API surface: `VideoEncoder` exists in
 * Chrome 94+ but a given machine can still lack an H.264 encoder (a Chromium
 * build without proprietary codecs, some Linux setups), and that only shows up
 * in `isConfigSupported`. Memoized per size; never throws, so a detection
 * failure routes to ffmpeg.wasm rather than breaking the app.
 */
export async function canUseWebCodecs(size: string): Promise<boolean> {
  const cached = supportCache.get(size);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    if (typeof VideoEncoder !== "undefined" && typeof OffscreenCanvas !== "undefined") {
      const [width, height] = parseSize(size);
      // Same Quality the encode will use, so this answers the question actually
      // being asked. It has to be built the same way too: a quantizer this
      // browser cannot even be asked about turns the probe below into a throw.
      const quality = videoQuality(width, height, await quantizerIsSafeToAsk());
      ok = await canEncodeVideo("avc", { width, height, quality });
    }
  } catch {
    ok = false;
  }
  supportCache.set(size, ok);
  return ok;
}

/** Test seam: drop the memoized capability results. */
export function resetWebCodecsSupportCache(): void {
  supportCache = new Map();
  resetQuantizerProbe();
}

// The conversion in flight, if any: the worker plus the way to stop it.
let active: { worker: Worker; cancel: () => void } | null = null;

/**
 * Hard-stop the in-flight native conversion. Terminating is the only reliable
 * stop: the encode loop never yields to a message-handling turn for long enough
 * to poll a flag, and a half-finished MP4 has no value anyway. The pending
 * conversion rejects with "Conversion cancelled." No-op when idle.
 */
export function cancelNativeConversion(): void {
  if (active) log("cancelled · terminating the encoder worker");
  active?.cancel();
}

/**
 * Transcode a CDG + MP3 pair into an MP4 using WebCodecs. Same signature as
 * `convertCdgToMp4`, so the Converter can pick either at runtime.
 */
export function convertCdgToMp4Native(
  cdg: Uint8Array,
  mp3: Uint8Array,
  opts: {
    size?: string;
    onProgress?: ProgressFn;
    onAudioCodec?: (codec: "aac" | "mp3") => void;
    /** The rip's title screen, when it has one. Never fires on a rip that opens
     * cold, so the caller must cope with never hearing from it. */
    onPoster?: (poster: Blob) => void;
  } = {}
): Promise<Uint8Array> {
  if (active) {
    return Promise.reject(
      new Error("A conversion is already in progress. Please wait for it to finish.")
    );
  }

  const size = opts.size ?? "1440x1080";
  log(`encoding ${size} H.264 in a worker`);
  const startedAt = Date.now();

  const worker = new Worker(new URL("./webcodecs/worker.ts", import.meta.url), {
    type: "module",
  });

  return new Promise<Uint8Array>((resolve, reject) => {
    // Every exit runs through here: kill the worker, clear the slot, settle
    // once. `active` is cleared first so a cancel arriving mid-settle is a
    // no-op rather than a second rejection.
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      active = null;
      worker.terminate();
      fn();
    };
    active = {
      worker,
      cancel: () => finish(() => reject(new Error("Conversion cancelled."))),
    };

    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.type === "progress") {
        opts.onProgress?.(Math.min(Math.max(data.ratio, 0), 1));
      } else if (data.type === "audio-codec") {
        log(
          data.codec === "aac"
            ? "audio: re-encoding the MP3 to AAC"
            : "audio: no AAC encoder here, remuxing the MP3 as-is"
        );
        opts.onAudioCodec?.(data.codec);
      } else if (data.type === "done") {
        const bytes = data.buffer.byteLength;
        log(`encoded ${mb(bytes)} in ${secs(Date.now() - startedAt)}`);
        if (data.poster) {
          opts.onPoster?.(new Blob([data.poster], { type: data.posterType }));
        }
        finish(() => resolve(new Uint8Array(data.buffer)));
      } else {
        logError("the encoder worker failed", new Error(`${data.name}: ${data.message}`));
        finish(() => reject(new Error(data.message, { cause: new Error(data.name) })));
      }
    };

    // A worker that fails to load at all (a stale service-worker cache, a
    // blocked module fetch) never sends a message, so it needs its own path.
    worker.onerror = (event) => {
      finish(() =>
        reject(
          new Error("Could not start the converter. Try again, or try a different browser.", {
            cause: new Error(event.message || "Worker failed to start"),
          })
        )
      );
    };

    // Transfer rather than copy: these are multi-megabyte buffers, and the
    // caller has no use for them afterwards (the ffmpeg path detaches them
    // too). Deduped, since transferring one buffer twice is a DataCloneError
    // and the two views could in principle share a backing buffer.
    const request: WorkerRequest = { cdg, mp3, size };
    const buffers = [...new Set([cdg.buffer, mp3.buffer])] as ArrayBuffer[];
    worker.postMessage(request, buffers);
  });
}
