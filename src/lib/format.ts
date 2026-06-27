// Pure helpers, kept out of components so they're easy to unit test.

// CDG is low-res 4:3 pixel art; these keep that aspect ratio. Higher = sharper
// but slower to encode in the browser.
export const RESOLUTIONS = {
  "480p": "640x480",
  "720p": "960x720",
  "1080p": "1440x1080",
} as const;

export type ResKey = keyof typeof RESOLUTIONS;

/** Map a quality key to the ffmpeg scale target (WxH). */
export function resolutionToSize(res: ResKey): string {
  return RESOLUTIONS[res];
}

/** Clamp ffmpeg's progress ratio (it can drift slightly past 1 near the end) to [0,1]. */
export function clampProgress(ratio: number): number {
  return Math.min(Math.max(ratio, 0), 1);
}

/** Format a remaining-seconds estimate into calm, rounded copy. */
export function formatLeft(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return `about ${Math.max(5, Math.round(seconds / 5) * 5)}s left`;
  const m = Math.floor(seconds / 60);
  const s = Math.round((seconds % 60) / 15) * 15;
  return s ? `about ${m}m ${s}s left` : `about ${m}m left`;
}
