import { describe, it, expect } from "vitest";
import {
  cdgSongSeconds,
  classifyError,
  errorDetail,
  mbBucket,
  outputKbps,
  fileName,
} from "./analytics";
import { SIMD_UNSUPPORTED_MESSAGE } from "./wasmFeatures";

describe("outputKbps", () => {
  // The two pipelines land in the same output_mb_bucket on a typical song, so
  // this is what actually distinguishes them.
  it("normalizes file size by song length", () => {
    expect(outputKbps(6.1 * 1048576, 188)).toBe(275);
    expect(outputKbps(4.7 * 1048576, 188)).toBe(200);
  });

  it("rounds to 25 kbps so it is never a precise file size", () => {
    expect(outputKbps(1_000_000, 60) % 25).toBe(0);
  });

  it("is 0 rather than Infinity for a zero-length song", () => {
    expect(outputKbps(1_000_000, 0)).toBe(0);
  });
});

describe("classifyError", () => {
  // The real user-facing messages from zip.ts / ffmpeg.ts / Converter.tsx.
  it.each([
    ["Drop a karaoke .zip, or a matching .cdg and .mp3 together.", "bad_input"],
    ["The .cdg file is empty.", "bad_input"],
    ["The .mp3 file is empty.", "bad_input"],
    ["That doesn't look like a valid .zip file.", "invalid_zip"],
    ["No .cdg file found in the zip.", "zip_missing_cdg"],
    [
      "This zip has no .cdg file. It looks like it's already a karaoke video, which doesn't need converting.",
      "zip_missing_cdg",
    ],
    ["No .mp3 file found in the zip.", "zip_missing_mp3"],
    ["some other zip problem", "bad_zip"],
    ["A conversion is already in progress. Please wait for it to finish.", "busy"],
    ["Conversion cancelled.", "cancelled"],
    ["called FFmpeg.terminate()", "cancelled"],
    ["Could not load the converter. Try again, or try a different browser.", "load_failed"],
    ["Could not download the converter. Check your connection and try again.", "load_failed"],
    ["Failed to fetch the converter core (503).", "load_failed"],
    [SIMD_UNSUPPORTED_MESSAGE, "simd_unsupported"],
    ["The converter failed (ffmpeg exit code 1).", "ffmpeg_error"],
    ["The converter produced an empty file.", "empty_output"],
    ["Could not create a drawing canvas.", "encoder_error"],
    ["This audio can't be encoded in your browser.", "encoder_error"],
    // mediabunny's text when an encoder exists but rejects this input's
    // parameters, e.g. an AAC encoder fed a 32 kHz MP3 (#88).
    [
      "This specific encoder configuration (mp4a.40.2, 128000 bps, 1 channels, 32000 Hz) " +
        "is not supported by this browser. Consider using another codec or changing your " +
        "audio parameters.",
      "encoder_config_unsupported",
    ],
    ["The .mp3 file has no audio track.", "bad_audio"],
    ["something nobody anticipated", "unknown"],
  ])("%s -> %s", (message, code) => {
    expect(classifyError(message)).toBe(code);
  });
});

describe("errorDetail", () => {
  it("extracts the name and message of an Error cause", () => {
    const e = new Error("generic copy", { cause: new TypeError("Failed to fetch") });
    expect(errorDetail(e)).toEqual({ error_name: "TypeError", error_message: "Failed to fetch" });
  });
  it("truncates long cause messages to 200 chars", () => {
    const e = new Error("generic", { cause: new Error("x".repeat(500)) });
    expect(errorDetail(e).error_message).toHaveLength(200);
  });
  it("stringifies a non-Error cause", () => {
    expect(errorDetail(new Error("bad cause", { cause: "a string" }))).toEqual({
      error_name: "NonError",
      error_message: "a string",
    });
  });
  it("falls back to the error itself when there is no cause", () => {
    expect(errorDetail(new Error("no cause"))).toEqual({
      error_name: "Error",
      error_message: "no cause",
    });
    expect(errorDetail("not an error")).toEqual({});
  });
  it("keeps the worker boundary's rebuilt name and message", () => {
    // The shape src/lib/webcodecs.ts rebuilds from a worker's {message, name}.
    const cause = new Error("This specific encoder configuration is not supported");
    cause.name = "NotSupportedError";
    const e = new Error("This specific encoder configuration is not supported", { cause });
    expect(errorDetail(e)).toEqual({
      error_name: "NotSupportedError",
      error_message: "This specific encoder configuration is not supported",
    });
  });
});

describe("mbBucket", () => {
  it.each([
    [1 * 1048576, "<5"],
    [10 * 1048576, "5-20"],
    [30 * 1048576, "20-50"],
    [80 * 1048576, "50+"],
  ])("%i bytes -> %s", (bytes, bucket) => {
    expect(mbBucket(bytes)).toBe(bucket);
  });
});

describe("cdgSongSeconds", () => {
  it.each([
    [0, 0],
    [7200, 1], // 300 packets/sec x 24 bytes = 7200 bytes/sec
    [7200 * 180, 180], // a typical ~3-minute track
    [10800, 2], // rounds to the nearest second
  ])("%i bytes -> %i s", (bytes, seconds) => {
    expect(cdgSongSeconds(bytes)).toBe(seconds);
  });
});

describe("fileName", () => {
  it("trims surrounding whitespace", () => {
    expect(fileName("  Could This Be Magic  ")).toBe("Could This Be Magic");
  });
  it("caps length at 120 chars", () => {
    expect(fileName("a".repeat(200))).toHaveLength(120);
  });
  it("returns undefined for empty or missing input", () => {
    expect(fileName(undefined)).toBeUndefined();
    expect(fileName("   ")).toBeUndefined();
  });
});
