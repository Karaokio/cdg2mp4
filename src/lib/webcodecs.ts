/**
 * Native (WebCodecs) conversion pipeline.
 *
 * The ffmpeg.wasm path (src/lib/ffmpeg.ts) does everything in one wasm process:
 * CDG decode, scale, H.264 encode, AAC encode, mux. That core is a SIMD build,
 * so a CPU without SSE4.1 cannot run it at all (see src/lib/wasmFeatures.ts),
 * and even where it runs, x264-in-wasm is the slowest part of the app.
 *
 * This path uses the browser's own pieces instead, with no wasm involved:
 *
 *   CDG decode   cdgraphics (JS) -> ImageData, 300x216
 *   scale        canvas drawImage with smoothing off (nearest-neighbor)
 *   video encode WebCodecs VideoEncoder (H.264), via mediabunny's CanvasSource
 *   audio        MP3 -> AudioDecoder -> AAC via AudioEncoder, or MP3 remuxed
 *   mux          mediabunny, MP4 with fast-start
 *
 * Behaviour is matched to the ffmpeg command it replaces:
 * - 300x216 source frames, the same geometry ffmpeg's cdgraphics decoder emits.
 * - nearest-neighbor upscale, i.e. `scale=W:H:flags=neighbor`.
 * - 30fps.
 * - the video runs for the *audio's* duration. Rips routinely have a .cdg
 *   shorter than the .mp3, and cdgraphics holds the last drawn state once its
 *   packets run out, which is what `tpad=stop_mode=clone` did (#69/#64).
 * - yuv420p: what a WebCodecs H.264 encoder emits by default.
 */

import CDGraphics from "cdgraphics";
import {
  ALL_FORMATS,
  AudioSampleSink,
  AudioSampleSource,
  BufferSource,
  CanvasSource,
  canEncodeAudio,
  canEncodeVideo,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  BufferTarget,
} from "mediabunny";
import type { ProgressFn } from "./ffmpeg";

/** Output frame rate, matching the ffmpeg path's `-r 30`. */
const FPS = 30;

/** The frame size ffmpeg's `cdgraphics` decoder emits, border included. */
const CDG_WIDTH = 300;
const CDG_HEIGHT = 216;

/** CDG plays 300 subcode packets per second. */
const PACKETS_PER_SEC = 300;

/**
 * The time to ask cdgraphics for, for output frame `index`.
 *
 * The renderer executes every packet up to `floor(300 * time)`, so the naive
 * `index / FPS` samples the CDG stream at the *start* of the frame's display
 * interval. ffmpeg's `-r 30` samples the middle instead: its `fps` filter
 * rounds to nearest, so output frame k takes the last decoded frame strictly
 * before k/30 + 1/60. Sampling the middle here reproduces that exactly —
 * verified pixel-identical over a whole CDG against `ffmpeg -vf fps=30`.
 *
 * It matters only at the margin (a lyric wipe lands up to half a frame
 * earlier or later), but it is free, and it makes the two pipelines produce
 * the same video rather than merely similar ones. Both are exact functions of
 * the frame index, so neither drifts over a long song.
 */
export function renderTimeForFrame(index: number, fps = FPS): number {
  const middle = (index + 0.5) / fps;
  return Math.max(0, Math.ceil(PACKETS_PER_SEC * middle) - 1) / PACKETS_PER_SEC;
}

/**
 * Video quality, as close to `libx264 -preset veryfast` (CRF 23) as WebCodecs
 * gets. A quantizer is the CRF analogue: constant quality, and CDG is flat
 * pixel art, so it costs far fewer bits than a fixed bitrate would spend.
 *
 * Quantizer-driven encoding needs a recent browser, so a bitrate is given as
 * the fallback. 0.03 bits per pixel is roughly what the ffmpeg path produces
 * on this content with headroom, so the fallback is not a quality cliff.
 */
function videoQuality(width: number, height: number): Quality {
  return new Quality({
    quantizer: 23,
    bitrate: Math.round(width * height * FPS * 0.03),
    bitrateMode: "variable",
  });
}

/** 128kbps AAC, matching what the ffmpeg path's `-c:a aac` default produces. */
const AUDIO_QUALITY = new Quality({ bitrate: 128_000 });

let cancelRequested = false;
let busy = false;

/** Ask the in-flight native conversion to stop at the next frame. No-op when idle. */
export function cancelNativeConversion(): void {
  if (busy) cancelRequested = true;
}

function checkCancelled(): void {
  if (cancelRequested) throw new Error("Conversion cancelled.");
}

const parseSize = (size: string): [number, number] => {
  const [w, h] = size.split("x").map(Number);
  // H.264 requires even dimensions; every RESOLUTIONS entry already is, this is
  // a guard against a future odd one silently failing inside the encoder.
  return [w - (w % 2), h - (h % 2)];
};

let supportCache = new Map<string, boolean>();

/**
 * Whether this browser can run the native pipeline at the given output size.
 *
 * Checks the encoder rather than the API surface: `VideoEncoder` exists in
 * Chrome 94+ but a given machine can still lack an H.264 encoder (a
 * Chromium build without proprietary codecs, some Linux setups), and that
 * only shows up in `isConfigSupported`. Memoized per size; never throws, so a
 * detection failure routes to ffmpeg.wasm rather than breaking the app.
 */
