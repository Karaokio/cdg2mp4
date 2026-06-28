import { describe, it, expect } from "vitest";
import { classifyError, mbBucket, fileName } from "./analytics";

describe("classifyError", () => {
  // The real user-facing messages from zip.ts / ffmpeg.ts / Converter.tsx.
  it.each([
    ["Drop a karaoke .zip, or a matching .cdg and .mp3 together.", "bad_input"],
    ["The .cdg file is empty.", "bad_input"],
    ["The .mp3 file is empty.", "bad_input"],
    ["That doesn't look like a valid .zip file.", "bad_zip"],
    ["No .cdg file found in the zip.", "bad_zip"],
    ["No .mp3 file found in the zip.", "bad_zip"],
    ["A conversion is already in progress. Please wait for it to finish.", "busy"],
    ["Could not load the converter. Check your connection and try again.", "load_failed"],
    ["Failed to fetch the converter core (503).", "load_failed"],
    ["The converter failed (ffmpeg exit code 1).", "ffmpeg_error"],
    ["The converter produced an empty file.", "empty_output"],
    ["something nobody anticipated", "unknown"],
  ])("%s -> %s", (message, code) => {
    expect(classifyError(message)).toBe(code);
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
