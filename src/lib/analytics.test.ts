import { describe, it, expect } from "vitest";
import { cdgSongSeconds, classifyError, errorDetail, mbBucket, fileName } from "./analytics";

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
    ["The converter failed (ffmpeg exit code 1).", "ffmpeg_error"],
    ["The converter produced an empty file.", "empty_output"],
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
  it("returns an empty object when there is no cause", () => {
    expect(errorDetail(new Error("no cause"))).toEqual({});
    expect(errorDetail("not an error")).toEqual({});
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
