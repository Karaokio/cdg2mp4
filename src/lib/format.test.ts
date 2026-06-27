import { describe, it, expect } from "vitest";
import { RESOLUTIONS, resolutionToSize, clampProgress, formatLeft } from "./format";

describe("resolutionToSize", () => {
  it("maps each quality to its 4:3 size", () => {
    expect(resolutionToSize("480p")).toBe("640x480");
    expect(resolutionToSize("720p")).toBe("960x720");
    expect(resolutionToSize("1080p")).toBe("1440x1080");
  });

  it("covers every RESOLUTIONS key with a WxH value", () => {
    for (const k of Object.keys(RESOLUTIONS) as (keyof typeof RESOLUTIONS)[]) {
      expect(resolutionToSize(k)).toMatch(/^\d+x\d+$/);
    }
  });
});

describe("clampProgress", () => {
  it("clamps to the [0, 1] range", () => {
    expect(clampProgress(-0.5)).toBe(0);
    expect(clampProgress(0.42)).toBe(0.42);
    expect(clampProgress(1.3)).toBe(1);
  });
});

describe("formatLeft", () => {
  it("returns empty string for non-positive or non-finite input", () => {
    expect(formatLeft(0)).toBe("");
    expect(formatLeft(-5)).toBe("");
    expect(formatLeft(Infinity)).toBe("");
    expect(formatLeft(NaN)).toBe("");
  });

  it("rounds sub-minute estimates to 5s steps, with a 5s floor", () => {
    expect(formatLeft(3)).toBe("about 5s left");
    expect(formatLeft(22)).toBe("about 20s left");
    expect(formatLeft(47)).toBe("about 45s left");
  });

  it("formats minute-scale estimates", () => {
    expect(formatLeft(60)).toBe("about 1m left");
    expect(formatLeft(95)).toBe("about 1m 30s left");
    expect(formatLeft(120)).toBe("about 2m left");
    expect(formatLeft(130)).toBe("about 2m 15s left");
  });
});
