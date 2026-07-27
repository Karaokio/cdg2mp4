// Classify dropped/selected files into conversion inputs, optionally completing
// a cdg+mp3 pair with a file held back from an earlier drop. Works on names only
// (contents are read at conversion time), so it stays pure and testable with
// plain objects.

export type Named = { name: string };

export type HeldKind = "cdg" | "mp3";
export type Held<T extends Named> = { kind: HeldKind; file: T };

/** A complete conversion input: a zip, or a matched cdg+mp3 pair. */
export type BatchInput<T extends Named> =
  { type: "zip"; zip: T } | { type: "pair"; cdg: T; mp3: T };

export interface BatchClassification<T extends Named> {
  /** Convertible items, in drop order (zips first-seen, then pairs by stem). */
  items: BatchInput<T>[];
  /** Loose .cdg/.mp3 files left without a partner. */
  leftovers: Held<T>[];
  /** Extensions of files that can never convert (lowercased, deduped, sorted). */
  rejectedExtensions: string[];
}

const stem = (name: string) => name.replace(/\.[^.]+$/, "").toLowerCase();
const hasExt = (name: string, ext: string) => name.toLowerCase().endsWith(ext);

/**
 * Classify a drop of any size. Loose .cdg/.mp3 files pair by case-insensitive
 * stem. The held file (from an earlier lone drop) joins the pool, but a newly
 * dropped file of the same kind and stem replaces it. If exactly one .cdg and
 * one .mp3 remain unpaired, they pair despite mismatched stems — that keeps
 * today's two-loose-files behavior, where stems often differ.
 */
export function classifyBatch<T extends Named>(
  files: T[],
  held: Held<T> | null
): BatchClassification<T> {
  const items: BatchInput<T>[] = [];
  const rejected = new Set<string>();
  type Slot = { cdg?: T; mp3?: T };
  const slots = new Map<string, Slot>();
  const slot = (name: string): Slot => {
    const key = stem(name);
    let s = slots.get(key);
    if (!s) slots.set(key, (s = {}));
    return s;
  };

  for (const f of files) {
    if (hasExt(f.name, ".zip")) items.push({ type: "zip", zip: f });
    else if (hasExt(f.name, ".cdg")) slot(f.name).cdg ??= f;
    else if (hasExt(f.name, ".mp3")) slot(f.name).mp3 ??= f;
    else rejected.add(/\.([^./]+)$/.exec(f.name.toLowerCase())?.[1] ?? "none");
  }
  // The held file joins last, so a newly dropped file of its kind+stem wins.
  if (held) slot(held.file.name)[held.kind] ??= held.file;

  const loneCdgs: T[] = [];
  const loneMp3s: T[] = [];
  for (const s of slots.values()) {
    if (s.cdg && s.mp3) items.push({ type: "pair", cdg: s.cdg, mp3: s.mp3 });
    else if (s.cdg) loneCdgs.push(s.cdg);
    else if (s.mp3) loneMp3s.push(s.mp3);
  }
  // Mismatched-stem fallback: exactly one of each left over pairs anyway.
  if (loneCdgs.length === 1 && loneMp3s.length === 1) {
    items.push({ type: "pair", cdg: loneCdgs[0], mp3: loneMp3s[0] });
    loneCdgs.length = 0;
    loneMp3s.length = 0;
  }
  // Replacement: a held file that stayed unpaired is superseded by an unpaired
  // dropped file of the same kind (today's "re-drop to replace" semantics).
  if (held) {
    const pool = held.kind === "cdg" ? loneCdgs : loneMp3s;
    if (pool.includes(held.file) && pool.length > 1) {
      pool.splice(pool.indexOf(held.file), 1);
    }
  }

  const leftovers: Held<T>[] = [
    ...loneCdgs.map((file) => ({ kind: "cdg" as const, file })),
    ...loneMp3s.map((file) => ({ kind: "mp3" as const, file })),
  ];
  return { items, leftovers, rejectedExtensions: [...rejected].sort() };
}

/** Display stem for a queue row: zip filename stem, or the cdg's stem. */
export function inputLabel<T extends Named>(input: BatchInput<T>): string {
  const name = input.type === "zip" ? input.zip.name : input.cdg.name;
  return name.replace(/\.[^.]+$/, "");
}
