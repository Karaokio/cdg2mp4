import { describe, it, expect } from "vitest";
import { classifyBatch, inputLabel } from "./inputFiles";

const f = (name: string) => ({ name });

describe("classifyBatch — single-drop behavior (previously selectInput)", () => {
  it("classifies a zip alongside a loose pair as two items", () => {
    // Deliberate change from the old selectInput: the zip no longer silently
    // wins over loose files dropped with it — both convert.
    const res = classifyBatch([f("song.cdg"), f("Other.ZIP"), f("song.mp3")], null);
    expect(res.items).toEqual([
      { type: "zip", zip: f("Other.ZIP") },
      { type: "pair", cdg: f("song.cdg"), mp3: f("song.mp3") },
    ]);
    expect(res.leftovers).toEqual([]);
  });

  it("keeps a held file as a leftover when a zip is dropped", () => {
    const res = classifyBatch([f("song.zip")], { kind: "mp3", file: f("held.mp3") });
    expect(res.items).toEqual([{ type: "zip", zip: f("song.zip") }]);
    expect(res.leftovers).toEqual([{ kind: "mp3", file: f("held.mp3") }]);
  });

  it("forms a pair from files dropped together (case-insensitive stems)", () => {
    const res = classifyBatch([f("Song.CDG"), f("Song.MP3")], null);
    expect(res.items).toEqual([{ type: "pair", cdg: f("Song.CDG"), mp3: f("Song.MP3") }]);
  });

  it("completes a pair from a held cdg plus a dropped mp3 (mismatched stems)", () => {
    const held = { kind: "cdg" as const, file: f("held.cdg") };
    const res = classifyBatch([f("song.mp3")], held);
    expect(res.items).toEqual([{ type: "pair", cdg: f("held.cdg"), mp3: f("song.mp3") }]);
    expect(res.leftovers).toEqual([]);
  });

  it("completes a pair from a held mp3 plus a dropped cdg", () => {
    const held = { kind: "mp3" as const, file: f("held.mp3") };
    const res = classifyBatch([f("song.cdg")], held);
    expect(res.items).toEqual([{ type: "pair", cdg: f("song.cdg"), mp3: f("held.mp3") }]);
  });

  it("leaves a lone cdg as the only leftover (the component holds it)", () => {
    const res = classifyBatch([f("song.cdg")], null);
    expect(res.items).toEqual([]);
    expect(res.leftovers).toEqual([{ kind: "cdg", file: f("song.cdg") }]);
  });

  it("leaves a lone mp3 as the only leftover", () => {
    const res = classifyBatch([f("song.mp3")], null);
    expect(res.leftovers).toEqual([{ kind: "mp3", file: f("song.mp3") }]);
  });

  it("replaces an unpaired held file when the same kind is dropped again", () => {
    const held = { kind: "mp3" as const, file: f("old.mp3") };
    const res = classifyBatch([f("new.mp3")], held);
    expect(res.items).toEqual([]);
    expect(res.leftovers).toEqual([{ kind: "mp3", file: f("new.mp3") }]);
  });

  it("rejects unusable files, reporting deduped sorted extensions", () => {
    const res = classifyBatch([f("a.txt"), f("b.TXT"), f("c.doc")], null);
    expect(res.items).toEqual([]);
    expect(res.rejectedExtensions).toEqual(["doc", "txt"]);
  });

  it("reports 'none' for files without an extension", () => {
    expect(classifyBatch([f("README")], null).rejectedExtensions).toEqual(["none"]);
  });

  it("returns nothing for an empty drop", () => {
    expect(classifyBatch([], null)).toEqual({
      items: [],
      leftovers: [],
      rejectedExtensions: [],
    });
  });
});

describe("classifyBatch — multi-file drops", () => {
  it("pairs many loose files by stem and keeps zips as their own items", () => {
    const res = classifyBatch(
      [f("a.cdg"), f("b.mp3"), f("disc1.zip"), f("a.mp3"), f("b.cdg"), f("disc2.zip")],
      null
    );
    expect(res.items).toEqual([
      { type: "zip", zip: f("disc1.zip") },
      { type: "zip", zip: f("disc2.zip") },
      { type: "pair", cdg: f("a.cdg"), mp3: f("a.mp3") },
      { type: "pair", cdg: f("b.cdg"), mp3: f("b.mp3") },
    ]);
    expect(res.leftovers).toEqual([]);
  });

  it("does not fallback-pair when more than one file of a kind is unpaired", () => {
    const res = classifyBatch([f("a.cdg"), f("b.cdg"), f("z.mp3")], null);
    expect(res.items).toEqual([]);
    expect(res.leftovers).toHaveLength(3);
  });

  it("keeps unmatched files as leftovers alongside converted items", () => {
    const res = classifyBatch([f("a.cdg"), f("a.mp3"), f("stray.cdg")], null);
    expect(res.items).toEqual([{ type: "pair", cdg: f("a.cdg"), mp3: f("a.mp3") }]);
    expect(res.leftovers).toEqual([{ kind: "cdg", file: f("stray.cdg") }]);
  });

  it("mixes rejects with convertible items without blocking them", () => {
    const res = classifyBatch([f("a.zip"), f("cover.jpg")], null);
    expect(res.items).toEqual([{ type: "zip", zip: f("a.zip") }]);
    expect(res.rejectedExtensions).toEqual(["jpg"]);
  });

  it("uses the first file when the same stem+kind appears twice", () => {
    const res = classifyBatch([f("a.cdg"), f("A.CDG"), f("a.mp3")], null);
    expect(res.items).toEqual([{ type: "pair", cdg: f("a.cdg"), mp3: f("a.mp3") }]);
  });

  it("pairs a held file by stem in a multi-drop", () => {
    const held = { kind: "cdg" as const, file: f("track.cdg") };
    const res = classifyBatch([f("track.mp3"), f("b.cdg"), f("b.mp3")], held);
    expect(res.items).toEqual([
      { type: "pair", cdg: f("track.cdg"), mp3: f("track.mp3") },
      { type: "pair", cdg: f("b.cdg"), mp3: f("b.mp3") },
    ]);
  });
});

describe("inputLabel", () => {
  it("uses the zip stem for zips and the cdg stem for pairs", () => {
    expect(inputLabel({ type: "zip", zip: f("Disc One.zip") })).toBe("Disc One");
    expect(inputLabel({ type: "pair", cdg: f("song.cdg"), mp3: f("other.mp3") })).toBe("song");
  });
});
