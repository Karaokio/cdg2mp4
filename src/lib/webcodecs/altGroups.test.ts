import { describe, it, expect } from "vitest";
import { clearAlternateGroups } from "./altGroups";

/** Build a box: size + type + body. */
function box(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + body.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(
    [...type].map((c) => c.charCodeAt(0)),
    4
  );
  out.set(body, 8);
  return out;
}

/**
 * A tkhd body with the given alternate_group. v0 is 84 bytes, v1 is 96;
 * alternate_group sits at 34 and 46 respectively.
 */
function tkhd(version: 0 | 1, alternateGroup: number): Uint8Array {
  const body = new Uint8Array(version === 1 ? 96 : 84);
  body[0] = version;
  new DataView(body.buffer).setUint16(version === 1 ? 46 : 34, alternateGroup);
  return box("tkhd", body);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const groupOf = (file: Uint8Array, tkhdAt: number, version: 0 | 1) =>
  new DataView(file.buffer).getUint16(tkhdAt + 8 + (version === 1 ? 46 : 34));

describe("clearAlternateGroups", () => {
  it("zeroes the field in every track, both tkhd versions", () => {
    // moov > [trak > tkhd(v0, group 1), trak > tkhd(v1, group 2)], as
    // mediabunny writes them (alternate_group = track id).
    const file = concat(
      box("ftyp", new Uint8Array(8)),
      box("moov", concat(box("trak", tkhd(0, 1)), box("trak", tkhd(1, 2))))
    );
    expect(clearAlternateGroups(file)).toBe(2);
    const moov = 24; // after ftyp(16) + moov header(8)
    expect(groupOf(file, moov + 8, 0)).toBe(0);
    expect(groupOf(file, moov + 8 + 8 + 92 + 8, 1)).toBe(0);
  });

  it("counts nothing on a file whose groups are already zero", () => {
    const file = box("moov", box("trak", tkhd(0, 0)));
    expect(clearAlternateGroups(file)).toBe(0);
  });

  it("touches nothing when there is no moov to parse", () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5]);
    const before = [...garbage];
    expect(clearAlternateGroups(garbage)).toBe(0);
    expect([...garbage]).toEqual(before);
  });
});
