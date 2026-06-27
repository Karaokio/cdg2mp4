import { describe, it, expect } from "vitest";
import { zipSync } from "fflate";
import { extractPairFromZip, pairFromFiles } from "./zip";

const u8 = (...bytes: number[]) => new Uint8Array(bytes);
const makeZip = (entries: Record<string, Uint8Array>) => zipSync(entries);

describe("extractPairFromZip", () => {
  it("extracts the cdg + mp3 and derives the base name from the cdg", () => {
    const zip = makeZip({ "song.cdg": u8(1, 2, 3), "song.mp3": u8(4, 5) });
    const pair = extractPairFromZip(zip);
    expect(pair.cdg.length).toBe(3);
    expect(pair.mp3.length).toBe(2);
    expect(pair.baseName).toBe("song");
  });

  it("skips directory entries and __MACOSX resource forks", () => {
    const zip = makeZip({
      "__MACOSX/song.cdg": u8(9),
      "folder/song.cdg": u8(1),
      "folder/song.mp3": u8(2),
    });
    const pair = extractPairFromZip(zip);
    expect(pair.baseName).toBe("song");
    expect(pair.cdg[0]).toBe(1);
  });

  it("throws when the cdg is missing", () => {
    expect(() => extractPairFromZip(makeZip({ "song.mp3": u8(1) }))).toThrow(/no \.cdg/i);
  });

  it("throws when the mp3 is missing", () => {
    expect(() => extractPairFromZip(makeZip({ "song.cdg": u8(1) }))).toThrow(/no \.mp3/i);
  });

  it("throws a friendly error on corrupt zip bytes", () => {
    expect(() => extractPairFromZip(u8(1, 2, 3, 4))).toThrow(/valid \.zip/i);
  });

  it("rejects an empty stream inside the zip", () => {
    const zip = makeZip({ "song.cdg": new Uint8Array(0), "song.mp3": u8(1) });
    expect(() => extractPairFromZip(zip)).toThrow(/empty/i);
  });
});

describe("pairFromFiles", () => {
  it("derives the base name from the cdg filename", () => {
    const pair = pairFromFiles(u8(1), u8(2), "My Song.cdg");
    expect(pair.baseName).toBe("My Song");
  });

  it("rejects empty streams", () => {
    expect(() => pairFromFiles(new Uint8Array(0), u8(1), "x.cdg")).toThrow(/empty/i);
  });
});
