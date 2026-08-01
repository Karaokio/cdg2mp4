/**
 * Finding the title screen.
 *
 * Frame 0 of a CD+G is always blank: the graphics buffer starts empty and stays
 * that way until the first packet draws something, which is often seconds in. A
 * player that opens on frame 0 therefore opens on black, and so does every file
 * browser that thumbnails the MP4.
 *
 * CD+G has no title-screen field to read. Whether one exists at all is up to
 * whoever cut the disc: some open on a title card, some on a countdown, plenty
 * on nothing until the first lyric. So this infers one from how the format
 * behaves rather than from anything declared.
 *
 * The inference: a title card appears early, covers a meaningful part of the
 * screen, and then holds still. Lyrics never hold still. Scanning for the first
 * screen that settles and stays settled therefore finds a title card when there
 * is one, and finds nothing when the rip opens cold, which is the correct answer
 * for those rather than a failure.
 *
 * Deliberately conservative. A missing poster leaves the black frame we already
 * had; a wrong poster puts a half-drawn lyric line on someone's file forever.
 * Every threshold below is set to prefer the former, and none of them is fitted
 * to a corpus of real rips, so they are tunable rather than optimal.
 */

/** What one sampled frame tells us. Matches cdgraphics' `render` return value. */
export type SampledFrame = {
  /** False once the packets stop changing the screen. */
  isChanged: boolean;
  /** Fraction of the frame's pixels that are drawn content, 0 to 1. */
  coverage: number;
};

export type TitleFrameOptions = {
  /** How far into the song to look. Past this, it is a lyric, not a title. */
  searchSeconds?: number;
  /** Seconds between samples. */
  stepSeconds?: number;
  /** How long a screen must hold still to count as settled. */
  holdSeconds?: number;
  /** Least drawn area that counts as a screen rather than a stray glyph. */
  minCoverage?: number;
};

export const TITLE_FRAME_DEFAULTS = {
  // Most title cards are gone well before the first verse. Looking further
  // mostly finds lyrics that happen to sit still during an instrumental break.
  searchSeconds: 30,
  // 4/s. Fine enough to catch a card that holds for the 2s minimum, coarse
  // enough that the whole scan is ~120 renders of a 300x216 buffer.
  stepSeconds: 0.25,
  // A wipe-in or scroll transition can pause for a beat mid-draw. Two seconds
  // is longer than those pauses and shorter than any real card's dwell time.
  holdSeconds: 2,
  // 2% of 300x216 is about 1300 pixels: a couple of words. Below this it is
  // more likely a logo fragment or a stray artifact than a title screen.
  minCoverage: 0.02,
} satisfies Required<TitleFrameOptions>;

/**
 * The time to grab as the title frame, or null when nothing qualifies.
 *
 * `sample` renders the CD+G at a given time and reports what it found. It is
 * called at a fixed step from 0, always forwards, so a caller can drive it with
 * a single sequential decoder.
 *
 * Returns the moment the screen settled rather than the moment the hold was
 * confirmed, so the frame is the finished card and not the same card `holdSeconds`
 * later, which for a card that gets wiped could be a screen mid-erase.
 */
export function findTitleFrameTime(
  sample: (time: number) => SampledFrame,
  options: TitleFrameOptions = {}
): number | null {
  const { searchSeconds, stepSeconds, holdSeconds, minCoverage } = {
    ...TITLE_FRAME_DEFAULTS,
    ...options,
  };

  // When the current still screen started. Null while the screen is still being
  // drawn, so a card is only ever considered once it has stopped moving.
  let settledAt: number | null = null;

  for (let time = 0; time <= searchSeconds; time += stepSeconds) {
    const { isChanged, coverage } = sample(time);

    if (isChanged) {
      // Still drawing, or a new screen replacing the last one. Either way the
      // hold restarts; the previous candidate was not a title card.
      settledAt = null;
      continue;
    }

    // An empty screen holding still is the silence before the first draw, not a
    // title card. Checking coverage here rather than when the hold completes
    // means a blank stretch never starts a candidate at all.
    if (coverage < minCoverage) {
      settledAt = null;
      continue;
    }

    settledAt ??= time;
    // Each sample stands for the interval [time, time + stepSeconds), so a card
    // that holds for exactly holdSeconds puts its last still sample one step
    // short of that distance from its first. Without the allowance, the hold
    // asked for is really holdSeconds + stepSeconds. The slack also absorbs the
    // float drift in the accumulated step.
    if (time - settledAt >= holdSeconds - stepSeconds) return settledAt;
  }

  return null;
}

/**
 * Force every pixel opaque, keeping its colour.
 *
 * A CD+G title can declare its background colour transparent, and cdgraphics
 * renders those pixels at alpha 0. The video encoder runs with `alpha: "discard"`,
 * which drops the alpha channel and keeps the RGB, so the video shows the
 * background colour. PNG has no such step and would keep the hole, leaving a
 * cover image that disagrees with every frame of the file it is attached to.
 * This is that discard, done by hand.
 *
 * Mutates in place: the caller owns the buffer, and copying 300x216 to throw the
 * original away immediately would be waste.
 */
export function discardAlpha(data: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return data;
}

/** Fraction of pixels with a non-zero alpha. Expects a `forceKey` render, where
 * the background is transparent and so only drawn content is opaque. */
export function coverageOf(data: Uint8ClampedArray): number {
  if (data.length === 0) return 0;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) opaque++;
  }
  return opaque / (data.length / 4);
}
