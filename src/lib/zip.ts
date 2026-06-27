import { unzipSync } from "fflate";

export interface CdgPair {
  cdg: Uint8Array;
  mp3: Uint8Array;
  /** Base name (no extension) derived from the cdg, for naming the output. */
  baseName: string;
}

const stripExt = (name: string) => name.replace(/\.[^.]+$/, "");
const baseName = (path: string) => stripExt(path.split("/").pop() ?? path);

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
    throw new Error("That doesn't look like a valid .zip file.");
  }

  let cdg: Uint8Array | undefined;
  let mp3: Uint8Array | undefined;
  let stem = "karaoke";

  for (const [path, bytes] of Object.entries(files)) {
    // Skip directory entries and macOS resource forks.
    if (path.endsWith("/") || path.startsWith("__MACOSX/")) continue;
    const lower = path.toLowerCase();
    if (lower.endsWith(".cdg")) {
      cdg = bytes;
      stem = baseName(path);
    } else if (lower.endsWith(".mp3")) {
      mp3 = bytes;
    }
  }

  if (!cdg) throw new Error("No .cdg file found in the zip.");
  if (!mp3) throw new Error("No .mp3 file found in the zip.");
  assertNonEmpty(cdg, mp3);
  return { cdg, mp3, baseName: stem };
}

/** Build a CdgPair from two separately-selected files. */
export function pairFromFiles(cdg: Uint8Array, mp3: Uint8Array, cdgName: string): CdgPair {
  assertNonEmpty(cdg, mp3);
  return { cdg, mp3, baseName: baseName(cdgName) };
}
