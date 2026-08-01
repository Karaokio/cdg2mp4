import { describe, it, expect, afterEach } from "vitest";
import { canUseWebCodecs, resetWebCodecsSupportCache } from "./webcodecs";
import { renderTimeForFrame } from "./webcodecs/encode";

afterEach(() => {
  resetWebCodecsSupportCache();
  delete (globalThis as Record<string, unknown>).VideoEncoder;
  delete (globalThis as Record<string, unknown>).OffscreenCanvas;
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
    (globalThis as Record<string, unknown>).OffscreenCanvas = class {};
    (globalThis as Record<string, unknown>).VideoEncoder = {
      isConfigSupported: () => Promise.resolve({ supported: false, config: {} }),
    };
    expect(await canUseWebCodecs("1440x1080")).toBe(false);
  });

  it("is false rather than throwing when detection itself blows up", async () => {
    (globalThis as Record<string, unknown>).OffscreenCanvas = class {};
    (globalThis as Record<string, unknown>).VideoEncoder = {
      isConfigSupported: () => {
        throw new Error("nope");
      },
    };
    await expect(canUseWebCodecs("1440x1080")).resolves.toBe(false);
  });

  // Safari has no "quantizer" bitrate mode, and rejects the config with a
  // TypeError rather than reporting it unsupported. That throw used to escape
  // mediabunny's candidate loop before the bitrate config Safari does accept was
  // tried, so every Safari user fell through to ffmpeg.wasm.
  it("is true on a browser that throws on bitrateMode quantizer but encodes H.264", async () => {
    const asked: (string | undefined)[] = [];
    (globalThis as Record<string, unknown>).OffscreenCanvas = class {};
    (globalThis as Record<string, unknown>).VideoEncoder = {
      isConfigSupported: (config: VideoEncoderConfig) => {
        asked.push(config.bitrateMode);
        if (config.bitrateMode === "quantizer") throw new TypeError("Type error");
        return Promise.resolve({ supported: true, config });
      },
    };
    await expect(canUseWebCodecs("1920x1080")).resolves.toBe(true);
    // Asked once about the quantizer (the probe) and never again: the Quality
    // that follows must not carry one, or the throw comes back.
    expect(asked.filter((mode) => mode === "quantizer")).toHaveLength(1);
    expect(asked.at(-1)).toBe("variable");
  });

  it("still offers Chrome the quantizer config first, then falls back to the bitrate", async () => {
    const asked: (string | undefined)[] = [];
    (globalThis as Record<string, unknown>).OffscreenCanvas = class {};
    (globalThis as Record<string, unknown>).VideoEncoder = {
      // Chrome 149: the enum exists, AVC just does not accept it yet.
      isConfigSupported: (config: VideoEncoderConfig) => {
        asked.push(config.bitrateMode);
        return Promise.resolve({ supported: config.bitrateMode !== "quantizer", config });
      },
    };
    await expect(canUseWebCodecs("960x720")).resolves.toBe(true);
    // The probe plus the real candidate: unchanged from before the Safari fix,
    // so a Chrome that ships AVC quantizer support still picks it up for free.
    expect(asked).toEqual(["quantizer", "quantizer", "variable"]);
  });
});
