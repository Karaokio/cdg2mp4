import { describe, it, expect, afterEach } from "vitest";
import { canUseWebCodecs, renderTimeForFrame, resetWebCodecsSupportCache } from "./webcodecs";

afterEach(() => {
  resetWebCodecsSupportCache();
  delete (globalThis as Record<string, unknown>).VideoEncoder;
});

describe("renderTimeForFrame", () => {
  // The packet indices ffmpeg's own `-vf fps=30` lands on, measured by
  // rendering test/files/sample.cdg both ways and comparing pixels.
  const packets = (t: number) => Math.round(t * 300);

  it("samples the middle of each frame's display interval", () => {
    expect(packets(renderTimeForFrame(0))).toBe(4);
    expect(packets(renderTimeForFrame(1))).toBe(14);
    expect(packets(renderTimeForFrame(2))).toBe(24);
    expect(packets(renderTimeForFrame(30))).toBe(304);
  });

  it("advances exactly 10 packets per frame at 30fps, so it cannot drift", () => {
    const step = packets(renderTimeForFrame(9001)) - packets(renderTimeForFrame(9000));
    expect(step).toBe(10);
  });

  it("never asks for a negative time (cdgraphics throws on one)", () => {
    expect(renderTimeForFrame(0, 1)).toBeGreaterThanOrEqual(0);
  });
});

describe("canUseWebCodecs", () => {
  it("is false when the browser has no VideoEncoder", async () => {
    expect(await canUseWebCodecs("1440x1080")).toBe(false);
  });

  it("is false when the H.264 config is rejected, not merely because the API exists", async () => {
    (globalThis as Record<string, unknown>).VideoEncoder = {
      isConfigSupported: () => Promise.resolve({ supported: false, config: {} }),
    };
    expect(await canUseWebCodecs("1440x1080")).toBe(false);
  });

  it("is false rather than throwing when detection itself blows up", async () => {
    (globalThis as Record<string, unknown>).VideoEncoder = {
      isConfigSupported: () => {
        throw new Error("nope");
      },
    };
    await expect(canUseWebCodecs("1440x1080")).resolves.toBe(false);
  });
});
