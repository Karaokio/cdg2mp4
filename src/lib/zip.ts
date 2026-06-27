import { unzipSync } from "fflate";

export interface CdgPair {
  cdg: Uint8Array;
  mp3: Uint8Array;
  /** Base name (no extension) derived from the cdg/mp3, for naming the output. */
  baseName: string;
}

const stripExt = (name: string) => name.replace(/\.[^.]+$/, "");
const baseName = (path: string) => stripExt(path.split("/").pop() ?? path);

/** Extract the .cdg + .mp3 from a karaoke zip's bytes. */
export function extractPairFromZip(zipBytes: Uint8Array): CdgPair {
  const files = unzipSync(zipBytes);
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
  return { cdg, mp3, baseName: stem };
}

/** Build a CdgPair from two separately-selected files. */
export function pairFromFiles(cdg: Uint8Array, mp3: Uint8Array, cdgName: string): CdgPair {
  return { cdg, mp3, baseName: baseName(cdgName) };
}
