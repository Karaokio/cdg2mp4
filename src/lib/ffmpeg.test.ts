import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the ffmpeg wrapper so no worker/wasm is involved; each test controls
// whether the core fetch or the instance load fails.
const loadMock = vi.fn();
vi.mock("@ffmpeg/ffmpeg", () => ({
  FFmpeg: class {
    load = loadMock;
  },
}));
vi.mock("@ffmpeg/util", () => ({ toBlobURL: vi.fn(async () => "blob:core-js") }));

import { convertCdgToMp4 } from "./ffmpeg";

const cdg = new Uint8Array([1]);
const mp3 = new Uint8Array([2]);

// A successful core fetch: raw (non-gzipped) wasm magic bytes.
const wasmResponse = () => ({
  ok: true,
  arrayBuffer: async () => new Uint8Array([0x00, 0x61, 0x73, 0x6d]).buffer,
});

beforeEach(() => {
  vi.restoreAllMocks();
  loadMock.mockReset();
  URL.createObjectURL ??= () => "blob:stub";
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:wasm");
});

describe("convertCdgToMp4 load failures", () => {
  it("wraps a network fetch failure in the download message, keeping the cause", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = await convertCdgToMp4(cdg, mp3).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/download the converter/i);
    expect(((err as Error).cause as Error).message).toBe("Failed to fetch");
    expect(((err as Error).cause as Error).name).toBe("TypeError");
  });

  it("wraps an HTTP error status in the download message, keeping the cause", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const err = await convertCdgToMp4(cdg, mp3).catch((e: unknown) => e as Error);
    expect((err as Error).message).toMatch(/download the converter/i);
    expect(((err as Error).cause as Error).message).toMatch(/converter core \(503\)/);
  });

  it("wraps a worker/wasm load failure in the load message, keeping the cause", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(wasmResponse()));
    loadMock.mockRejectedValue(new Error("worker crashed"));
    const err = await convertCdgToMp4(cdg, mp3).catch((e: unknown) => e as Error);
    expect((err as Error).message).toMatch(/load the converter/i);
    expect(((err as Error).cause as Error).message).toBe("worker crashed");
  });

  it("allows a retry after a failed load (does not stay busy or cache the rejection)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(convertCdgToMp4(cdg, mp3)).rejects.toThrow(/download/i);
    // Second attempt must fail the same way, not with the "already in progress" guard.
    await expect(convertCdgToMp4(cdg, mp3)).rejects.toThrow(/download/i);
  });
});
