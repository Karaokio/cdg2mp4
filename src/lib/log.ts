/**
 * A short console trace of what the converter is doing.
 *
 * The app is otherwise opaque while it runs: two pipelines, a capability probe
 * that picks between them, and several minutes of silence on the slow one. When
 * someone reports "it failed" through the feedback form, this is the difference
 * between guessing and knowing which pipeline ran and where it stopped.
 *
 * Deliberately always on, not behind a flag: it is only useful if it is already
 * there when something goes wrong, and nobody reproduces a bug after being told
 * a magic query parameter. That only works if it stays quiet, so the budget is
 * a handful of lines per conversion. Nothing per frame, nothing per packet.
 *
 * Filenames appear; file *contents* never do. The console is local either way,
 * but that line is worth keeping bright (see PRIVACY.md).
 */

const PREFIX = "[cdg2mp4]";
const LABEL = "color:#8b5cf6;font-weight:600";
const DIM = "color:inherit;font-weight:400";

/** One line of trace. Never throws, whatever the console is. */
export function log(message: string, data?: Record<string, unknown>): void {
  try {
    const defined = data && Object.fromEntries(Object.entries(data).filter(([, v]) => v != null));
    if (defined && Object.keys(defined).length) {
      console.info(`%c${PREFIX}%c ${message}`, LABEL, DIM, defined);
    } else {
      console.info(`%c${PREFIX}%c ${message}`, LABEL, DIM);
    }
  } catch {
    /* a broken console must never break a conversion */
  }
}

/** A failure, with the underlying cause when there is one. */
export function logError(message: string, cause?: unknown): void {
  try {
    const detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : cause;
    console.warn(`%c${PREFIX}%c ${message}`, LABEL, DIM, detail ?? "");
  } catch {
    /* ignore */
  }
}

/** Bytes as MB, for the one place a size is worth reading. */
export function mb(bytes: number): string {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Seconds, at the precision a human cares about. */
export function secs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
