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

// Patched: patches/cdgraphics+7.0.0.patch clamps a scroll-offset read that
// otherwise runs past the pixel buffer and throws (#92). Bumping the package
// means regenerating that patch, or dropping it once upstream carries the fix.
import CDGraphics from "cdgraphics";
import { log, mb } from "../log";
import { coverageOf, discardAlpha, findTitleFrameTime } from "./titleFrame";
import { clearAlternateGroups } from "./altGroups";
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

/** A still image, ready to embed in the MP4 and to show as the player's poster. */
export type TitleFrame = { data: Uint8Array; mimeType: string; time: number };

/**
 * The rip's title screen as a PNG, or null when it has none.
 *
 * Two passes over the opening seconds: one to find the moment the screen settles
 * (see titleFrame.ts), one to render that moment. The scan uses `forceKey` so
 * the background is transparent and coverage counts only drawn pixels; the paint
 * does not, since the poster wants the card as the viewer will see it.
 *
 * PNG rather than JPEG: CD+G is 16-colour pixel art, which PNG stores losslessly
 * in fewer bytes than JPEG needs to store it badly, and JPEG would ring around
 * every glyph edge.
 */
async function renderTitleFrame(
  cdg: Uint8Array,
  width: number,
  height: number
): Promise<TitleFrame | null> {
  // Its own decoder, so seeking around the opening cannot disturb the encode.
  const graphics = new CDGraphics(
    cdg.buffer.slice(cdg.byteOffset, cdg.byteOffset + cdg.byteLength) as ArrayBuffer
  );

  const time = findTitleFrameTime((at) => {
    const { isChanged, imageData } = graphics.render(at, { forceKey: true });
    return { isChanged, coverage: coverageOf(imageData.data) };
  });
  if (time === null) {
    log("no cover art: this rip has no title screen before the lyrics start");
    return null;
  }

  const source = new OffscreenCanvas(CDG_WIDTH, CDG_HEIGHT);
  const sourceCtx = source.getContext("2d", { willReadFrequently: true });
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!sourceCtx || !ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = "copy";

  // Re-render at the chosen time without forceKey. The decoder is already past
  // it, so this seeks backwards and replays, which cdgraphics handles. The
  // alpha discard matches the video encoder, so the cover image and the frames
  // it stands for show the same background. Safe to mutate: this decoder is
  // ours alone, and the pixels go straight to the canvas.
  const frame = graphics.render(time).imageData;
  discardAlpha(frame.data);
  sourceCtx.putImageData(frame, 0, 0);
  ctx.drawImage(source, 0, 0, width, height);

  const blob = await canvas.convertToBlob({ type: "image/png" });
  const data = new Uint8Array(await blob.arrayBuffer());
  log(`cover art: title screen at ${time.toFixed(2)}s, ${mb(data.byteLength)}`);
  return { data, mimeType: blob.type || "image/png", time };
}

/**
 * Video quality, as close to `libx264 -preset veryfast` (CRF 23) as WebCodecs
 * gets. A quantizer is the CRF analogue: constant quality, so it spends few
 * bits on flat pixel art and more on the rare busy frame.
 *
 * The quantizer is what we want but not yet what we get: Chrome 149 rejects
 * `bitrateMode: "quantizer"` for AVC, so mediabunny falls back to the bitrate
 * below, and it will pick the quantizer up for free whenever Chrome ships it.
 * Where asking for it is fatal rather than merely unsupported, `quantizer` is
 * false and the Quality carries the bitrate alone: see `quantizerIsSafeToAsk`.
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
export function videoQuality(width: number, height: number, quantizer = true): Quality {
  return new Quality({
    ...(quantizer ? { quantizer: 23 } : {}),
    bitrate: Math.round(width * height * FPS * 0.03),
    bitrateMode: "variable",
  });
}

// Memoized: one probe per realm, and both the capability check and the encode
// need the same answer.
let quantizerSafe: Promise<boolean> | null = null;

/**
 * Whether this browser tolerates being *asked* about `bitrateMode: "quantizer"`.
 * Not the same as supporting it.
 *
 * A Quality carrying a quantizer makes mediabunny probe two encoder configs, the
 * quantizer one first, and take the first that works. Chrome reports the
 * quantizer config unsupported and the loop moves on to the bitrate config.
 * Safari has no such enum value, so `isConfigSupported` rejects with a TypeError
 * instead; the throw escapes the loop before the bitrate config it would have
 * accepted is ever tried, and the whole native pipeline reads as unavailable.
 * Every Safari user was downloading ffmpeg.wasm because of it.
 *
 * So probe the hostile part alone. False here means build the Quality without a
 * quantizer, leaving one candidate that Safari answers honestly.
 */
