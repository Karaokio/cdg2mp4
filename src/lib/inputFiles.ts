// Classify a dropped/selected set of files into a conversion input, optionally
// completing a cdg+mp3 pair with a file held back from an earlier drop. Works
// on names only (contents are read at conversion time), so it stays pure and
// testable with plain objects.

export type Named = { name: string };

export type HeldKind = "cdg" | "mp3";
export type Held<T extends Named> = { kind: HeldKind; file: T };

export type InputSelection<T extends Named> =
  | { type: "zip"; zip: T }
  | { type: "pair"; cdg: T; mp3: T }
  | { type: "hold"; kind: HeldKind; file: T }
  | { type: "reject"; extensions: string[] };

const byExt = <T extends Named>(files: T[], ext: string) =>
  files.find((f) => f.name.toLowerCase().endsWith(ext));

/**
 * Pick the conversion input from newly dropped files plus an optionally held
 * lone file. A zip always wins (and supersedes anything held). A newly dropped
 * file wins over a held one of the same kind, so re-dropping replaces it.
 */
export function selectInput<T extends Named>(files: T[], held: Held<T> | null): InputSelection<T> {
  const zip = byExt(files, ".zip");
  if (zip) return { type: "zip", zip };

  const cdg = byExt(files, ".cdg") ?? (held?.kind === "cdg" ? held.file : undefined);
  const mp3 = byExt(files, ".mp3") ?? (held?.kind === "mp3" ? held.file : undefined);
  if (cdg && mp3) return { type: "pair", cdg, mp3 };
  if (cdg) return { type: "hold", kind: "cdg", file: cdg };
  if (mp3) return { type: "hold", kind: "mp3", file: mp3 };

  const extensions = files.map((f) => /\.([^./]+)$/.exec(f.name.toLowerCase())?.[1] ?? "none");
  return { type: "reject", extensions: [...new Set(extensions)].sort() };
}
