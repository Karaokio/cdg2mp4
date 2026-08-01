/**
 * The native conversion pipeline itself. Runs inside a worker (see worker.ts);
 * nothing here touches the DOM or the main thread.
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
 * - 30fps, sampling the middle of each frame's interval (see renderTimeForFrame).
 * - the video runs for the *audio's* duration. Rips routinely have a .cdg
 *   shorter than the .mp3, and cdgraphics holds the last drawn state once its
 *   packets run out, which is what `tpad=stop_mode=clone` did (#69/#64).
 * - yuv420p: what a WebCodecs H.264 encoder emits by default.
 */

import CDGraphics from "cdgraphics";
import { log } from "../log";
import {
  ALL_FORMATS,
  AudioSampleSink,
  AudioSampleSource,
  BufferSource,
  BufferTarget,
  CanvasSource,
  canEncodeAudio,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";

/** Output frame rate, matching the ffmpeg path's `-r 30`. */
export const FPS = 30;

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
 * before k/30 + 1/60.
 *
 * Sampling the middle here reproduces that. Measured against
 * `ffmpeg -vf fps=30` on a real 187s rip, this is a sharp optimum: it is
 * pixel-identical on 97% of frames, and every remaining frame differs by under
 * 0.1% of its pixels (part of a single 6x12 tile, where a lyric highlight lands
 * either side of the sampling boundary). One packet in either direction drops
 * the match rate to ~60%.
 *
 * Both pipelines are exact functions of the frame index, so neither drifts over
 * a long song.
 */
export function renderTimeForFrame(index: number, fps = FPS): number {
  const middle = (index + 0.5) / fps;
  return Math.max(0, Math.ceil(PACKETS_PER_SEC * middle) - 1) / PACKETS_PER_SEC;
}

/**
 * Video quality, as close to `libx264 -preset veryfast` (CRF 23) as WebCodecs
 * gets. A quantizer is the CRF analogue: constant quality, so it spends few
 * bits on flat pixel art and more on the rare busy frame.
 *
 * The quantizer is what we want but not yet what we get: Chrome 149 rejects
 * `bitrateMode: "quantizer"` for AVC, so mediabunny falls back to the bitrate
 * below, and it will pick the quantizer up for free whenever Chrome ships it.
 *
 * The bitrate is therefore a ceiling rather than a target, and VBR on this
 * content lands well under it (0.27 Mbps of a 1.40 Mbps allowance on a 1080p
 * rip). Lowering it buys nothing until it starts costing quality. Measured on a
 * 188s rip, against a lossless render of the same CDG:
 *
 *   bits/px   size    SSIM
 *   0.03      6.0 MB  0.9984   <- here
 *   0.01      6.2 MB  0.9971
 *   0.005     6.0 MB  0.9954
 *   0.0025    4.7 MB  0.9904
 *   ffmpeg    4.7 MB  0.9966   (libx264 CRF 23, for reference)
 *
 * So this sits slightly above the ffmpeg path's quality for about 1.3x its
 * bytes. x264's rate control is simply better than the browser's at this
 * quality; matching its size means giving up measurably more than it does.
 */
export function videoQuality(width: number, height: number): Quality {
  return new Quality({
    quantizer: 23,
    bitrate: Math.round(width * height * FPS * 0.03),
    bitrateMode: "variable",
  });
}

/**
 * Seconds between keyframes: x264's own default of 250 frames, which is what
 * the ffmpeg path already produces.
 *
 * The largest lever on output size that costs nothing: on a 188s rip at 1080p,
 * mediabunny's 2s default produced 8.2 MB against 6.1 MB at 250 frames, with
 * the longer interval scoring *better* against a lossless render (0.9984 vs
 * 0.9982 SSIM). Seeking granularity is the only cost, and 8.3s is what every
 * ffmpeg-produced karaoke MP4 already has.
 */
const KEY_FRAME_INTERVAL = 250 / FPS;

/** 128kbps AAC, matching what the ffmpeg path's `-c:a aac` default produces. */
const AUDIO_QUALITY = new Quality({ bitrate: 128_000 });

/** Split a "WxH" size. H.264 requires even dimensions. */
export function parseSize(size: string): [number, number] {
  const [w, h] = size.split("x").map(Number);
  return [w - (w % 2), h - (h % 2)];
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
): Promise<{ duration: number; codec: "aac" | "mp3"; run: () => Promise<void> }> {
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
      codec: "aac",
      run: async () => {
        const sink = new AudioSampleSink(track);
        for await (const sample of sink.samples()) {
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
    codec: "mp3",
    run: async () => {
      const sink = new EncodedPacketSink(track);
      const decoderConfig = await track.getDecoderConfig();
      let first = true;
      for await (const packet of sink.packets()) {
        await source.add(packet, first ? { decoderConfig: decoderConfig ?? undefined } : undefined);
        first = false;
      }
      source.close();
      input.dispose();
    },
  };
}

/**
 * Transcode a CDG + MP3 pair into an MP4. Resolves to the MP4's bytes.
 *
 * There is no cancellation path: the caller kills the worker instead, which is
 * both instant and complete. See src/lib/webcodecs.ts.
 */
export async function encodeCdgToMp4(
  cdg: Uint8Array,
  mp3: Uint8Array,
  size: string,
  onProgress: (ratio: number) => void,
  // Which audio codec the fallback chain settled on. Reported because AAC and
  // MP3-in-MP4 are not equally playable, and a device quietly getting the
  // second one is a plausible cause of a "the file won't play" report.
  onAudioCodec?: (codec: "aac" | "mp3") => void
): Promise<ArrayBuffer> {
  const [width, height] = parseSize(size);

  // The renderer needs a standalone ArrayBuffer. `cdg` may be a view into the
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
  // Replace the destination rather than blending into it. A CD+G title can
  // declare a transparent background, and drawImage's default source-over would
  // then composite every frame on top of the one before, accumulating every
  // lyric ever drawn into a smear. ffmpeg's decoder drops the alpha and keeps
  // the RGB, and "copy" is how you say that here.
  ctx.globalCompositeOperation = "copy";

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const videoSource = new CanvasSource(canvas, {
    codec: "avc",
    quality: videoQuality(width, height),
    keyFrameInterval: KEY_FRAME_INTERVAL,
  });
  output.addVideoTrack(videoSource, { frameRate: FPS });

  try {
    const audio = await addAudioTrack(output, mp3);
    onAudioCodec?.(audio.codec);
    await output.start();
    await audio.run();

    const frames = Math.max(1, Math.ceil(audio.duration * FPS));
    // The CDG is often shorter than the audio; the difference is the stretch
    // that holds the last graphic, so it is worth seeing both numbers.
    const cdgSeconds = cdg.byteLength / (PACKETS_PER_SEC * 24);
    log(
      `${frames} frames at ${FPS}fps · ${audio.duration.toFixed(1)}s of audio, ` +
        `${cdgSeconds.toFixed(1)}s of graphics`
    );

    // Constant frame rate: one sample per 1/30s, the same as the ffmpeg path's
    // `-r 30`. Submitting only changed frames with longer durations was tried
    // and dropped: a real rip changes ~70% of its frames during lyrics, so it
    // saved 0.1 MB of 6.1 MB and 13% of the encode time, which is not worth
    // handing a variable-rate file to whatever TV or bar player this ends up on.
    for (let i = 0; i < frames; i++) {
      const frame = graphics.render(renderTimeForFrame(i));
      // Past the end of the CDG stream `render` keeps returning the last state
      // unchanged, so the final graphic holds for the rest of the audio.
      if (frame.isChanged || i === 0) {
        sourceCtx.putImageData(frame.imageData, 0, 0);
        ctx.drawImage(source, 0, 0, width, height);
      }
      // Awaiting respects encoder and writer backpressure.
      await videoSource.add(i / FPS, 1 / FPS);
      onProgress((i + 1) / frames);
    }
    videoSource.close();

    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength === 0) {
      throw new Error("The converter produced an empty file.");
    }
    return buffer;
  } catch (err) {
    // Release the encoders and the muxer's buffers before the error propagates.
    await output.cancel().catch(() => {});
    throw err;
  }
}
