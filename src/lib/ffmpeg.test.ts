import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the ffmpeg wrapper so no worker/wasm is involved; each test controls
// whether the core fetch, the instance load, or the exec fails.
const loadMock = vi.fn();
const execMock = vi.fn();
const terminateMock = vi.fn();
vi.mock("@ffmpeg/ffmpeg", () => ({
  FFmpeg: class {
    load = loadMock;
    exec = execMock;
    terminate = terminateMock;
    on = vi.fn();
    off = vi.fn();
    writeFile = vi.fn(async () => undefined);
    readFile = vi.fn(async () => new Uint8Array([1]));
    deleteFile = vi.fn(async () => undefined);
  },
}));
vi.mock("@ffmpeg/util", () => ({ toBlobURL: vi.fn(async () => "blob:core-js") }));

import { convertCdgToMp4, cancelConversion } from "./ffmpeg";

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
  execMock.mockReset();
  terminateMock.mockReset();
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

describe("cancelConversion", () => {
  it("is a no-op when nothing is in flight", () => {
    cancelConversion();
    expect(terminateMock).not.toHaveBeenCalled();
  });

  it("terminates the worker, rejecting the in-flight exec, and the next conversion reloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(wasmResponse()));
    loadMock.mockResolvedValue(undefined);
    let rejectExec!: (e: Error) => void;
    execMock.mockImplementationOnce(
      () =>
        new Promise((_, rej) => {
          rejectExec = rej;
        })
    );
    // Mirror the real wrapper: terminate() rejects every pending call.
    terminateMock.mockImplementation(() => rejectExec(new Error("called FFmpeg.terminate()")));

    const pending = convertCdgToMp4(cdg, mp3);
    await vi.waitFor(() => expect(execMock).toHaveBeenCalled());
    cancelConversion();
    await expect(pending).rejects.toThrow(/FFmpeg\.terminate/);
    expect(terminateMock).toHaveBeenCalledTimes(1);

    // The instance was discarded: a fresh conversion loads a new core and works.
    execMock.mockResolvedValue(0);
    await expect(convertCdgToMp4(cdg, mp3)).resolves.toBeInstanceOf(Uint8Array);
    expect(loadMock).toHaveBeenCalledTimes(2);
  });
});