export function quantizerIsSafeToAsk(): Promise<boolean> {
  quantizerSafe ??= (async () => {
    if (typeof VideoEncoder === "undefined") return false;
    try {
      // The result is irrelevant; only whether asking throws.
      await VideoEncoder.isConfigSupported({
        codec: "avc1.640028",
        width: 1440,
        height: 1080,
        bitrateMode: "quantizer",
      });
      return true;
    } catch {
      return false;
    }
  })();
  return quantizerSafe;
}

/** Test seam: drop the memoized probe result. */
export function resetQuantizerProbe(): void {
  quantizerSafe = null;
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
/**
 * Called with each audio sample's timestamp before it is added; resolves when
 * the sample may go in. How the encode keeps the two tracks moving together —
 * see the interleaving comment in `encodeCdgToMp4`.
 */
type PaceFn = (timestamp: number) => Promise<void>;

async function addAudioTrack(
  output: Output,
  mp3: Uint8Array
): Promise<{
  duration: number;
  codec: "aac" | "mp3";
  sampleRate?: number;
  run: (pace: PaceFn) => Promise<void>;
}> {
  const input = new Input({ source: new BufferSource(mp3), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error("The .mp3 file has no audio track.");
  const duration = await input.computeDuration();
  // Also telemetry (#88): the rate rides along on conversion events.
  const config = await track.getDecoderConfig().catch(() => null);
  const sampleRate = config?.sampleRate;

  const canDecode = await track.canDecode();
  // Probe at the file's own sample rate and channel count, not in the
  // abstract: an AAC encoder can exist and still reject a rate (Chrome's and
  // Edge's take nothing below 44.1 kHz, and old rips are often 32 kHz or
  // less). Asking without the rate said yes, and the encoder then threw mid-
  // conversion (#88); asking precisely routes those files to the MP3 remux
  // below, which re-encodes nothing and works at any rate.
  const canAac = await canEncodeAudio("aac", {
    quality: AUDIO_QUALITY,
    sampleRate,
    numberOfChannels: config?.numberOfChannels,
  });

  if (canDecode && canAac) {
    const source = new AudioSampleSource({ codec: "aac", quality: AUDIO_QUALITY });
    output.addAudioTrack(source);
    return {
      duration,
      codec: "aac",
      sampleRate,
      run: async (pace) => {
        const sink = new AudioSampleSink(track);
        for await (const sample of sink.samples()) {
          await pace(sample.timestamp);
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
    sampleRate,
    run: async (pace) => {
      const sink = new EncodedPacketSink(track);
      const decoderConfig = await track.getDecoderConfig();
      let first = true;
      for await (const packet of sink.packets()) {
        await pace(packet.timestamp);
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
  onAudioCodec?: (codec: "aac" | "mp3", sampleRate?: number) => void
): Promise<{ buffer: ArrayBuffer; poster: TitleFrame | null }> {
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
  // lyric ever drawn into a smear.
  ctx.globalCompositeOperation = "copy";

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const videoSource = new CanvasSource(canvas, {
    codec: "avc",
    quality: videoQuality(width, height, await quantizerIsSafeToAsk()),
    keyFrameInterval: KEY_FRAME_INTERVAL,
  });
  output.addVideoTrack(videoSource, { frameRate: FPS });

  // Cover art, when this rip has a title screen to find. Runs before start()
  // because metadata has to be set before the output is writing, and it uses its
  // own decoder so the scan cannot disturb the encode's position. Never fatal:
  // a conversion that produced a playable MP4 has done its job whether or not it
  // also found a thumbnail.
  const poster = await renderTitleFrame(cdg, width, height).catch((err: unknown) => {
    log(`no cover art: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  });
  if (poster) {
    output.setMetadataTags({
      images: [{ data: poster.data, mimeType: poster.mimeType, kind: "coverFront" }],
    });
  }

  try {
    const audio = await addAudioTrack(output, mp3);
    onAudioCodec?.(audio.codec, audio.sampleRate);
    await output.start();

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
    // How far the audio may run ahead of the video, in seconds. Comfortably
    // more than one muxer chunk (~0.3-0.5s), so the gate never starves the
    // audio encoder, and small enough that chunks still alternate.
    const AUDIO_LEAD = 1;

    let videoTime = 0;
    let videoDone = false;
    let wake: (() => void) | null = null;
    const notify = () => {
      wake?.();
      wake = null;
    };
    // Hold each audio sample until the video timeline is within AUDIO_LEAD of
    // it. Once the video is done there is nothing left to interleave with, and
    // the rest of the audio drains freely.
    const pace: PaceFn = async (timestamp) => {
      while (!videoDone && timestamp > videoTime + AUDIO_LEAD) {
        await new Promise<void>((resolve) => (wake = resolve));
      }
    };

    const pumpVideo = async () => {
      try {
        for (let i = 0; i < frames; i++) {
          const frame = graphics.render(renderTimeForFrame(i));
          // Past the end of the CDG stream `render` keeps returning the last
          // state unchanged, so the final graphic holds for the rest of the
          // audio.
          if (frame.isChanged || i === 0) {
            // Opaque before it touches the canvas: a rip that declares its
            // background color transparent renders those pixels at alpha 0, and
            // putImageData premultiplies, turning their RGB to black before
            // "copy" or the encoder's alpha handling ever runs (#87). Safe to
            // mutate: renderFrame rewrites every pixel on the next render.
            discardAlpha(frame.imageData.data);
            sourceCtx.putImageData(frame.imageData, 0, 0);
            ctx.drawImage(source, 0, 0, width, height);
          }
          // Awaiting respects encoder and writer backpressure.
          await videoSource.add(i / FPS, 1 / FPS);
          videoTime = (i + 1) / FPS;
          notify();
          onProgress((i + 1) / frames);
        }
        videoSource.close();
      } finally {
        // Wake the audio gate no matter how this pump exits, or a video error
        // would leave the audio side suspended forever.
        videoDone = true;
        notify();
      }
    };

    // Feed both tracks together, audio paced to the video's clock. The muxer
    // lays chunks down in the order their data arrives, so running the audio to
    // completion first wrote every audio chunk in one block ahead of all the
    // video: a non-interleaved file, where a player has to read from two ends
    // of the file at once. Every ffmpeg output alternates the tracks along the
    // timeline (121212...) and this restores that. Concurrency alone is not
    // enough: the audio encode is far cheaper than the video encode and runs
    // away from it, so the pacing gate holds each audio sample until the video
    // clock is within AUDIO_LEAD of it.
    //
    // To be clear about what this is not: it is container hygiene, not the
    // Safari fix. The controls-never-hide bug was bisected past interleaving
    // (a fully interleaved file still failed) to the alternate_group bytes,
    // see altGroups.ts.
    await Promise.all([audio.run(pace), pumpVideo()]);

    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength === 0) {
      throw new Error("The converter produced an empty file.");
    }
    // Two-byte repair of a mediabunny bug that breaks Safari. See altGroups.ts.
    clearAlternateGroups(new Uint8Array(buffer));
    return { buffer, poster };
  } catch (err) {
    // Release the encoders and the muxer's buffers before the error propagates.
    await output.cancel().catch(() => {});
    throw err;
  }
}