export async function canUseWebCodecs(size: string): Promise<boolean> {
  const cached = supportCache.get(size);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    if (typeof VideoEncoder !== "undefined") {
      const [width, height] = parseSize(size);
      ok = await canEncodeVideo("avc", { width, height, quality: videoQuality(width, height) });
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
}

/**
 * Add the MP3's audio to the output.
 *
 * Preferred: decode to PCM and re-encode as AAC, which is what the ffmpeg path
 * produces and what every MP4 player handles. Fallback: copy the MP3's
 * compressed packets in untouched. MP3-in-MP4 is legal and needs no encoder,
 * but is less universally played, so it is only used when AAC is unavailable.
 *
 * Returns the audio duration in seconds, which is how long the video runs.
 */
async function addAudioTrack(
  output: Output,
  mp3: Uint8Array
): Promise<{ duration: number; run: () => Promise<void> }> {
  const input = new Input({ source: new BufferSource(mp3), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error("The .mp3 file has no audio track.");
  const duration = await input.computeDuration();

  const canDecode = await track.canDecode();
  const canAac = await canEncodeAudio("aac", { quality: AUDIO_QUALITY });

  if (canDecode && canAac) {
    const source = new AudioSampleSource({ codec: "aac", quality: AUDIO_QUALITY });
    output.addAudioTrack(source);
    return {
      duration,
      run: async () => {
        const sink = new AudioSampleSink(track);
        for await (const sample of sink.samples()) {
          checkCancelled();
          await source.add(sample);
          sample.close();
        }
        source.close();
        input.dispose();
      },
    };
  }

  const codec = await track.getCodec();
  if (codec !== "mp3") throw new Error("This audio can't be encoded in your browser.");
  const source = new EncodedAudioPacketSource("mp3");
  output.addAudioTrack(source);
  return {
    duration,
    run: async () => {
      const sink = new EncodedPacketSink(track);
      const decoderConfig = await track.getDecoderConfig();
      let first = true;
      for await (const packet of sink.packets()) {
        checkCancelled();
        await source.add(packet, first ? { decoderConfig: decoderConfig ?? undefined } : undefined);
        first = false;
      }
      source.close();
      input.dispose();
    },
  };
}

/**
 * Transcode a CDG + MP3 pair into an MP4 using WebCodecs. Same signature as
 * `convertCdgToMp4`, so the Converter can pick either at runtime.
 */
export async function convertCdgToMp4Native(
  cdg: Uint8Array,
  mp3: Uint8Array,
  opts: { size?: string; onProgress?: ProgressFn } = {}
): Promise<Uint8Array> {
  if (busy) {
    throw new Error("A conversion is already in progress. Please wait for it to finish.");
  }
  busy = true;
  cancelRequested = false;

  const [width, height] = parseSize(opts.size ?? "1440x1080");

  // The renderer needs a standalone ArrayBuffer. `cdg` is a view into the
  // unzip output, so slice rather than handing over the whole backing buffer.
  const graphics = new CDGraphics(
    cdg.buffer.slice(cdg.byteOffset, cdg.byteOffset + cdg.byteLength) as ArrayBuffer
  );

  // Source canvas holds one 300x216 CDG frame; the output canvas is what the
  // encoder reads. Smoothing off on the upscale keeps the pixel art crisp.
  const source = new OffscreenCanvas(CDG_WIDTH, CDG_HEIGHT);
  const sourceCtx = source.getContext("2d", { willReadFrequently: true });
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!sourceCtx || !ctx) throw new Error("Could not create a drawing canvas.");
  ctx.imageSmoothingEnabled = false;

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const videoSource = new CanvasSource(canvas, {
    codec: "avc",
    quality: videoQuality(width, height),
    keyFrameInterval: 2,
  });
  output.addVideoTrack(videoSource, { frameRate: FPS });

  try {
    const audio = await addAudioTrack(output, mp3);
    await output.start();
    await audio.run();
    checkCancelled();

    const frames = Math.max(1, Math.ceil(audio.duration * FPS));
    for (let i = 0; i < frames; i++) {
      checkCancelled();
      const time = i / FPS;
      const frame = graphics.render(renderTimeForFrame(i));
      // Past the end of the CDG stream `render` keeps returning the last state
      // unchanged, so the final graphic holds for the rest of the audio.
      if (frame.isChanged || i === 0) {
        sourceCtx.putImageData(frame.imageData, 0, 0);
        ctx.drawImage(source, 0, 0, width, height);
      }
      // Awaiting `add` respects encoder backpressure but only yields the
      // microtask queue, so on its own this loop would hold the main thread for
      // the whole song: no repaint, no progress bar, no Cancel button. Hand the
      // event loop a turn a couple of times per second of output.
      await videoSource.add(time, 1 / FPS);
      if (i % (FPS / 2) === 0) await new Promise((r) => setTimeout(r, 0));
      opts.onProgress?.((i + 1) / frames);
    }
    videoSource.close();

    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength === 0) {
      throw new Error("The converter produced an empty file.");
    }
    return new Uint8Array(buffer);
  } catch (err) {
    // Release the encoders and the muxer's buffers; a cancelled or failed run
    // must not leave a VideoEncoder alive holding the next conversion's slot.
    await output.cancel().catch(() => {});
    throw err;
  } finally {
    busy = false;
    cancelRequested = false;
  }
}
