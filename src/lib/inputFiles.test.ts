import { describe, it, expect } from "vitest";
import { selectInput } from "./inputFiles";

const f = (name: string) => ({ name });

describe("selectInput", () => {
  it("picks a zip over everything else", () => {
    const sel = selectInput([f("song.cdg"), f("Song.ZIP"), f("song.mp3")], null);
    expect(sel).toEqual({ type: "zip", zip: f("Song.ZIP") });
  });

  it("a zip supersedes a held file", () => {
    const sel = selectInput([f("song.zip")], { kind: "mp3", file: f("held.mp3") });
    expect(sel.type).toBe("zip");
  });

  it("forms a pair from files dropped together (case-insensitive)", () => {
    const sel = selectInput([f("Song.CDG"), f("Song.MP3")], null);
    expect(sel).toEqual({ type: "pair", cdg: f("Song.CDG"), mp3: f("Song.MP3") });
  });

  it("completes a pair from a held cdg plus a dropped mp3", () => {
    const held = { kind: "cdg" as const, file: f("held.cdg") };
    expect(selectInput([f("song.mp3")], held)).toEqual({
      type: "pair",
      cdg: f("held.cdg"),
      mp3: f("song.mp3"),
    });
  });

  it("completes a pair from a held mp3 plus a dropped cdg", () => {
    const held = { kind: "mp3" as const, file: f("held.mp3") };
    expect(selectInput([f("song.cdg")], held)).toEqual({
      type: "pair",
      cdg: f("song.cdg"),
      mp3: f("held.mp3"),
    });
  });

  it("holds a lone cdg", () => {
    expect(selectInput([f("song.cdg")], null)).toEqual({
      type: "hold",
      kind: "cdg",
      file: f("song.cdg"),
    });
  });

  it("holds a lone mp3", () => {
    expect(selectInput([f("song.mp3")], null)).toEqual({
      type: "hold",
      kind: "mp3",
      file: f("song.mp3"),
    });
  });

  it("replaces a held file when the same kind is dropped again", () => {
    const held = { kind: "mp3" as const, file: f("old.mp3") };
    expect(selectInput([f("new.mp3")], held)).toEqual({
      type: "hold",
      kind: "mp3",
      file: f("new.mp3"),
    });
  });

  it("rejects unusable files, reporting deduped sorted extensions", () => {
    const sel = selectInput([f("a.txt"), f("b.TXT"), f("c.doc")], null);
    expect(sel).toEqual({ type: "reject", extensions: ["doc", "txt"] });
  });

  it("reports 'none' for files without an extension", () => {
    expect(selectInput([f("README")], null)).toEqual({ type: "reject", extensions: ["none"] });
  });

  it("rejects an empty drop", () => {
    expect(selectInput([], null)).toEqual({ type: "reject", extensions: [] });
  });
});
