import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import CDGraphics from "cdgraphics";

/**
 * cdgraphics 7.0.0 reads `pixels[(x + hOffset) + (y + vOffset) * 300]` for
 * every pixel of the 300x216 frame, so a Scroll Preset / Scroll Copy with a
 * non-zero fine offset walks past the end of the buffer on the last rows and
 * columns. When no Border Preset has set a border colour, `pixels[...]` is
 * undefined, `clut[undefined]` is undefined, and destructuring it throws
 * `TypeError: undefined is not iterable`. That is the crash behind #92.
 * The patch in patches/cdgraphics+7.0.0.patch clamps the read to the buffer.
 */

// vitest runs from the repo root.
const cdgFile = (name: string) =>
  new Uint8Array(readFileSync(resolve(process.cwd(), "test/files", name))).buffer;

/** One 24-byte CDG packet: command 9, the given instruction, data in bytes 4+. */
function packet(instruction: number, data: number[]): number[] {
  const p = new Array<number>(24).fill(0);
  p[0] = 0x09;
  p[1] = instruction;
  data.forEach((v, i) => (p[4 + i] = v));
  return p;
}

/** A one-second rip: memory preset, optional border preset, optional scroll preset. */
function rip(opts: { border?: boolean; hOffset?: number; vOffset?: number }): ArrayBuffer {
  const bytes: number[] = [];
  bytes.push(...packet(1, [1, 0])); // Memory Preset, colour 1
  if (opts.border) bytes.push(...packet(2, [2])); // Border Preset, colour 2
  if (opts.hOffset || opts.vOffset) {
    // Scroll Preset: colour, hScroll (cmd bits 4-5, offset bits 0-2), vScroll (cmd, offset bits 0-3)
    bytes.push(...packet(20, [3, opts.hOffset ?? 0, opts.vOffset ?? 0]));
  }
  while (bytes.length < 300 * 24) bytes.push(0);
  return new Uint8Array(bytes).buffer;
}

describe("cdgraphics with a scroll offset and no border colour", () => {
  it("renders a vertical fine offset", () => {
    const g = new CDGraphics(rip({ vOffset: 4 }));
    expect(() => g.render(0.5)).not.toThrow();
  });

  it("renders a horizontal fine offset", () => {
    const g = new CDGraphics(rip({ hOffset: 3 }));
    expect(() => g.render(0.5)).not.toThrow();
  });

  it("renders the largest offsets a rip can ask for", () => {
    const g = new CDGraphics(rip({ hOffset: 5, vOffset: 11 }));
    const { imageData } = g.render(0.5);
    // Every pixel is opaque and comes from the CLUT; nothing is left unpainted.
    for (let i = 3; i < imageData.data.length; i += 4) expect(imageData.data[i]).toBe(255);
  });

  it("still renders when the border colour is set", () => {
    const g = new CDGraphics(rip({ border: true, vOffset: 4 }));
    expect(() => g.render(0.5)).not.toThrow();
  });

  it("renders the sample-scroll fixture the e2e suite converts", () => {
    const g = new CDGraphics(cdgFile("sample-scroll.cdg"));
    for (let t = 0; t < 8; t += 0.5) expect(() => g.render(t)).not.toThrow();
  });
});
