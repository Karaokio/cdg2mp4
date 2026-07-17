import { unzipSync } from "fflate";

export interface CdgPair {
  cdg: Uint8Array;
  mp3: Uint8Array;
  /** Base name (no extension) derived from the cdg, for naming the output. */
  baseName: string;
}

const stripExt = (name: string) => name.replace(/\.[^.]+$/, "");
const baseName = (path: string) => stripExt(path.split("/").pop() ?? path);

/**
 * A zip that couldn't be used: not a zip at all, or missing the .cdg/.mp3.
 * `extensions` lists what the zip actually contained (lowercased, deduped),
 * so telemetry can tell a corrupt download from e.g. a video-karaoke rip.
 */
export class ZipPairError extends Error {
  readonly extensions?: string[];
  constructor(message: string, extensions?: string[]) {
    super(message);
    this.name = "ZipPairError";
    this.extensions = extensions;
  }
}

const VIDEO_EXTS = new Set(["mp4", "avi", "mkv", "mov", "webm", "mpg", "mpeg", "m4v"]);

function assertNonEmpty(cdg: Uint8Array, mp3: Uint8Array): void {
  if (cdg.length === 0) throw new Error("The .cdg file is empty.");
  if (mp3.length === 0) throw new Error("The .mp3 file is empty.");
}

/** Extract the .cdg + .mp3 from a karaoke zip's bytes. */
export function extractPairFromZip(zipBytes: Uint8Array): CdgPair {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zipBytes);
  } catch {
    throw new ZipPairError("That doesn't look like a valid .zip file.");
  }

  let cdg: Uint8Array | undefined;
  let mp3: Uint8Array | undefined;
  let stem = "karaoke";
  const extensions = new Set<string>();

  for (const [path, bytes] of Object.entries(files)) {
    // Skip directory entries and macOS resource forks.
    if (path.endsWith("/") || path.startsWith("__MACOSX/")) continue;
    const lower = path.toLowerCase();
    const ext = /\.([^./]+)$/.exec(lower)?.[1];
    if (ext) extensions.add(ext);
    if (lower.endsWith(".cdg")) {
      cdg = bytes;
      stem = baseName(path);
    } else if (lower.endsWith(".mp3")) {
      mp3 = bytes;
    }
  }

  const exts = [...extensions].sort();
  if (!cdg) {
    // A zip full of video files is video karaoke (a common mixup): the file is
    // already a video, so tell the user that instead of a bare "no .cdg".
    throw new ZipPairError(
      exts.some((e) => VIDEO_EXTS.has(e))
        ? "This zip has no .cdg file. It looks like it's already a karaoke video, which doesn't need converting."
        : "No .cdg file found in the zip.",
      exts
    );
  }
  if (!mp3) throw new ZipPairError("No .mp3 file found in the zip.", exts);
  assertNonEmpty(cdg, mp3);
  return { cdg, mp3, baseName: stem };
}

/** Build a CdgPair from two separately-selected files. */
export function pairFromFiles(cdg: Uint8Array, mp3: Uint8Array, cdgName: string): CdgPair {
  assertNonEmpty(cdg, mp3);
  return { cdg, mp3, baseName: baseName(cdgName) };
}
