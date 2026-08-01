import { describe, it, expect } from "vitest";
import {
  coverageOf,
  discardAlpha,
  findTitleFrameTime,
  TITLE_FRAME_DEFAULTS,
  type SampledFrame,
} from "./titleFrame";

/**
 * Builds a sampler from a compact timeline description, so a test reads as the
 * shape of a rip rather than as a list of frames.
 *
 * Each segment is `[seconds, coverage, changing]`. `changing` marks the screen
 * as still being drawn, which is what cdgraphics reports while packets are
 * landing.
 */
function timeline(segments: [number, number, boolean][]) {
  const step = TITLE_FRAME_DEFAULTS.stepSeconds;
  const frames: SampledFrame[] = [];
  for (const [seconds, coverage, isChanged] of segments) {
    for (let i = 0; i < Math.round(seconds / step); i++) frames.push({ isChanged, coverage });
  }
  return (time: number) => frames[Math.round(time / step)] ?? { isChanged: false, coverage: 0 };
}

describe("findTitleFrameTime", () => {
  it("finds the moment a title card settles, not the moment the hold is confirmed", () => {
    // 1s blank, 2s drawing the card, then it holds.
    const at = findTitleFrameTime(
      timeline([
        [1, 0, false],
        [2, 0.3, true],
        [10, 0.3, false],
      ])
    );
    expect(at).toBeCloseTo(3, 5);
  });

  it("returns null for a rip that opens cold and goes straight into lyrics", () => {
    const at = findTitleFrameTime(
      timeline([
        [4, 0, false],
        [40, 0.2, true],
      ])
    );
    expect(at).toBeNull();
  });

  it("ignores a blank screen holding still, however long it holds", () => {
    expect(findTitleFrameTime(timeline([[30, 0, false]]))).toBeNull();
  });

  it("ignores a stray glyph below the coverage floor", () => {
    const at = findTitleFrameTime(
      timeline([
        [1, 0, false],
        [20, TITLE_FRAME_DEFAULTS.minCoverage / 2, false],
      ])
    );
    expect(at).toBeNull();
  });

  // A wipe-in can pause mid-draw. Anything that settles for less than the hold
  // is a transition, and picking it would poster a half-drawn screen.
  it("rejects a screen that settles briefly and then keeps changing", () => {
    const at = findTitleFrameTime(
      timeline([
        [1, 0.3, false],
        [1, 0.3, true],
        [1, 0.3, false],
        [1, 0.3, true],
        [30, 0.3, true],
      ])
    );
    expect(at).toBeNull();
  });

  it("takes the first card when a rip has a title screen and then a subtitle", () => {
    const at = findTitleFrameTime(
      timeline([
        [1, 0, false],
        [5, 0.3, false],
        [1, 0.5, true],
        [5, 0.5, false],
      ])
    );
    expect(at).toBeCloseTo(1, 5);
  });

  it("does not look past the search window", () => {
    const at = findTitleFrameTime(
      timeline([
        [TITLE_FRAME_DEFAULTS.searchSeconds + 1, 0.3, true],
        [10, 0.3, false],
      ])
    );
    expect(at).toBeNull();
  });

  it("accepts a card that holds for exactly holdSeconds despite float step drift", () => {
    const at = findTitleFrameTime(
      timeline([
        [1, 0.3, true],
        [TITLE_FRAME_DEFAULTS.holdSeconds, 0.3, false],
        [1, 0.3, true],
      ])
    );
    expect(at).toBeCloseTo(1, 5);
  });
});

describe("coverageOf", () => {
  // A forceKey render leaves the background transparent, so alpha is the whole
  // signal and the colour channels are irrelevant.
  it("counts pixels by alpha alone", () => {
    const pixels = new Uint8ClampedArray([
      255, 255, 255, 0, 0, 0, 0, 255, 12, 34, 56, 0, 9, 9, 9, 1,
    ]);
    expect(coverageOf(pixels)).toBe(0.5);
  });

  it("is 0 for an empty buffer rather than NaN", () => {
    expect(coverageOf(new Uint8ClampedArray(0))).toBe(0);
  });
});

describe("discardAlpha", () => {
  // A rip whose title declares a transparent background renders with alpha 0
  // there. The encoder discards alpha and keeps the RGB, so the video shows the
  // background colour; a PNG poster that kept the hole would not match it.
  it("makes transparent pixels opaque without changing their colour", () => {
    const pixels = new Uint8ClampedArray([0, 0, 170, 0, 255, 255, 255, 255]);
    discardAlpha(pixels);
    expect([...pixels]).toEqual([0, 0, 170, 255, 255, 255, 255, 255]);
  });

  it("leaves partial alpha fully opaque too, matching the encoder's discard", () => {
    const pixels = new Uint8ClampedArray([1, 2, 3, 128]);
    discardAlpha(pixels);
    expect(pixels[3]).toBe(255);
  });
});
